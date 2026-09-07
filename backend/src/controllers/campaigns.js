import Campaign from '../models/Campaign.js';
import Delivery from '../models/Delivery.js';
import User from '../models/User.js';
import {
  sendNewCampaignNotification,
  sendApplicationReceived,
  sendApplicationAccepted,
  sendCampaignInvitation,
} from '../services/email.js';
import { createDeliveryForCampaign } from './deliveries.js';
import { config } from '../config/index.js';
import { levelFor, badgesFor, isAmbassador } from '../utils/badges.js';
import { updateBrandStats } from '../utils/brandStats.js';
import logger from '../utils/logger.js';

const idOf = (c) => (c && c._id ? c._id : c)?.toString();

/**
 * Create new campaign
 */
export async function createCampaign(req, res) {
  try {
    const brand = req.user;

    if (!brand.canCreateCampaign()) {
      return res.status(403).json({
        error: 'Complétez votre profil et votre moyen de paiement avant de créer une campagne'
      });
    }

    const {
      title,
      description,
      videoType,
      duration,
      deliverables,
      requirements,
      budget,
      niches,
      applicationDeadline,
      deliveryTypes,
      platforms,
      creatorsWanted,
      productShipping,
      productDescription,
    } = req.body;

    // La date limite est prise en fin de journée (23:59:59)
    const deadline = new Date(applicationDeadline);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(applicationDeadline))) {
      deadline.setHours(23, 59, 59, 999);
    }

    const campaign = new Campaign({
      brandId: brand._id,
      title,
      description,
      brief: {
        videoType,
        duration,
        deliverables,
        requirements: requirements || [],
        deliveryTypes: deliveryTypes?.length ? deliveryTypes : ['file', 'link'],
        platforms: platforms || [],
        productShipping: !!productShipping,
        productDescription,
      },
      budget: budget
        ? { total: budget, perVideo: Math.round(budget / deliverables) }
        : {},
      matching: {
        niches,
        creatorsWanted: creatorsWanted || 1,
      },
      timeline: {
        applicationDeadline: deadline,
      },
      status: 'draft',
    });

    await campaign.save();

    logger.info(`Campaign created: ${campaign._id} by brand ${brand._id}`);

    res.status(201).json({
      message: 'Campaign created successfully',
      campaign,
    });
  } catch (error) {
    logger.error('Failed to create campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
}

/**
 * Publish campaign (draft → active)
 */
export async function publishCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const brand = req.user;

    const campaign = await Campaign.findOne({
      _id: campaignId,
      brandId: brand._id,
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'draft') {
      return res.status(400).json({ error: 'Campaign already published' });
    }

    campaign.status = 'active';
    campaign.timeline.publishedAt = new Date();
    await campaign.save();

    // Notify matching creators (en arrière-plan, sans bloquer la réponse)
    // Avec l'avant-première, seuls les ambassadeurs sont prévenus tout de suite ; les autres par la tâche planifiée
    const earlyAccess = config.badges.earlyAccessHours > 0;
    const matchingCreators = await User.find({
      role: 'creator',
      status: 'active',
      'preferences.emailNotifications': { $ne: false },
      'profile.niches': { $in: campaign.matching.niches },
      ...(earlyAccess && { 'profile.ambassador.status': 'approved' }),
    }).select('email profile.name').limit(100);
    campaign.set(earlyAccess ? 'notifications.ambassadorsNotifiedAt' : 'notifications.allNotifiedAt', new Date());
    await campaign.save();

    Promise.allSettled(
      matchingCreators.map(creator =>
        sendNewCampaignNotification(
          creator.email,
          creator.profile.name,
          campaign.title,
          campaign._id
        ).catch(err => logger.error('Failed to send notification:', err.message))
      )
    );

    logger.info(`Campaign published: ${campaign._id}, notifying ${matchingCreators.length} creators`);

    res.json({
      message: 'Campaign published successfully',
      campaign,
      notifiedCreators: matchingCreators.length,
    });
  } catch (error) {
    logger.error('Failed to publish campaign:', error);
    res.status(500).json({ error: 'Failed to publish campaign' });
  }
}

