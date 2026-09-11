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
import { getMaxRevisions } from '../models/Setting.js';
import { levelFor, badgesFor, isAmbassador } from '../utils/badges.js';
import { updateBrandStats } from '../utils/brandStats.js';
import logger from '../utils/logger.js';

const idOf = (c) => (c && c._id ? c._id : c)?.toString();

/**
 * Règles Pro / gifting / limites progressives. Retourne un message d'erreur ou null.
 */
async function checkCampaignRules(brand, { type, creatorsWanted, deliverables, giftingProductValue }, excludeCampaignId = null) {
  const pro = brand.isPro();
  if ((creatorsWanted || 1) > 1 && !pro) {
    return 'Les campagnes multi-créateurs sont réservées à l\'abonnement Pro.';
  }
  if (type === 'gifting') {
    if (!pro) return 'Les campagnes gifting (produit offert) sont réservées à l\'abonnement Pro.';
    if (!giftingProductValue || giftingProductValue < config.gifting.minProductValue) {
      return `La valeur du produit offert doit être d'au moins ${config.gifting.minProductValue} €.`;
    }
    if ((deliverables || 1) > config.gifting.maxDeliverables) {
      return `Une campagne gifting est limitée à ${config.gifting.maxDeliverables} vidéo(s).`;
    }
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const q = { brandId: brand._id, type: 'gifting', createdAt: { $gte: monthStart }, status: { $ne: 'cancelled' } };
    if (excludeCampaignId) q._id = { $ne: excludeCampaignId };
    const count = await Campaign.countDocuments(q);
    if (count >= config.gifting.maxPerMonth) {
      return `Vous avez atteint la limite de ${config.gifting.maxPerMonth} campagnes gifting par mois.`;
    }
  }
  return null;
}

/**
 * Marque "établie" = au moins une campagne terminée (les limites progressives ne s'appliquent plus)
 */
