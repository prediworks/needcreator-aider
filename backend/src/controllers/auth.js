import User from '../models/User.js';
import { config } from '../config/index.js';
import {
  createCustomer,
  createConnectAccount,
  createAccountLink,
  getAccountStatus,
} from '../services/stripe.js';
import { resolveUrlsIn } from '../services/storage.js';
import { levelFor, badgesFor, nextLevelHint } from '../utils/badges.js';
import Delivery from '../models/Delivery.js';
import { evaluateBusiness, isFreeEmail, lookupRegistry } from '../utils/business.js';
import { getSetting, SETTINGS } from '../models/Setting.js';
import { planInfo } from './billing.js';
import { sendCreatorWelcome, sendBrandWelcome } from '../services/email.js';
import logger from '../utils/logger.js';

/**
 * Sérialise un utilisateur pour le frontend (ajoute id, complétion, blocages)
 */
async function serializeUser(userDoc) {
  const user = userDoc.toObject ? userDoc.toObject() : userDoc;
  const out = {
    ...user,
    id: user._id,
    profileCompletion: userDoc.profileCompletion ?? user.profileCompletion,
  };
  if (out.integrations?.shopify) out.integrations = { shopify: { shop: out.integrations.shopify.shop, installedAt: out.integrations.shopify.installedAt, connected: !!user.integrations?.shopify?.accessToken } };
  if (user.role === 'brand') {
    userDoc.rollUsage?.();
    out.plan = planInfo(userDoc);
    out.aiBriefsUsed = userDoc.usage?.aiBriefCount || 0;
    out.businessVerified = userDoc.isBusinessVerified?.() || false;
    out.isPro = userDoc.isPro?.() || false;
  }
  if (user.role === 'creator') {
    out.acceptsGifting = userDoc.acceptsGifting?.(levelFor(user.profile?.stats));
  }
  out.referral = {
    code: user.referral?.code,
    discountedCampaignsLeft: user.referral?.discountedCampaignsLeft || 0,
    rewardsTotal: (user.referral?.rewards || []).filter(r => r.type === 'creator_bonus').reduce((a, r) => a + (r.amount || 0), 0),
  };
  if (user.role === 'creator') {
    out.level = levelFor(user.profile?.stats);
    out.badges = badgesFor(user);
    out.nextLevel = nextLevelHint(user.profile?.stats);
    out.applyBlockers = typeof userDoc.applyBlockers === 'function' ? userDoc.applyBlockers() : [];
    out.canApply = typeof userDoc.canApplyToCampaign === 'function' ? userDoc.canApplyToCampaign() : false;
    if (user.profile?.portfolio?.length) {
      out.profile = { ...user.profile, portfolio: await resolveUrlsIn(user.profile.portfolio) };
    }
  }
  return out;
}

/**
 * Rattache un nouvel utilisateur à son parrain (code de parrainage) et attribue les avantages marque
 */
async function applyReferral(user, referralCode) {
  if (!referralCode) return;
  const referrer = await User.findOne({ 'referral.code': String(referralCode).trim().toUpperCase() });
  if (!referrer || referrer.role !== user.role) {
    logger.warn(`Referral code ignored (${referralCode}): introuvable ou rôle différent`);
    return;
  }
  user.set('referral.referredBy', referrer._id);
  user.set('referral.referredAt', new Date());
  if (user.role === 'brand') {
    // Marque parrainée : commission réduite sur sa première campagne ; marraine : sur sa prochaine campagne
    user.set('referral.discountedCampaignsLeft', 1);
    user.referral.rewards.push({ type: 'brand_discount', amount: config.referral.brandFeePercent, description: 'Commission réduite sur votre première campagne (parrainage)', sourceUserId: referrer._id });
    referrer.set('referral.discountedCampaignsLeft', (referrer.referral?.discountedCampaignsLeft || 0) + 1);
    referrer.referral.rewards.push({ type: 'brand_discount', amount: config.referral.referrerBrandFeePercent, description: `Commission réduite sur votre prochaine campagne (parrainage de ${user.profile.companyName})`, sourceUserId: user._id });
    await referrer.save();
  }
  logger.info(`User ${user._id} referred by ${referrer._id}`);
}

/**
 * Register new creator
 */