/**
 * Get campaigns (with filters)
 * Créateur : ?filter=available (défaut) | applied | selected | all
 * Marque : ses propres campagnes (?status=...)
 */
export async function getCampaigns(req, res) {
  try {
    const user = req.user;
    const { status, niche, minBudget, maxBudget, search, filter, page = 1, limit = 20 } = req.query;

    let query = {};

    // Role-based filtering
    if (user.role === 'brand') {
      query.brandId = user._id;
      if (status) query.status = status;
    } else if (user.role === 'creator') {
      const mode = filter || 'available';
      if (mode === 'applied') {
        query['applications.creatorId'] = user._id;
      } else if (mode === 'selected') {
        query.$or = [{ selectedCreators: user._id }, { selectedCreator: user._id }];
      } else if (mode === 'all') {
        query.status = { $in: ['active', 'in_progress', 'completed'] };
      } else {
        // Toutes les campagnes ouvertes ; celles des niches du créateur sont remontées en premier (tri plus bas)
        query.status = 'active';
        query['matching.excludedCreators'] = { $ne: user._id };
        // Accès anticipé : les non-ambassadeurs voient les campagnes après le délai d'avant-première
        const hours = config.badges.earlyAccessHours;
        if (hours > 0 && !isAmbassador(user)) {
          // sauf si le créateur a été invité par la marque
          query.$or = [
            { 'timeline.publishedAt': { $lte: new Date(Date.now() - hours * 3600 * 1000) } },
            { 'invitations.creatorId': user._id },
          ];
        }
      }
    } else if (status) {
      query.status = status;
    }

    // Additional filters
    if (niche) query['matching.niches'] = niche;
    if (minBudget || maxBudget) {
      query['budget.total'] = {};
      if (minBudget) query['budget.total'].$gte = parseInt(minBudget);
      if (maxBudget) query['budget.total'].$lte = parseInt(maxBudget);
    }
    if (search && String(search).trim()) {
      const regex = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const textFilter = { $or: [{ title: regex }, { description: regex }] };
      if (query.$or) { query.$and = [{ $or: query.$or }, textFilter]; delete query.$or; }
      else Object.assign(query, textFilter);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let [campaigns, total] = await Promise.all([
      Campaign.find(query)
        .populate('brandId', 'profile.companyName profile.avatar profile.stats.avgValidationDays profile.stats.avgResponseDays profile.stats.campaignsCompleted')
        .sort({ 'timeline.publishedAt': -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Campaign.countDocuments(query),
    ]);
    campaigns = campaigns.map(c => c.toObject({ virtuals: true }));

    // Pour un créateur : ajoute sa candidature (statut, prix) et la correspondance de niches à chaque campagne
    if (user.role === 'creator') {
      const myNiches = user.profile.niches || [];
      campaigns.forEach(c => {
        const mine = (c.applications || []).find(a => idOf(a.creatorId) === user._id.toString());
        c.myApplication = mine ? { status: mine.status, price: mine.price, appliedAt: mine.appliedAt } : null;
        c.isSelected = (c.selectedCreators || []).some(id => idOf(id) === user._id.toString()) || idOf(c.selectedCreator) === user._id.toString();
        c.matchesMyNiches = (c.matching?.niches || []).some(n => myNiches.includes(n));
        const hours = config.badges.earlyAccessHours;
        c.earlyAccess = hours > 0 && c.timeline?.publishedAt && (Date.now() - new Date(c.timeline.publishedAt).getTime()) < hours * 3600 * 1000;
        c.invited = (c.invitations || []).some(i => idOf(i.creatorId) === user._id.toString());
        delete c.applications; // ne pas exposer les autres candidatures
        delete c.invitations;
      });
      // Invitations, puis campagnes de mes niches, puis les plus récentes
      campaigns.sort((a, b) => (Number(b.invited) - Number(a.invited)) || (Number(b.matchesMyNiches) - Number(a.matchesMyNiches)));
    }

    res.json({
      campaigns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Failed to get campaigns:', error);
    res.status(500).json({ error: 'Failed to get campaigns' });
  }
}

/**
 * Get single campaign
 */
export async function getCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const user = req.user;

    const campaignDoc = await Campaign.findById(campaignId)
      .populate('brandId', 'profile.companyName profile.avatar profile.website profile.industry profile.stats.avgValidationDays profile.stats.avgResponseDays profile.stats.campaignsCompleted')
      .populate('applications.creatorId', 'profile.name profile.avatar profile.stats profile.niches profile.pricing profile.ambassador.status status')
      .populate('selectedCreator', 'profile.name profile.avatar')
      .populate('selectedCreators', 'profile.name profile.avatar');

    if (!campaignDoc) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    const campaign = campaignDoc.toObject({ virtuals: true });

    const isOwner = user.role === 'brand' && idOf(campaign.brandId) === user._id.toString();
    const isSelectedCreator = user.role === 'creator' && (
      (campaign.selectedCreators || []).some(c => idOf(c) === user._id.toString()) || idOf(campaign.selectedCreator) === user._id.toString()
    );
    const hasApplied = user.role === 'creator' && (campaign.applications || []).some(
      app => idOf(app.creatorId) === user._id.toString()
    );

    // Check access rights
    if (user.role === 'creator' && campaign.status !== 'active' && !isSelectedCreator && !hasApplied) {
      return res.status(403).json({ error: 'Campaign not available' });
    }
    const isInvited = user.role === 'creator' && (campaign.invitations || []).some(i => idOf(i.creatorId) === user._id.toString());
    if (user.role === 'creator' && campaign.status === 'active' && !hasApplied && !isInvited && !isAmbassador(user) && config.badges.earlyAccessHours > 0) {
      const openAt = new Date(campaign.timeline.publishedAt).getTime() + config.badges.earlyAccessHours * 3600 * 1000;
      if (Date.now() < openAt) {
        return res.status(403).json({ error: 'Cette campagne est en avant-première pour les Ambassadeurs. Elle sera ouverte à tous dans quelques heures.', earlyAccessUntil: new Date(openAt) });
      }
    }

    if (user.role === 'brand' && !isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Livraisons associées : toutes pour la marque, la sienne pour le créateur sélectionné
    if (isOwner) {
      const deliveries = await Delivery.find({ campaignId: campaign._id })
        .select('_id status payment.status payment.amount payment.stripePaymentIntentId creatorId')
        .populate('creatorId', 'profile.name')
        .lean();
      campaign.deliveries = deliveries;
      campaign.delivery = deliveries[0] || null;
      campaign.pendingPayments = deliveries.filter(d => d.payment?.stripePaymentIntentId && ['pending', 'failed'].includes(d.payment?.status));
      campaign.remainingSlots = Campaign.prototype.remainingSlots.call(campaign);
    } else if (isSelectedCreator) {
      const delivery = await Delivery.findOne({ campaignId: campaign._id, creatorId: user._id })
        .select('_id status payment.status')
        .lean();
      campaign.delivery = delivery || null;
    }

    // Add user-specific data
    if (user.role === 'creator') {
      campaign.userHasApplied = hasApplied;
      campaign.myApplication = (campaign.applications || []).find(
        app => idOf(app.creatorId) === user._id.toString()
      ) || null;
      campaign.isSelected = isSelectedCreator;
      campaign.invited = isInvited;
      campaign.canApply = Campaign.prototype.canApply.call(campaign, user._id) && user.canApplyToCampaign();
      campaign.applyBlockers = user.applyBlockers();
      // Ne pas exposer les autres candidatures aux créateurs
      delete campaign.applications;
      delete campaign.invitations;
    } else if (isOwner) {
      // Nettoie les candidatures dont le créateur a été supprimé
      campaign.applications = (campaign.applications || []).filter(a => a.creatorId);
      // Niveau / badges de chaque candidat, puis tri par score de matching décroissant
      campaign.applications.forEach(a => {
        if (a.creatorId?.profile) {
          a.creatorId.level = levelFor(a.creatorId.profile.stats);
          a.creatorId.badges = badgesFor(a.creatorId);
        }
      });
      campaign.applications.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    }

    res.json({ campaign });
  } catch (error) {
    logger.error('Failed to get campaign:', error);
    res.status(500).json({ error: 'Failed to get campaign' });
  }
}

/**
 * Score de matching (0-100) entre un créateur et une campagne
 * niches 50% · budget 25% · note 15% · réactivité 10%
 */
function computeMatchScore(campaign, creator, price) {
  const niches = campaign.matching.niches || [];
  const nicheMatch = niches.length
    ? niches.filter(n => (creator.profile.niches || []).includes(n)).length / niches.length
    : 0;

  const perVideo = campaign.budget?.perVideo || 0;
  const askedPerVideo = price / (campaign.brief.deliverables || 1);
  let budgetFit = 1; // sans budget annoncé, le critère est neutre
  if (perVideo > 0 && askedPerVideo > perVideo) {
    budgetFit = Math.max(0, 1 - (askedPerVideo - perVideo) / perVideo);
  }

  const rating = creator.profile.stats?.rating || 0;
  const ratingScore = creator.profile.stats?.totalReviews ? rating / 5 : 0.6; // nouveau créateur : neutre

  const hours = creator.profile.stats?.responseTimeHours;
  const responseScore = hours == null ? 0.6 : Math.max(0, 1 - hours / 72);

  return Math.round((nicheMatch * 0.5 + budgetFit * 0.25 + ratingScore * 0.15 + responseScore * 0.1) * 100);
}

/**
 * Apply to campaign (creator)
 */
export async function applyToCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const { proposal, price, estimatedDeliveryDays, rights, deliveryTypes, platforms, revisions, terms } = req.body;
    const creator = req.user;

    if (!creator.canApplyToCampaign()) {
      return res.status(403).json({
        error: creator.applyBlockers().join(' ') || 'Complétez votre profil et votre portfolio avant de candidater',
        blockers: creator.applyBlockers(),
      });
    }

    const campaign = await Campaign.findById(campaignId)
      .populate('brandId', 'email profile.companyName profile.name');

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (!campaign.canApply(creator._id)) {
      return res.status(400).json({ error: 'Vous ne pouvez pas (ou plus) candidater à cette campagne' });
    }

    const matchScore = computeMatchScore(campaign, creator, price);

    campaign.applications.push({
      creatorId: creator._id,
      proposal,
      price,
      estimatedDeliveryDays,
      matchScore,
      status: 'pending',
      quote: {
        version: 1,
        updatedAt: new Date(),
        rights,
        deliveryTypes,
        platforms: platforms?.length ? platforms : campaign.brief.platforms,
        revisions,
        terms,
        history: [],
      },
    });

    campaign.analytics.applications = (campaign.analytics.applications || 0) + 1;
    const scores = campaign.applications.map(a => a.matchScore || 0);
    campaign.analytics.avgMatchScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    await campaign.save();

    // Notify brand (non bloquant)
    sendApplicationReceived(
      campaign.brandId.email,
      campaign.brandId.profile.companyName || campaign.brandId.profile.name,
      creator.profile.name,
      campaign.title
    ).catch(err => logger.error('Failed to send notification:', err.message));

    logger.info(`Creator ${creator._id} applied to campaign ${campaign._id} (match ${matchScore}%)`);

    res.status(201).json({
      message: 'Application submitted successfully',
      application: campaign.applications[campaign.applications.length - 1],
    });
  } catch (error) {
    logger.error('Failed to apply to campaign:', error);
    res.status(500).json({ error: 'Failed to apply to campaign' });
  }
}

/**
 * Met à jour le devis d'une candidature (créateur), tant qu'elle n'est pas acceptée
 */
export async function updateQuote(req, res) {
  try {
    const { campaignId } = req.params;
    const creator = req.user;
    const { proposal, price, estimatedDeliveryDays, rights, deliveryTypes, platforms, revisions, terms } = req.body;

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const application = campaign.applications.find(a => idOf(a.creatorId) === creator._id.toString());
    if (!application) return res.status(404).json({ error: 'Vous n\'avez pas candidaté à cette campagne' });
    if (application.status !== 'pending') {
      return res.status(400).json({ error: 'Le devis ne peut plus être modifié (candidature acceptée ou refusée)' });
    }
    if (campaign.status !== 'active') {
      return res.status(400).json({ error: 'La campagne n\'accepte plus de modifications' });
    }

    // Archive la version précédente
    application.quote = application.quote || { version: 1, history: [] };
    application.quote.history = application.quote.history || [];
    application.quote.history.push({
      version: application.quote.version || 1,
      price: application.price,
      estimatedDeliveryDays: application.estimatedDeliveryDays,
      rights: application.quote.rights ? application.quote.rights.toObject?.() || application.quote.rights : undefined,
      terms: application.quote.terms,
      savedAt: application.quote.updatedAt || application.appliedAt,
    });

    application.proposal = proposal ?? application.proposal;
    application.price = price;
    application.estimatedDeliveryDays = estimatedDeliveryDays;
    application.matchScore = computeMatchScore(campaign, creator, price);
    application.quote.version = (application.quote.version || 1) + 1;
    application.quote.updatedAt = new Date();
    application.quote.rights = rights;
    application.quote.deliveryTypes = deliveryTypes;
    application.quote.platforms = platforms?.length ? platforms : campaign.brief.platforms;
    application.quote.revisions = revisions;
    application.quote.terms = terms;

    await campaign.save();

    logger.info(`Quote updated (v${application.quote.version}) by creator ${creator._id} on campaign ${campaign._id}`);

    res.json({ message: 'Devis mis à jour', application });
  } catch (error) {
    logger.error('Failed to update quote:', error);
    res.status(500).json({ error: 'Failed to update quote' });
  }
}

/**
 * Select creator for campaign (brand)
 * Crée automatiquement la livraison et l'autorisation de paiement Stripe.
 */
export async function selectCreator(req, res) {
  try {
    const { campaignId, creatorId } = req.params;
    const brand = req.user;

    const campaign = await Campaign.findOne({
      _id: campaignId,
      brandId: brand._id,
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.remainingSlots() === 0) {
      return res.status(400).json({ error: 'Tous les créateurs recherchés ont déjà été sélectionnés' });
    }
    if ((campaign.selectedCreators || []).some(id => idOf(id) === creatorId)) {
      return res.status(400).json({ error: 'Ce créateur est déjà sélectionné' });
    }

    if (campaign.status !== 'active') {
      return res.status(400).json({ error: 'La campagne doit être publiée pour sélectionner un créateur' });
    }

    const application = campaign.applications.find(
      app => idOf(app.creatorId) === creatorId
    );

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const creator = await User.findById(creatorId).select('email profile.name stripeAccountId profile.stripeConnect');
    if (!creator) {
      return res.status(404).json({ error: 'Creator not found' });
    }

    campaign.selectCreator(creatorId);
    if (application.quote) application.quote.acceptedAt = new Date();
    await campaign.save();
    updateBrandStats(brand._id);

    // Crée la livraison + autorisation de paiement
    let delivery = null;
    let paymentWarning = null;
    let clientSecret = null;
    try {
      const result = await createDeliveryForCampaign(campaign, brand, application.price, creatorId);
      delivery = result.delivery;
      paymentWarning = result.warning || null;
      clientSecret = result.clientSecret || null;
    } catch (err) {
      logger.error('Delivery creation failed after selection:', err);
      paymentWarning = `Le créateur est sélectionné mais le paiement n'a pas pu être initialisé : ${err.message}`;
    }

    // Notify creator (non bloquant)
    sendApplicationAccepted(
      creator.email,
      creator.profile.name,
      campaign.title,
      campaign._id
    ).catch(err => logger.error('Failed to send notification:', err.message));

    logger.info(`Creator ${creatorId} selected for campaign ${campaign._id}`);

    res.json({
      message: 'Creator selected successfully',
      campaign,
      delivery,
      clientSecret,
      paymentRequired: !!delivery && delivery.payment.status === 'pending' && !!delivery.payment.stripePaymentIntentId,
      remainingSlots: campaign.remainingSlots(),
      warning: paymentWarning,
    });
  } catch (error) {
    logger.error('Failed to select creator:', error);
    res.status(500).json({ error: 'Failed to select creator' });
  }
}

/**
 * Update campaign
 */
export async function updateCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const brand = req.user;
    const updates = req.body;

    const campaign = await Campaign.findOne({
      _id: campaignId,
      brandId: brand._id,
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'draft') {
      return res.status(400).json({
        error: 'Cannot update published campaign'
      });
    }

    // Update allowed fields
    const allowedFields = [
      'title', 'description', 'brief', 'budget',
      'matching', 'timeline'
    ];

    allowedFields.forEach(field => {
      if (updates[field] === undefined) return;
      if (typeof updates[field] === 'object' && !Array.isArray(updates[field])) {
        Object.entries(updates[field]).forEach(([k, v]) => campaign.set(`${field}.${k}`, v));
      } else {
        campaign.set(field, updates[field]);
      }
    });

    if (campaign.budget?.total && campaign.brief?.deliverables) {
      campaign.budget.perVideo = Math.round(campaign.budget.total / campaign.brief.deliverables);
    }

    await campaign.save();

    logger.info(`Campaign updated: ${campaign._id}`);

    res.json({
      message: 'Campaign updated successfully',
      campaign,
    });
  } catch (error) {
    logger.error('Failed to update campaign:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
}

/**
 * Cancel campaign
 */
export async function cancelCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const brand = req.user;

    const campaign = await Campaign.findOne({
      _id: campaignId,
      brandId: brand._id,
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.selectedCreator || campaign.selectedCreators?.length) {
      return res.status(400).json({
        error: 'Impossible d\'annuler une campagne avec un créateur sélectionné'
      });
    }

    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      return res.status(400).json({ error: 'Campagne déjà terminée ou annulée' });
    }

    campaign.status = 'cancelled';
    await campaign.save();

    logger.info(`Campaign cancelled: ${campaign._id}`);

    res.json({
      message: 'Campaign cancelled successfully',
      campaign,
    });
  } catch (error) {
    logger.error('Failed to cancel campaign:', error);
    res.status(500).json({ error: 'Failed to cancel campaign' });
  }
}

/**
 * Invite un créateur à candidater sur une campagne ouverte (marque)
 */
export async function inviteCreator(req, res) {
  try {
    const { campaignId, creatorId } = req.params;
    const brand = req.user;
    const message = req.body?.message || '';

    const campaign = await Campaign.findOne({ _id: campaignId, brandId: brand._id });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status !== 'active') return res.status(400).json({ error: 'La campagne doit être publiée pour inviter un créateur' });

    const creator = await User.findOne({ _id: creatorId, role: 'creator', status: 'active' }).select('email profile.name');
    if (!creator) return res.status(404).json({ error: 'Créateur introuvable' });

    if (campaign.invitations.some(i => idOf(i.creatorId) === creatorId)) {
      return res.status(400).json({ error: 'Ce créateur a déjà été invité sur cette campagne' });
    }
    if (campaign.applications.some(a => idOf(a.creatorId) === creatorId)) {
      return res.status(400).json({ error: 'Ce créateur a déjà candidaté' });
    }

    campaign.invitations.push({ creatorId, message });
    await campaign.save();

    sendCampaignInvitation(creator.email, creator.profile.name, brand.profile.companyName || brand.profile.name, campaign.title, campaign._id, message)
      .catch(err => logger.error('Invitation email failed:', err.message));

    logger.info(`Creator ${creatorId} invited to campaign ${campaign._id}`);
    res.json({ message: `${creator.profile.name} a été invité(e) par email`, invitations: campaign.invitations.length });
  } catch (error) {
    logger.error('Failed to invite creator:', error);
    res.status(500).json({ error: 'Failed to invite creator' });
  }
}

/**
 * Paiement groupé : SetupIntent pour enregistrer la carte de la marque
 */
export async function createPaymentSetup(req, res) {
  try {
    const brand = req.user;
    const campaign = await Campaign.findOne({ _id: req.params.campaignId, brandId: brand._id });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!brand.stripeCustomerId) return res.status(400).json({ error: 'Aucun client Stripe' });
    const pending = await Delivery.find({ campaignId: campaign._id, 'payment.status': { $in: ['pending', 'failed'] }, 'payment.stripePaymentIntentId': { $exists: true } })
      .select('payment.amount').lean();
    const { createSetupIntent } = await import('../services/stripe.js');
    const setupIntent = await createSetupIntent(brand.stripeCustomerId);
    res.json({
      clientSecret: setupIntent.client_secret,
      count: pending.length,
      total: pending.reduce((a, d) => a + (d.payment.amount || 0), 0),
    });
  } catch (error) {
    logger.error('Failed to create payment setup:', error);
    res.status(500).json({ error: 'Impossible de préparer le paiement groupé' });
  }
}