export async function isEstablishedBrand(brand) {
  if (brand.isPro() && brand.subscription?.status === 'active') return true;
  return (await Campaign.countDocuments({ brandId: brand._id, status: 'completed' })) > 0;
}

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
      type = 'paid',
      giftingProductName,
      giftingProductValue,
    } = req.body;

    const gate = await checkCampaignRules(brand, { type, creatorsWanted, deliverables, giftingProductValue });
    if (gate) return res.status(403).json({ error: gate });

    // La date limite est prise en fin de journée (23:59:59)
    const deadline = new Date(applicationDeadline);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(applicationDeadline))) {
      deadline.setHours(23, 59, 59, 999);
    }

    // Commission (Pro ou standard) ; parrainage → réduction sur le prix payé par la marque, une campagne
    const platformFeePercent = brand.isPro() ? config.plans.proFeePercent : config.stripe.platformFeePercent;
    let brandDiscountPercent = 0;
    if ((brand.referral?.discountedCampaignsLeft || 0) > 0) {
      const own = brand.referral.rewards?.find(r => r.type === 'brand_discount');
      brandDiscountPercent = own?.amount ?? config.referral.brandDiscountPercent;
      brand.set('referral.discountedCampaignsLeft', brand.referral.discountedCampaignsLeft - 1);
      await brand.save();
    }

    const campaign = new Campaign({
      brandId: brand._id,
      platformFeePercent,
      brandDiscountPercent,
      type,
      gifting: type === 'gifting' ? { productName: giftingProductName || productDescription, productValue: giftingProductValue } : undefined,
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
      budget: budget && type !== 'gifting'
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

    if (!brand.isBusinessVerified()) {
      return res.status(403).json({
        error: 'Vérifiez votre entreprise (SIRET ou TVA) dans votre profil avant de publier une campagne.',
        code: 'BUSINESS_NOT_VERIFIED',
      });
    }
    if (!(await isEstablishedBrand(brand))) {
      const open = await Campaign.countDocuments({ brandId: brand._id, status: { $in: ['active', 'in_progress'] } });
      if (open >= config.limits.newBrandOpenCampaigns) {
        return res.status(403).json({
          error: `Nouvelle marque : ${config.limits.newBrandOpenCampaigns} campagnes ouvertes maximum tant qu'aucune campagne n'est terminée.`,
          code: 'LIMIT_OPEN_CAMPAIGNS',
        });
      }
    }
    const gate = await checkCampaignRules(brand, { type: campaign.type, creatorsWanted: campaign.matching?.creatorsWanted, deliverables: campaign.brief?.deliverables, giftingProductValue: campaign.gifting?.productValue }, campaign._id);
    if (gate) return res.status(403).json({ error: gate });

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
        if (!user.acceptsGifting(levelFor(user.profile?.stats))) query.type = { $ne: 'gifting' };
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
      // Performances cumulées des vidéos livrées
      const perf = await Delivery.find({ campaignId: campaign._id, 'performance.0': { $exists: true } }).select('performance creatorId').populate('creatorId', 'profile.name').lean();
      const totals = { views: 0, likes: 0, comments: 0, shares: 0, videos: 0 };
      const byCreator = [];
      for (const d of perf) {
        const t = { creator: d.creatorId?.profile?.name, deliveryId: d._id, views: 0, likes: 0, comments: 0, shares: 0, videos: d.performance.length };
        for (const p of d.performance) { for (const k of ['views', 'likes', 'comments', 'shares']) { t[k] += p[k] || 0; totals[k] += p[k] || 0; } totals.videos++; }
        byCreator.push(t);
      }
      const spent = deliveries.filter(d => ['approved', 'auto_approved'].includes(d.status)).reduce((a, d) => a + (d.payment?.amount || 0), 0);
      campaign.performance = { totals, byCreator, spent, costPerThousandViews: totals.views ? Math.round((spent / totals.views) * 1000 * 100) / 100 : null };
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

  const base = Math.round((nicheMatch * 0.5 + budgetFit * 0.25 + ratingScore * 0.15 + responseScore * 0.1) * 100);
  // Ambassadeur : mis en avant auprès des marques (+5 points, plafonné à 100)
  const bonus = creator.profile.ambassador?.status === 'approved' ? config.badges.ambassadorMatchBonus : 0;
  return Math.min(100, base + bonus);
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

    let finalPrice = price;
    if (campaign.type === 'gifting') {
      if (!creator.acceptsGifting(levelFor(creator.profile?.stats))) {
        return res.status(403).json({ error: 'Vous avez désactivé les campagnes gifting dans votre profil' });
      }
      finalPrice = 0; // produit offert, pas de rémunération
    } else if (price < config.business.minQuotePrice) {
      return res.status(400).json({ error: `Le prix minimum est de ${config.business.minQuotePrice} €` });
    }

    const matchScore = computeMatchScore(campaign, creator, finalPrice);

    campaign.applications.push({
      creatorId: creator._id,
      proposal,
      price: finalPrice,
      estimatedDeliveryDays,
      matchScore,
      status: 'pending',
      quote: {
        version: 1,
        updatedAt: new Date(),
        rights,
        deliveryTypes,
        platforms: platforms?.length ? platforms : campaign.brief.platforms,
        revisions: revisions ?? await getMaxRevisions(),
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
      campaign.title,
      creator.profile.ambassador?.status === 'approved'
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
    application.price = campaign.type === 'gifting' ? 0 : price;
    if (campaign.type !== 'gifting' && price < config.business.minQuotePrice) return res.status(400).json({ error: `Le prix minimum est de ${config.business.minQuotePrice} €` });
    application.estimatedDeliveryDays = estimatedDeliveryDays;
    application.matchScore = computeMatchScore(campaign, creator, price);
    application.quote.version = (application.quote.version || 1) + 1;
    application.quote.updatedAt = new Date();
    application.quote.rights = rights;
    application.quote.deliveryTypes = deliveryTypes;
    application.quote.platforms = platforms?.length ? platforms : campaign.brief.platforms;
    application.quote.revisions = revisions ?? await getMaxRevisions();
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

    if (!brand.hasLegalInfo()) {
      return res.status(403).json({ code: 'LEGAL_INFO_REQUIRED', error: 'Indiquez le nom du signataire dans vos informations administratives (profil) avant d\'accepter un devis : il figure sur le contrat de mission.' });
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
    const u = req.body;

    const campaign = await Campaign.findOne({
      _id: campaignId,
      brandId: brand._id,
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'draft') {
      return res.status(400).json({
        error: 'Seule une campagne en brouillon peut être modifiée'
      });
    }

    if (u.title !== undefined) campaign.title = u.title;
    if (u.description !== undefined) campaign.description = u.description;
    if (u.videoType !== undefined) campaign.brief.videoType = u.videoType;
    if (u.duration !== undefined) campaign.brief.duration = u.duration;
    if (u.deliverables !== undefined) campaign.brief.deliverables = u.deliverables;
    if (u.requirements !== undefined) campaign.brief.requirements = u.requirements;
    if (u.deliveryTypes !== undefined) campaign.brief.deliveryTypes = u.deliveryTypes;
    if (u.platforms !== undefined) campaign.brief.platforms = u.platforms;
    if (u.productShipping !== undefined) campaign.brief.productShipping = u.productShipping;
    if (u.productDescription !== undefined) campaign.brief.productDescription = u.productDescription;
    if (u.niches !== undefined) campaign.matching.niches = u.niches;
    if (u.creatorsWanted !== undefined) campaign.matching.creatorsWanted = u.creatorsWanted;
    if (u.applicationDeadline !== undefined) {
      const deadline = new Date(u.applicationDeadline);
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(u.applicationDeadline))) deadline.setHours(23, 59, 59, 999);
      campaign.timeline.applicationDeadline = deadline;
    }
    if (u.type !== undefined) campaign.type = u.type;
    if (u.giftingProductName !== undefined) campaign.set('gifting.productName', u.giftingProductName);
    if (u.giftingProductValue !== undefined) campaign.set('gifting.productValue', u.giftingProductValue);
    const gate = await checkCampaignRules(brand, { type: campaign.type, creatorsWanted: campaign.matching?.creatorsWanted, deliverables: campaign.brief?.deliverables, giftingProductValue: campaign.gifting?.productValue }, campaign._id);
    if (gate) return res.status(403).json({ error: gate });
    if (campaign.type === 'gifting') campaign.budget = {};
    if (u.budget !== undefined) {
      if (u.budget === null || u.budget === '') {
        campaign.budget = {};
      } else {
        campaign.budget.total = u.budget;
      }
    }
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
    brand.rollUsage();
    if (!(await isEstablishedBrand(brand)) && (brand.usage.invitesToday || 0) >= config.limits.newBrandInvitesPerDay) {
      return res.status(429).json({ error: `Nouvelle marque : ${config.limits.newBrandInvitesPerDay} invitations par jour maximum tant qu'aucune campagne n'est terminée.` });
    }
    brand.usage.invitesToday = (brand.usage.invitesToday || 0) + 1;
    await brand.save();
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
