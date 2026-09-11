import User from '../models/User.js';
import Campaign from '../models/Campaign.js';
import Delivery from '../models/Delivery.js';
import Review from '../models/Review.js';
import { sendCreatorApproved, sendAmbassadorApproved } from '../services/email.js';
import { runScheduledJobs } from '../jobs/autoApproval.js';
import { resolveUrlsIn } from '../services/storage.js';
import { stripe, cancelOrRefundPaymentIntent } from '../services/stripe.js';
import Conversation from '../models/Conversation.js';
import Report from '../models/Report.js';
import { config } from '../config/index.js';

/**
 * Détail d'un utilisateur (portfolio lisible, même si le créateur est en attente)
 */
export async function getUserDetail(req, res) {
  try {
    const user = await User.findById(req.params.userId).select('-__v').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.profile?.portfolio?.length) {
      user.profile.portfolio = await resolveUrlsIn(user.profile.portfolio);
    }
    res.json({ user: { ...user, id: user._id } });
  } catch (error) {
    logger.error('Failed to get user detail:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
}
import logger from '../utils/logger.js';

/**
 * Ambassadeurs : vidéos en attente de validation
 */
export async function getPendingAmbassadors(req, res) {
  try {
    const creators = await User.find({ role: 'creator', 'profile.ambassador.status': 'pending' })
      .select('email profile.name profile.ambassador profile.niches createdAt')
      .sort({ 'profile.ambassador.submittedAt': 1 })
      .lean();
    res.json({ creators });
  } catch (error) {
    logger.error('Failed to get pending ambassadors:', error);
    res.status(500).json({ error: 'Failed to get pending ambassadors' });
  }
}

export async function reviewAmbassador(req, res) {
  try {
    const { userId } = req.params;
    const approve = req.path.endsWith('/approve');
    const user = await User.findById(userId);
    if (!user || user.role !== 'creator') return res.status(404).json({ error: 'Creator not found' });
    if (!user.profile.ambassador?.videoUrl) return res.status(400).json({ error: 'Aucune vidéo soumise' });
    user.set('profile.ambassador.status', approve ? 'approved' : 'rejected');
    user.set('profile.isAmbassador', !!approve);
    user.set('profile.ambassador.reviewedAt', new Date());
    user.set('profile.ambassador.note', req.body?.reason || null);
    await user.save();
    if (approve) {
      sendAmbassadorApproved(user.email, user.profile.name).catch(err => logger.error('Ambassador email failed:', err.message));
    }
    logger.info(`Ambassador ${approve ? 'approved' : 'rejected'}: ${user._id}`);
    res.json({ message: approve ? 'Badge Ambassadeur attribué' : 'Vidéo refusée', ambassador: user.profile.ambassador });
  } catch (error) {
    logger.error('Failed to review ambassador:', error);
    res.status(500).json({ error: 'Failed to review ambassador' });
  }
}

/**
 * Réglages modifiables sans redémarrage
 */
export async function getSettings(req, res) {
  const { getSetting, SETTINGS } = await import('../models/Setting.js');
  const out = [];
  for (const def of Object.values(SETTINGS)) {
    out.push({ key: def.key, label: def.label, description: def.description, type: def.type || 'boolean', unit: def.unit, min: def.min, max: def.max, group: def.group || 'Général', value: await getSetting(def.key, def.default), default: def.default });
  }
  res.json({ settings: out });
}

export async function updateSetting(req, res) {
  try {
    const { setSetting, SETTINGS, coerceSettingValue } = await import('../models/Setting.js');
    const def = Object.values(SETTINGS).find(d => d.key === req.params.key);
    if (!def) return res.status(404).json({ error: 'Réglage inconnu' });
    let value;
    try { value = coerceSettingValue(def, req.body.value); } catch (e) { return res.status(400).json({ error: e.message }); }
    await setSetting(def.key, value, req.user._id);
    logger.info(`Setting ${def.key} set to ${JSON.stringify(value)} by ${req.user._id}`);
    res.json({ message: 'Réglage enregistré', key: def.key, value });
  } catch (error) {
    logger.error('Failed to update setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
}

/**
 * Marques en attente de vérification d'entreprise
 */
export async function getPendingBusinesses(req, res) {
  try {
    const brands = await User.find({ role: 'brand', 'verification.business.status': { $in: ['pending', 'rejected'] } })
      .select('email profile.companyName profile.website profile.industry profile.company verification.business createdAt')
      .sort({ 'verification.business.checkedAt': 1 }).lean();
    res.json({ brands });
  } catch (error) {
    logger.error('Failed to get pending businesses:', error);
    res.status(500).json({ error: 'Failed to get pending businesses' });
  }
}

export async function reviewBusiness(req, res) {
  try {
    const approve = req.path.endsWith('/approve');
    const user = await User.findById(req.params.userId);
    if (!user || user.role !== 'brand') return res.status(404).json({ error: 'Brand not found' });
    user.set('verification.business', {
      status: approve ? 'verified' : 'rejected', method: 'admin', checkedAt: new Date(), note: req.body?.reason || null,
    });
    await user.save();
    logger.info(`Business ${approve ? 'verified' : 'rejected'}: ${user._id}`);
    res.json({ message: approve ? 'Entreprise vérifiée' : 'Vérification refusée', business: user.verification.business });
  } catch (error) {
    logger.error('Failed to review business:', error);
    res.status(500).json({ error: 'Failed to review business' });
  }
}

/**
 * Lance les tâches planifiées à la demande
 */
export async function runJobs(req, res) {
  try {
    const result = await runScheduledJobs();
    res.json({ message: 'Jobs executed', ...result });
  } catch (error) {
    logger.error('Failed to run jobs:', error);
    res.status(500).json({ error: 'Failed to run jobs' });
  }
}

/**
 * Liste toutes les campagnes (supervision)
 */
export async function getAdminCampaigns(req, res) {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const query = status ? { status } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [campaigns, total] = await Promise.all([
      Campaign.find(query)
        .populate('brandId', 'profile.companyName email')
        .populate('selectedCreator', 'profile.name email')
        .select('title status budget timeline analytics brandId selectedCreator createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Campaign.countDocuments(query),
    ]);
    res.json({ campaigns, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (error) {
    logger.error('Failed to get admin campaigns:', error);
    res.status(500).json({ error: 'Failed to get campaigns' });
  }
}

/**
 * Liste toutes les livraisons (supervision / litiges)
 */
export async function getAdminDeliveries(req, res) {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const query = status ? { status } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [deliveries, total] = await Promise.all([
      Delivery.find(query)
        .populate('campaignId', 'title')
        .populate('brandId', 'profile.companyName email')
        .populate('creatorId', 'profile.name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Delivery.countDocuments(query),
    ]);
    res.json({ deliveries, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (error) {
    logger.error('Failed to get admin deliveries:', error);
    res.status(500).json({ error: 'Failed to get deliveries' });
  }
}

/**
 * Get dashboard stats
 */
export async function getDashboardStats(req, res) {
  try {
    const [
      totalUsers,
      totalCreators,
      totalBrands,
      pendingCreators,
      totalCampaigns,
      activeCampaigns,
      completedCampaigns,
      totalDeliveries,
      totalRevenue,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'creator' }),
      User.countDocuments({ role: 'brand' }),
      User.countDocuments({ role: 'creator', status: 'pending' }),
      Campaign.countDocuments(),
      Campaign.countDocuments({ status: 'active' }),
      Campaign.countDocuments({ status: 'completed' }),
      Delivery.countDocuments(),
      Delivery.aggregate([
        { $match: { 'payment.status': 'released' } },
        { $group: { _id: null, total: { $sum: '$payment.platformFee' } } },
      ]),
    ]);
    
    res.json({
      users: {
        total: totalUsers,
        creators: totalCreators,
        brands: totalBrands,
        pendingCreators,
      },
      campaigns: {
        total: totalCampaigns,
        active: activeCampaigns,
        completed: completedCampaigns,
      },
      deliveries: {
        total: totalDeliveries,
      },
      revenue: {
        total: totalRevenue[0]?.total || 0,
      },
    });
  } catch (error) {
    logger.error('Failed to get dashboard stats:', error);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
}

/**
 * Get pending creators for approval
 */
export async function getPendingCreators(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [creators, total] = await Promise.all([
      User.find({ role: 'creator', status: 'pending' })
        .select('email profile createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments({ role: 'creator', status: 'pending' }),
    ]);
    
    res.json({
      creators,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Failed to get pending creators:', error);
    res.status(500).json({ error: 'Failed to get pending creators' });
  }
}

/**
 * Approve creator
 */
export async function approveCreator(req, res) {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.role !== 'creator') {
      return res.status(400).json({ error: 'User is not a creator' });
    }
    
    if (user.status === 'active') {
      return res.status(400).json({ error: 'User is already active' });
    }
    
    user.status = 'active';
    user.verification.portfolio = true;
    await user.save();
    
    // Send approval email
    await sendCreatorApproved(user.email, user.profile.name)
      .catch(err => logger.error('Failed to send approval email:', err));
    
    logger.info(`Creator approved: ${user._id}`);
    
    res.json({
      message: 'Creator approved successfully',
      user,
    });
  } catch (error) {
    logger.error('Failed to approve creator:', error);
    res.status(500).json({ error: 'Failed to approve creator' });
  }
}

/**
 * Reject creator
 */
export async function rejectCreator(req, res) {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.role !== 'creator') {
      return res.status(400).json({ error: 'User is not a creator' });
    }
    
    user.status = 'suspended';
    await user.save();
    
    logger.info(`Creator rejected: ${user._id}, reason: ${reason}`);
    
    res.json({
      message: 'Creator rejected successfully',
      user,
    });
  } catch (error) {
    logger.error('Failed to reject creator:', error);
    res.status(500).json({ error: 'Failed to reject creator' });
  }
}

/**
 * Get all users with filters
 */
export async function getUsers(req, res) {
  try {
    const { role, status, search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let query = {};
    
    if (role) query.role = role;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { 'profile.name': { $regex: search, $options: 'i' } },
        { 'profile.companyName': { $regex: search, $options: 'i' } },
      ];
    }
    
    const [users, total] = await Promise.all([
      User.find(query)
        .select('-__v')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query),
    ]);
    
    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Failed to get users:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
}

/**
 * Suspend user
 */
export async function suspendUser(req, res) {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.status = 'suspended';
    await user.save();
    
    logger.info(`User suspended: ${user._id}, reason: ${reason}`);
    
    res.json({
      message: 'User suspended successfully',
      user,
    });
  } catch (error) {
    logger.error('Failed to suspend user:', error);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
}

/**
 * Supprime le compte Stripe Connect d'un créateur (tests, ou créateur qui veut repartir de zéro).
 * Le compte est supprimé chez Stripe puis le profil est remis à l'état « non connecté ».
 */
export async function resetStripeConnect(req, res) {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (user.role !== 'creator') return res.status(400).json({ error: 'Seuls les créateurs ont un compte Connect' });

    const accountId = user.profile?.stripeConnect?.accountId || user.stripeAccountId;
    if (!accountId) return res.status(400).json({ error: 'Ce créateur n\'a pas de compte Connect' });

    const pending = await Delivery.countDocuments({ creatorId: user._id, status: { $in: ['pending', 'submitted', 'revision_requested'] } });
    if (pending > 0) return res.status(409).json({ error: `${pending} mission(s) en cours : impossible de supprimer le compte de paiement maintenant` });

    let stripeDeleted = false;
    try {
      await stripe.accounts.del(accountId);
      stripeDeleted = true;
    } catch (err) {
      // Compte déjà supprimé ou inexistant : on nettoie quand même le profil
      if (err?.code !== 'resource_missing' && err?.statusCode !== 404) throw err;
    }

    user.set('profile.stripeConnect', { accountId: null, onboardingComplete: false, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, requirements: {} });
    user.stripeAccountId = undefined;
    await user.save();

    logger.info(`Stripe Connect réinitialisé par l'admin ${req.user._id} pour ${user._id} (${accountId}, supprimé chez Stripe : ${stripeDeleted})`);
    res.json({ message: stripeDeleted ? 'Compte Stripe Connect supprimé. Le créateur pourra en créer un nouveau.' : 'Compte introuvable chez Stripe, profil remis à zéro.', accountId, stripeDeleted });
  } catch (error) {
    logger.error('resetStripeConnect failed:', error);
    res.status(500).json({ error: `Suppression impossible : ${error.message}` });
  }
}

/**
 * OUTIL TEMPORAIRE (validation de la prod) : supprime les campagnes, devis, missions, avis, conversations d'un compte.
 * Les autorisations de paiement en cours sont annulées, les paiements capturés remboursés. Actif seulement si ADMIN_PURGE_ENABLED=true.
 */
async function purgeActivity(user, adminId) {
  const uid = user._id;
  const out = { payments: [], deliveries: 0, campaigns: 0, applications: 0, reviews: 0, conversations: 0, reports: 0 };

  const deliveryFilter = user.role === 'brand' ? { brandId: uid } : { creatorId: uid };
  const deliveries = await Delivery.find(deliveryFilter).select('payment readyPack rightsExtension campaignId');
  for (const d of deliveries) {
    for (const piId of [d.payment?.stripePaymentIntentId, d.readyPack?.stripePaymentIntentId, d.rightsExtension?.stripePaymentIntentId].filter(Boolean)) {
      try { const r = await cancelOrRefundPaymentIntent(piId); out.payments.push(`${piId}: ${r.action}`); }
      catch (err) { out.payments.push(`${piId}: erreur ${err.message}`); }
    }
  }
  const campaignIds = user.role === 'brand'
    ? (await Campaign.find({ brandId: uid }).select('_id')).map(c => c._id)
    : deliveries.map(d => d.campaignId);

  if (user.role === 'brand') {
    const all = await Delivery.find({ campaignId: { $in: campaignIds } }).select('payment');
    for (const d of all) {
      if (d.payment?.stripePaymentIntentId && !deliveries.some(x => String(x._id) === String(d._id))) {
        try { const r = await cancelOrRefundPaymentIntent(d.payment.stripePaymentIntentId); out.payments.push(`${d.payment.stripePaymentIntentId}: ${r.action}`); } catch (err) { out.payments.push(`erreur ${err.message}`); }
      }
    }
    out.deliveries = (await Delivery.deleteMany({ $or: [{ brandId: uid }, { campaignId: { $in: campaignIds } }] })).deletedCount;
    out.reviews = (await Review.deleteMany({ $or: [{ reviewerId: uid }, { revieweeId: uid }, { campaignId: { $in: campaignIds } }] })).deletedCount;
    out.campaigns = (await Campaign.deleteMany({ brandId: uid })).deletedCount;
    out.conversations = (await Conversation.deleteMany({ brandId: uid })).deletedCount;
    await User.updateMany({ 'referral.rewards.sourceUserId': uid }, { $pull: { 'referral.rewards': { sourceUserId: uid } } });
  } else {
    out.deliveries = (await Delivery.deleteMany({ creatorId: uid })).deletedCount;
    const pulled = await Campaign.updateMany({ 'applications.creatorId': uid }, { $pull: { applications: { creatorId: uid }, selectedCreators: uid } });
    out.applications = pulled.modifiedCount;
    await Campaign.updateMany({ selectedCreator: uid }, { $unset: { selectedCreator: '' } });
    await Campaign.updateMany({ _id: { $in: campaignIds }, status: 'in_progress' }, { $set: { status: 'active' } });
    out.reviews = (await Review.deleteMany({ $or: [{ reviewerId: uid }, { revieweeId: uid }] })).deletedCount;
    out.conversations = (await Conversation.deleteMany({ creatorId: uid })).deletedCount;
    user.set('profile.stats.completedJobs', 0);
    user.set('profile.stats.lateDeliveries', 0);
    await user.save();
  }
  out.reports = (await Report.deleteMany({ $or: [{ reporterId: uid }, { targetUserId: uid }] })).deletedCount;
  logger.warn(`PURGE admin ${adminId} → ${user.role} ${uid}: ${JSON.stringify(out)}`);
  return out;
}

/**
 * OUTIL TEMPORAIRE (validation de la prod) : supprime les campagnes, devis, missions, avis, conversations d'un compte.
 * Les autorisations de paiement en cours sont annulées, les paiements capturés remboursés. Actif seulement si ADMIN_PURGE_ENABLED=true.
 */
export async function purgeUserActivity(req, res) {
  try {
    if (!config.admin.purgeEnabled) return res.status(403).json({ error: 'Outil désactivé (ADMIN_PURGE_ENABLED=false dans backend/.env)' });
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Pas de purge sur un compte administrateur' });
    const out = await purgeActivity(user, req.user._id);
    res.json({ message: `Purge effectuée : ${out.campaigns} campagne(s), ${out.deliveries} mission(s), ${out.applications} devis, ${out.reviews} avis, ${out.conversations} conversation(s), ${out.payments.length} paiement(s) traité(s)`, ...out });
  } catch (error) {
    logger.error('purgeUserActivity failed:', error);
    res.status(500).json({ error: `Purge impossible : ${error.message}` });
  }
}

/**
 * OUTIL TEMPORAIRE : suppression complète d'un compte (activité purgée, fichiers R2, compte Stripe Connect, compte Firebase, document utilisateur).
 * Différent de la suppression RGPD par l'utilisateur, qui anonymise et conserve les données comptables.
 */
export async function hardDeleteUser(req, res) {
  try {
    if (!config.admin.purgeEnabled) return res.status(403).json({ error: 'Outil désactivé (ADMIN_PURGE_ENABLED=false dans backend/.env)' });
    const user = await User.findById(req.params.userId).select('+integrations.shopify.accessToken');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Pas de suppression d\'un compte administrateur' });
    const out = await purgeActivity(user, req.user._id);

    const { deleteFile } = await import('../services/storage.js');
    const files = [...(user.profile?.portfolio || []).flatMap(v => [v.videoUrl, v.thumbnail]), user.profile?.avatar].filter(Boolean);
    for (const f of files) await deleteFile(f).catch(() => {});
    out.files = files.length;

    const accountId = user.profile?.stripeConnect?.accountId || user.stripeAccountId;
    if (accountId) { try { await stripe.accounts.del(accountId); out.stripeConnect = 'supprimé'; } catch (err) { out.stripeConnect = `non supprimé (${err.message})`; } }

    await User.updateMany({ 'referral.referredBy': user._id }, { $unset: { 'referral.referredBy': '' } });
    const { default: ExternalCreator } = await import('../models/ExternalCreator.js');
    await ExternalCreator.updateMany({ claimedBy: user._id }, { $set: { status: 'listed', claimedBy: null, joinedAt: null } });

    const uid = user.firebaseUid;
    const id = String(user._id);
    await User.deleteOne({ _id: user._id });
    if (uid && !uid.startsWith('deleted-')) {
      const { default: admin } = await import('firebase-admin');
      await admin.auth().deleteUser(uid).then(() => { out.firebase = 'supprimé'; }).catch(err => { out.firebase = `non supprimé (${err.message})`; });
    }
    logger.warn(`HARD DELETE admin ${req.user._id} → ${user.role} ${id} (${user.email})`);
    res.json({ message: `Compte ${user.email} supprimé définitivement (${out.campaigns} campagne(s), ${out.deliveries} mission(s), ${out.files} fichier(s), Stripe Connect ${out.stripeConnect || 'aucun'}, Firebase ${out.firebase || 'aucun'})`, ...out });
  } catch (error) {
    logger.error('hardDeleteUser failed:', error);
    res.status(500).json({ error: `Suppression impossible : ${error.message}` });
  }
}

/**
 * Reactivate user
 */
export async function reactivateUser(req, res) {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.status = 'active';
    await user.save();
    
    logger.info(`User reactivated: ${user._id}`);
    
    res.json({
      message: 'User reactivated successfully',
      user,
    });
  } catch (error) {
    logger.error('Failed to reactivate user:', error);
    res.status(500).json({ error: 'Failed to reactivate user' });
  }
}