export async function registerCreator(req, res) {
  try {
    const { email, name, bio, niches, minPrice, referralCode } = req.body;
    const { uid } = req.firebaseUser;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ firebaseUid: uid }, { email: email.toLowerCase() }] });
    if (existingUser) {
      return res.status(400).json({ error: 'Un compte existe déjà avec cet email' });
    }

    // Create user without Stripe Connect account — the creator will connect later
    const user = new User({
      firebaseUid: uid,
      email,
      role: 'creator',
      profile: {
        name,
        bio,
        niches,
        pricing: {
          minPrice,
          avgPrice: minPrice,
        },
        stripeConnect: {
          accountId: null,
          onboardingComplete: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          requirements: {},
        },
      },
      status: 'pending', // Needs admin approval
    });

    user.ensureReferralCode();
    await applyReferral(user, referralCode);
    await user.save();

    // Send welcome email (non bloquant)
    sendCreatorWelcome(email, name).catch(err =>
      logger.error('Failed to send welcome email:', err.message)
    );

    logger.info(`Creator registered: ${user._id}`);

    res.status(201).json({
      message: 'Creator account created successfully',
      user: await serializeUser(user),
    });
  } catch (error) {
    logger.error('Creator registration failed:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
}

/**
 * Register new brand
 */
export async function registerBrand(req, res) {
  try {
    logger.info('Brand registration started', {
      email: req.body.email,
      firebaseUid: req.firebaseUser?.uid
    });

    const { email, companyName, website, industry, referralCode } = req.body;
    const { uid } = req.firebaseUser;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ firebaseUid: uid }, { email: email.toLowerCase() }] });
    if (existingUser) {
      logger.warn('User already exists', { firebaseUid: uid });
      return res.status(400).json({ error: 'Un compte existe déjà avec cet email' });
    }

    // Create Stripe customer
    const stripeCustomer = await createCustomer(email, companyName);

    // Create user
    const user = new User({
      firebaseUid: uid,
      email,
      role: 'brand',
      profile: {
        name: companyName,
        companyName,
        website,
        industry,
      },
      stripeCustomerId: stripeCustomer.id,
      status: 'active', // Brands are active immediately
      // Essai Pro offert à l'inscription (sans carte)
      subscription: config.plans.proTrialDays > 0 ? {
        plan: 'pro', status: 'trialing',
        trialEndsAt: new Date(Date.now() + config.plans.proTrialDays * 86400000),
      } : undefined,
    });

    user.ensureReferralCode();
    await applyReferral(user, referralCode);
    await user.save();

    logger.info(`Brand user saved to database: ${user._id}`);

    // Send welcome email (non bloquant)
    sendBrandWelcome(email, companyName).catch(err =>
      logger.error('Failed to send welcome email:', err.message)
    );

    logger.info(`Brand registered successfully: ${user._id}`);

    res.status(201).json({
      message: 'Brand account created successfully',
      user: await serializeUser(user),
    });
  } catch (error) {
    logger.error('Brand registration failed:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
}

/**
 * Get current user profile or public profile by ID
 */
export async function getProfile(req, res) {
  try {
    const { userId } = req.params;

    // If userId is provided, get public profile
    if (userId) {
      const user = await User.findById(userId)
        .select('profile role status createdAt')
        .lean();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Ne pas exposer les infos Stripe
      if (user.profile?.stripeConnect) delete user.profile.stripeConnect;
      if (user.role === 'creator') {
        user.level = levelFor(user.profile?.stats);
        user.badges = badgesFor(user);
      }
      if (user.profile?.portfolio?.length) {
        user.profile.portfolio = await resolveUrlsIn(user.profile.portfolio);
      }

      return res.json({ user: { ...user, id: user._id } });
    }

    // Otherwise get current user's full profile
    const user = await User.findById(req.user._id).select('-__v');

    res.json({ user: await serializeUser(user) });
  } catch (error) {
    logger.error('Failed to get profile:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
}

/**
 * Aplatis un objet imbriqué en clés "a.b.c" (pour user.set)
 */
function flatten(obj, prefix = '', out = {}) {
  Object.entries(obj || {}).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      flatten(value, path, out);
    } else {
      out[path] = value;
    }
  });
  return out;
}

/**
 * Update user profile
 * Accepte { profile: { name, bio, ... } } ou { 'profile.name': ... }
 */