/**
 * Paiement groupé : confirme tous les paiements en attente de la campagne avec la carte enregistrée
 */
export async function payAllPending(req, res) {
  try {
    const brand = req.user;
    const { paymentMethodId } = req.body;
    if (!paymentMethodId) return res.status(400).json({ error: 'paymentMethodId manquant' });
    const campaign = await Campaign.findOne({ _id: req.params.campaignId, brandId: brand._id });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const pending = await Delivery.find({ campaignId: campaign._id, 'payment.status': { $in: ['pending', 'failed'] }, 'payment.stripePaymentIntentId': { $exists: true } });
    const { confirmWithPaymentMethod } = await import('../services/stripe.js');
    const results = [];
    for (const d of pending) {
      try {
        const pi = await confirmWithPaymentMethod(d.payment.stripePaymentIntentId, paymentMethodId);
        if (['requires_capture', 'succeeded'].includes(pi.status)) {
          d.payment.status = pi.status === 'succeeded' ? 'captured' : 'held';
          d.payment.heldAt = new Date();
          await d.save();
          results.push({ deliveryId: d._id, ok: true });
        } else {
          results.push({ deliveryId: d._id, ok: false, status: pi.status });
        }
      } catch (err) {
        d.payment.status = 'failed';
        await d.save();
        results.push({ deliveryId: d._id, ok: false, error: err?.raw?.message || err.message });
      }
    }
    const paid = results.filter(r => r.ok).length;
    logger.info(`Grouped payment on campaign ${campaign._id}: ${paid}/${results.length} confirmed`);
    res.json({ message: `${paid} paiement(s) confirmé(s) sur ${results.length}`, paid, results });
  } catch (error) {
    logger.error('Failed to pay all:', error);
    res.status(500).json({ error: 'Échec du paiement groupé' });
  }
}