export async function updateProfile(req, res) {
  try {
    const { socials: _s, realisations: _r, ...rest } = req.body;
    const updates = flatten(rest);
    const user = req.user;
    let applied = 0;

    const allowedFields = user.role === 'creator'
      ? [
          'profile.name',
          'profile.bio',
          'profile.avatar',
          'profile.niches',
          'profile.pricing.minPrice',
          'profile.pricing.avgPrice',
          'profile.address.name', 'profile.address.line1', 'profile.address.line2', 'profile.address.postalCode',
          'profile.address.city', 'profile.address.country', 'profile.address.phone',
          'preferences.emailNotifications',
          'preferences.language',
        ]
      : [
          'profile.name',
          'profile.companyName',
          'profile.website',
          'profile.industry',
          'profile.avatar',
          'profile.companySize',
          'preferences.emailNotifications',
          'preferences.language',
        ];
    if (user.role === 'creator') allowedFields.push('preferences.acceptGifting');

    // Tableaux remplacés en bloc (réseaux sociaux, réalisations externes)
    if (user.role === 'creator' && Array.isArray(req.body.socials)) {
      const networks = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'other'];
      user.set('profile.socials', req.body.socials
        .filter(sn => sn && networks.includes(sn.network) && /^https?:\/\//.test(sn.url || ''))
        .slice(0, 10)
        .map(sn => ({ network: sn.network, url: sn.url, handle: sn.handle, followers: Number(sn.followers) || 0, avgViews: Number(sn.avgViews) || 0, updatedAt: new Date() })));
      user.set('profile.stats.totalFollowers', user.profile.socials.reduce((a, sn) => a + (sn.followers || 0), 0));
      applied++;
    }
    if (user.role === 'creator' && Array.isArray(req.body.realisations)) {
      const platforms = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'website', 'other'];
      user.set('profile.realisations', req.body.realisations
        .filter(r => r && /^https?:\/\//.test(r.url || ''))
        .slice(0, 500)
        .map(r => ({ url: r.url, platform: platforms.includes(r.platform) ? r.platform : 'other', title: r.title, description: r.description, brandName: r.brandName, addedAt: r.addedAt || new Date() })));
      applied++;
    }

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key) && updates[key] !== undefined) {
        user.set(key, updates[key]);
        applied++;
      }
    });

    if (applied === 0) {
      return res.status(400).json({ error: 'Aucun champ modifiable fourni' });
    }

    await user.save();

    logger.info(`Profile updated: ${user._id} (${applied} champs)`);

    res.json({
      message: 'Profile updated successfully',
      user: await serializeUser(user),
    });
  } catch (error) {
    logger.error('Failed to update profile:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

/**
 * Démarre (ou reprend) l'onboarding Stripe Connect d'un créateur.
 * Retourne l'URL Stripe vers laquelle rediriger le créateur.
 */
export async function startStripeConnect(req, res) {
  try {
    const user = req.user;
    if (user.role !== 'creator') {
      return res.status(403).json({ error: 'Réservé aux créateurs' });
    }

    const frontend = config.cors.origin;
    const returnUrl = req.body?.returnUrl || `${frontend}/profile?stripe=return`;
    const refreshUrl = req.body?.refreshUrl || `${frontend}/profile?stripe=refresh`;

    let accountId = user.profile.stripeConnect?.accountId || user.stripeAccountId;

    if (!accountId) {
      const account = await createConnectAccount(user.email, 'FR');
      accountId = account.id;
      user.set('profile.stripeConnect.accountId', accountId);
      user.stripeAccountId = accountId;
      await user.save();
    }

    const url = await createAccountLink(accountId, returnUrl, refreshUrl);

    res.json({ url, accountId });
  } catch (error) {
    logger.error('Failed to start Stripe Connect onboarding:', error);
    const message = error?.raw?.message || error.message || 'Erreur Stripe';
    res.status(500).json({ error: `Impossible de démarrer la connexion Stripe : ${message}` });
  }
}

/**
 * Rafraîchit et renvoie le statut du compte Stripe Connect du créateur
 */
export async function getStripeConnectStatus(req, res) {
  try {
    const user = req.user;
    const accountId = user.profile.stripeConnect?.accountId || user.stripeAccountId;

    if (!accountId) {
      return res.json({ connected: false });
    }

    const status = await getAccountStatus(accountId);

    user.set('profile.stripeConnect.chargesEnabled', !!status.chargesEnabled);
    user.set('profile.stripeConnect.payoutsEnabled', !!status.payoutsEnabled);
    user.set('profile.stripeConnect.detailsSubmitted', !!status.detailsSubmitted);
    user.set('profile.stripeConnect.onboardingComplete', !!(status.detailsSubmitted && status.payoutsEnabled));
    user.set('profile.stripeConnect.requirements', {
      currentlyDue: status.requirements?.currently_due || [],
      disabledReason: status.requirements?.disabled_reason || null,
    });
    if (!user.stripeAccountId) user.stripeAccountId = accountId;
    await user.save();

    res.json({
      connected: true,
      accountId,
      chargesEnabled: status.chargesEnabled,
      payoutsEnabled: status.payoutsEnabled,
      detailsSubmitted: status.detailsSubmitted,
      onboardingComplete: user.profile.stripeConnect.onboardingComplete,
      currentlyDue: status.requirements?.currently_due || [],
    });
  } catch (error) {
    logger.error('Failed to get Stripe Connect status:', error);
    res.status(500).json({ error: 'Impossible de récupérer le statut Stripe' });
  }
}

/**
 * Le créateur soumet le lien d'une vidéo où il parle de NeedCreator (badge Ambassadeur)
 */
export async function submitAmbassadorVideo(req, res) {
  try {
    const user = req.user;
    if (user.role !== 'creator') return res.status(403).json({ error: 'Réservé aux créateurs' });
    const { videoUrl } = req.body;
    if (user.profile.ambassador?.status === 'approved') {
      return res.status(400).json({ error: 'Vous êtes déjà Ambassadeur' });
    }
    user.set('profile.ambassador', {
      status: 'pending',
      videoUrl,
      submittedAt: new Date(),
      reviewedAt: null,
      note: null,
    });
    await user.save();
    logger.info(`Ambassador video submitted by ${user._id}: ${videoUrl}`);
    res.json({ message: 'Merci ! Notre équipe vérifie votre vidéo sous 24h.', ambassador: user.profile.ambassador });
  } catch (error) {
    logger.error('Failed to submit ambassador video:', error);
    res.status(500).json({ error: 'Failed to submit video' });
  }
}

/**
 * Mon programme de parrainage : code, lien, filleuls, récompenses
 */
export async function getReferral(req, res) {
  try {
    const user = req.user;
    if (!user.referral?.code) {
      user.ensureReferralCode();
      await user.save();
    }
    const referred = await User.find({ 'referral.referredBy': user._id })
      .select('profile.name profile.companyName role status createdAt profile.stats.completedJobs')
      .sort({ createdAt: -1 }).lean();
    res.json({
      code: user.referral.code,
      link: `${config.cors.origin}/register?role=${user.role}&ref=${user.referral.code}`,
      discountedCampaignsLeft: user.referral.discountedCampaignsLeft || 0,
      rewards: user.referral.rewards || [],
      referred: referred.map(r => ({ id: r._id, name: r.profile.companyName || r.profile.name, role: r.role, status: r.status, since: r.createdAt, completedJobs: r.profile?.stats?.completedJobs || 0 })),
      terms: {
        brandFeePercent: config.referral.brandFeePercent,
        referrerBrandFeePercent: config.referral.referrerBrandFeePercent,
        creatorBonus: config.referral.creatorBonus,
        standardFeePercent: config.stripe.platformFeePercent,
      },
    });
  } catch (error) {
    logger.error('Failed to get referral:', error);
    res.status(500).json({ error: 'Failed to get referral' });
  }
}

/**
 * Mes revenus (créateur) : missions payées, en attente, bonus de parrainage, export CSV
 */
export async function getEarnings(req, res) {
  try {
    const user = req.user;
    if (user.role !== 'creator') return res.status(403).json({ error: 'Réservé aux créateurs' });
    const deliveries = await Delivery.find({ creatorId: user._id, status: { $in: ['approved', 'auto_approved'] } })
      .populate('campaignId', 'title')
      .populate('brandId', 'profile.companyName')
      .select('campaignId brandId payment approvedAt status')
      .sort({ approvedAt: -1 })
      .lean();

    const rows = deliveries.map(d => ({
      deliveryId: d._id,
      date: d.approvedAt,
      campaign: d.campaignId?.title,
      brand: d.brandId?.profile?.companyName,
      amount: d.payment.amount,
      platformFee: d.payment.platformFee,
      platformFeePercent: d.payment.platformFeePercent ?? config.stripe.platformFeePercent,
      net: d.payment.creatorAmount,
      status: d.payment.status, // released = viré, captured = en attente du compte Stripe
      releasedAt: d.payment.releasedAt,
      stripeTransferId: d.payment.stripeTransferId,
    }));

    const bonuses = (user.referral?.rewards || []).filter(r => r.type === 'creator_bonus').map(r => ({
      date: r.createdAt, description: r.description, amount: r.amount, status: r.status, stripeTransferId: r.stripeTransferId,
    }));

    const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
    const totals = {
      released: sum(rows.filter(r => r.status === 'released'), r => r.net) + sum(bonuses.filter(b => b.status === 'paid'), b => b.amount),
      pendingPayout: sum(rows.filter(r => r.status === 'captured'), r => r.net) + sum(bonuses.filter(b => b.status !== 'paid'), b => b.amount),
      gross: sum(rows, r => r.amount),
      fees: sum(rows, r => r.platformFee),
      bonuses: sum(bonuses, b => b.amount),
    };

    // Par mois (pour le récapitulatif fiscal)
    const byMonth = {};
    for (const r of rows) {
      const key = r.date ? new Date(r.date).toISOString().slice(0, 7) : 'inconnu';
      byMonth[key] = (byMonth[key] || 0) + (r.net || 0);
    }

    if (req.query.format === 'csv') {
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [
        ['Date', 'Campagne', 'Marque', 'Montant brut (€)', 'Commission (%)', 'Commission (€)', 'Net créateur (€)', 'Statut', 'Virement Stripe'].map(esc).join(';'),
        ...rows.map(r => [r.date ? new Date(r.date).toLocaleDateString('fr-FR') : '', r.campaign, r.brand, r.amount, r.platformFeePercent, r.platformFee, r.net, r.status === 'released' ? 'Viré' : 'En attente', r.stripeTransferId || ''].map(esc).join(';')),
        ...bonuses.map(b => [b.date ? new Date(b.date).toLocaleDateString('fr-FR') : '', 'Bonus parrainage', 'NeedCreator', b.amount, 0, 0, b.amount, b.status === 'paid' ? 'Viré' : 'En attente', b.stripeTransferId || ''].map(esc).join(';')),
      ];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="revenus-needcreator-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send('\ufeff' + lines.join('\n'));
    }

    res.json({ rows, bonuses, totals, byMonth, stripeConnected: !!user.profile?.stripeConnect?.payoutsEnabled });
  } catch (error) {
    logger.error('Failed to get earnings:', error);
    res.status(500).json({ error: 'Failed to get earnings' });
  }
}

/**
 * Vérification d'entreprise (marque) : SIRET / TVA + site web + email pro → automatique, sinon contrôle admin
 */
export async function verifyBusiness(req, res) {
  try {
    const user = req.user;
    if (user.role !== 'brand') return res.status(403).json({ error: 'Réservé aux marques' });
    const { siret, vatNumber, website } = req.body;
    if (website) user.set('profile.website', website);
    user.set('profile.company', { siret: siret ? String(siret).replace(/\s/g, '') : undefined, vatNumber: vatNumber ? String(vatNumber).replace(/\s/g, '').toUpperCase() : undefined });
    const result = evaluateBusiness({ siret, vatNumber, website: user.profile.website, email: user.email });
    let status = result.status === 'rejected' ? 'rejected' : result.status;
    let registry = null;

    // Contrôle au registre national (désactivable depuis l'admin ou BUSINESS_REGISTRY_CHECK=false)
    const registryEnabled = await getSetting(SETTINGS.businessRegistryCheck.key, SETTINGS.businessRegistryCheck.default);
    if (registryEnabled && result.identifierValid) {
      const cleanSiret = siret ? String(siret).replace(/\s/g, '') : null;
      const cleanVat = vatNumber ? String(vatNumber).replace(/\s/g, '').toUpperCase() : null;
      const siren = !cleanSiret && cleanVat?.startsWith('FR') ? cleanVat.slice(4) : null;
      if (cleanSiret || siren) {
        registry = await lookupRegistry({ siret: cleanSiret, siren });
        if (registry.error) {
          result.reasons.push(`${registry.error} : contrôle formel uniquement`);
        } else if (!registry.found) {
          status = 'rejected';
          result.reasons.push(cleanSiret ? 'SIRET introuvable au registre des entreprises' : 'SIREN introuvable au registre des entreprises');
        } else if (!registry.active) {
          status = 'pending';
          result.reasons.push(`Établissement fermé ou inactif au registre (${registry.legalName})`);
        } else {
          user.set('profile.company.legalName', registry.legalName);
          user.set('profile.company.registryAddress', registry.address);
          user.set('profile.company.registryChecked', true);
        }
      }
    }

    user.set('verification.business', { status, method: 'auto', checkedAt: new Date(), note: result.reasons.join(' · ') || null });
    await user.save();
    logger.info(`Business verification for ${user._id}: ${status} (${result.reasons.join(', ') || 'ok'})`);
    res.json({
      message: status === 'verified' ? 'Entreprise vérifiée' : status === 'pending' ? 'Informations reçues : vérification manuelle sous 24 h' : 'Identifiant d\'entreprise invalide',
      business: user.verification.business,
      reasons: result.reasons,
      freeEmail: isFreeEmail(user.email),
      registry: registry && registry.found ? { legalName: registry.legalName, address: registry.address, active: registry.active } : null,
      registryChecked: !!registryEnabled,
    });
  } catch (error) {
    logger.error('Business verification failed:', error);
    res.status(500).json({ error: 'Failed to verify business' });
  }
}
