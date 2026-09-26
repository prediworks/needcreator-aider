import User from '../models/User.js';
import Campaign from '../models/Campaign.js';
import Delivery from '../models/Delivery.js';
import Review from '../models/Review.js';
import { sendCreatorApproved, sendAmbassadorApproved } from '../services/email.js';
import { runScheduledJobs } from '../jobs/autoApproval.js';
import { notify } from '../services/notifications.js';
import { resolveUrlsIn } from '../services/storage.js';
import { stripe, cancelOrRefundPaymentIntent } from '../services/stripe.js';
import Conversation from '../models/Conversation.js';
import Report from '../models/Report.js';
import ExternalQuote from '../models/ExternalQuote.js';
import Prospect from '../models/Prospect.js';
import CreatorContent from '../models/CreatorContent.js';
import { memberMessagesOverview, broadcastMemberMessage } from '../services/memberMessages.js';
import { sendWeeklyReport } from '../services/adminAlerts.js';
import { config } from '../config/index.js';

/**
 * Détail d'un utilisateur (portfolio lisible, même si le créateur est en attente)
 */
export async function getUserDetail(req, res) {
  try {
    const user = await User.findById(req.params.userId).select('-__v').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.profile?.portfolio?.length) {
      const { portfolioForAdmin } = await import('../services/watermark.js');
      user.profile.portfolio = await resolveUrlsIn(portfolioForAdmin(user.profile.portfolio));
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

/** Sauvegardes : liste et lancement manuel */
export async function listBackupsAdmin(req, res) {
  try {
    const { listBackups, backupSettings } = await import('../services/backup.js');
    const s = await backupSettings();
    res.json({ dir: s.dir, enabled: s.enabled, intervalHours: s.intervalHours, retentionDays: s.retentionDays, backups: listBackups(s.dir).map(b => ({ name: b.name, size: b.size, createdAt: b.createdAt })) });
  } catch (error) {
    res.status(500).json({ error: `Liste impossible : ${error.message}` });
  }
}
export async function runBackupAdmin(req, res) {
  try {
    const { runBackup, pruneBackups, backupSettings } = await import('../services/backup.js');
    const s = await backupSettings();
    const b = await runBackup(s.dir);
    const pruned = pruneBackups(s.dir, s.retentionDays);
    logger.info(`Manual backup by admin ${req.user._id}: ${b.file}`);
    res.json({ message: `Sauvegarde créée : ${b.name} (${Math.round(b.size / 1024)} Ko)`, backup: { name: b.name, size: b.size, collections: b.collections }, pruned });
  } catch (error) {
    logger.error('Manual backup failed:', error);
    res.status(500).json({ error: `Sauvegarde impossible : ${error.message}` });
  }
}

/** Restauration depuis l'admin : archive du répertoire de sauvegarde, confirmation « RESTAURER » obligatoire */
export async function restoreBackupAdmin(req, res) {
  try {
    const { listBackups, restoreBackup, backupSettings } = await import('../services/backup.js');
    const { setSetting } = await import('../models/Setting.js');
    if (req.body?.confirm !== 'RESTAURER') return res.status(400).json({ error: 'Confirmation manquante : tapez RESTAURER' });
    const s = await backupSettings();
    const b = listBackups(s.dir).find(x => x.name === req.params.name);
    if (!b) return res.status(404).json({ error: 'Sauvegarde introuvable dans le répertoire configuré' });
    const drop = !!req.body?.drop;
    logger.warn(`RESTORE requested by admin ${req.user._id}: ${b.name}${drop ? ' (drop)' : ''}`);
    const r = await restoreBackup(b.file, { drop });
    // Le réglage du répertoire doit survivre à une restauration d'une base qui ne le connaissait pas
    await setSetting('backupDir', s.dir, req.user._id).catch(() => {});
    const total = Object.values(r.restored).reduce((a, n) => a + n, 0);
    res.json({ message: `Base restaurée depuis ${b.name} : ${total} document(s) dans ${Object.keys(r.restored).length} collection(s)${drop ? ', collections vidées avant' : ''}. Rechargez la page.`, restored: r.restored, manifest: r.manifest });
  } catch (error) {
    logger.error('Admin restore failed:', error);
    res.status(500).json({ error: `Restauration impossible : ${error.message}` });
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
      pendingAmbassadors,
      pendingBusinesses,
      openReports,
      openDisputes,
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
      User.countDocuments({ role: 'creator', 'profile.ambassador.status': 'pending' }),
      User.countDocuments({ role: 'brand', 'verification.business.status': 'pending' }),
      Report.countDocuments({ status: 'open' }),
      Delivery.countDocuments({ 'dispute.status': 'open' }),
      Campaign.countDocuments(),
      Campaign.countDocuments({ status: 'active' }),
      Campaign.countDocuments({ status: 'completed' }),
      Delivery.countDocuments(),
      Delivery.aggregate([
        { $match: { 'payment.status': 'released' } },
        { $group: { _id: null, total: { $sum: '$payment.platformFee' } } },
      ]),
    ]);
    // Outils créateurs (devis clients, suivi de prospection, registre des droits) : combien s'en servent, et ce que ça rapporte en marques
    const [quoteCreators, prospectCreators, contentCreators, quotesByStatus, prospectsByStatus, brandsViaQuotes] = await Promise.all([
      ExternalQuote.distinct('creatorId'),
      Prospect.distinct('creatorId'),
      CreatorContent.distinct('creatorId', { source: 'external' }),
      ExternalQuote.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Prospect.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      ExternalQuote.distinct('brandId', { status: 'accepted_needcreator', brandId: { $ne: null } }),
    ]);
    const byKey = (rows) => Object.fromEntries(rows.map(r => [r._id, r.n]));
    const q = byKey(quotesByStatus); const p = byKey(prospectsByStatus);
    const tools = {
      creators: { quotes: quoteCreators.length, prospects: prospectCreators.length, contents: contentCreators.length, any: new Set([...quoteCreators, ...prospectCreators, ...contentCreators].map(String)).size },
      quotes: { total: Object.values(q).reduce((a, b) => a + b, 0), draft: q.draft || 0, sent: q.sent || 0, acceptedNeedcreator: q.accepted_needcreator || 0, acceptedDirect: q.accepted_direct || 0, declined: q.declined || 0, expired: q.expired || 0 },
      prospects: { total: Object.values(p).reduce((a, b) => a + b, 0), toContact: p.to_contact || 0, contacted: p.contacted || 0, replied: p.replied || 0, quoteSent: p.quote_sent || 0, won: p.won || 0, lost: p.lost || 0 },
      brandsViaQuotes: brandsViaQuotes.length,
    };
    
    const creatorsByStatus = Object.fromEntries((await User.aggregate([{ $match: { role: 'creator' } }, { $group: { _id: '$status', n: { $sum: 1 } } }])).map(r => [r._id, r.n]));
    res.json({
      tools,
      users: {
        total: totalUsers,
        creators: totalCreators,
        brands: totalBrands,
        pendingCreators,
        creatorsByStatus, // active, pending, suspended, deleted
      },
      // À traiter (compteurs des onglets admin)
      todo: { pendingCreators, pendingAmbassadors, pendingBusinesses, openReports, openDisputes },
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
    notify(user._id, { type: 'system', title: 'Profil validé : vous pouvez envoyer des devis', text: 'Découvrez les campagnes ouvertes.', href: '/campaigns' }).catch(() => {});
    
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
/** Ce qui manque à un créateur pour que son profil soit complet (même règles que l'inscription et le contrat) */
function creatorMissing(u) {
  const out = [];
  if (!u.verification?.email) out.push('email non confirmé');
  const videos = (u.profile?.portfolio || []).length;
  if (videos < 3) out.push(`${videos}/3 vidéos`);
  if (!(u.profile?.niches || []).length) out.push('niches non renseignées');
  const li = u.legalInfo || {}; const addr = li.address || {};
  const base = li.firstName && li.lastName && li.status && addr.line1 && addr.postalCode && addr.city && li.billingMandateAcceptedAt && (li.status === 'individual' ? li.individualAcknowledged : li.siret);
  if (!base) out.push('informations administratives');
  return out;
}

export async function getUsers(req, res) {
  try {
    const { role, status, search, origin, verified, plan, ambassador, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let query = {};
    
    if (role) query.role = role;
    if (status) query.status = status;
    if (origin === 'seed') query['seed.batch'] = { $exists: true, $ne: null };
    if (origin === 'real') query['seed.batch'] = { $in: [null] };
    if (verified === '1') query['verification.email'] = true;
    if (verified === '0') query['verification.email'] = { $ne: true };
    if (plan === 'pro') query['subscription.plan'] = 'pro';
    if (plan === 'free') query['subscription.plan'] = { $ne: 'pro' };
    if (ambassador === '1') query['profile.ambassador.status'] = 'approved';
    if (ambassador === 'pending') query['profile.ambassador.status'] = 'pending';
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
    
    for (const u of users) if (u.role === 'creator') u.missing = creatorMissing(u);
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
    user.set('suspension', { reason: String(reason || '').trim().slice(0, 500) || undefined, at: new Date(), by: req.user._id });
    await user.save();
    const { sendAccountSuspended } = await import('../services/email.js');
    sendAccountSuspended(user.email, user.profile?.companyName || user.profile?.name, user.suspension?.reason).catch(err => logger.warn(`Suspension email not sent: ${err.message}`));
    
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
/** Marque l'adresse email comme confirmée (Firebase + base) : utilisateur qui ne reçoit jamais l'email, ou environnement de test */
export async function markEmailVerified(req, res) {
  try {
    const user = await User.findById(req.params.userId).select('email firebaseUid verification');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { default: admin } = await import('firebase-admin');
    const rec = await admin.auth().getUser(user.firebaseUid);
    if (!rec.emailVerified) await admin.auth().updateUser(user.firebaseUid, { emailVerified: true });
    user.set('verification.email', true);
    await user.save();
    logger.info(`Email marked verified by admin ${req.user._id} for user ${user._id}`);
    res.json({ message: `Adresse ${user.email} marquée comme confirmée`, emailVerified: true });
  } catch (error) {
    logger.error('markEmailVerified failed:', error);
    res.status(500).json({ error: `Impossible : ${error.message}` });
  }
}

export async function reactivateUser(req, res) {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.status = 'active';
    user.set('suspension', undefined);
    await user.save();
    const { sendAccountReactivated } = await import('../services/email.js');
    sendAccountReactivated(user.email, user.profile?.companyName || user.profile?.name).catch(err => logger.warn(`Reactivation email not sent: ${err.message}`));
    
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

/** Relance le traitement d'une vidéo de portfolio (aperçu filigrané + version lisible partout), par exemple après un échec ou pour une vidéo ancienne */
export async function reprocessPortfolioVideo(req, res) {
  try {
    const user = await User.findById(req.params.userId).select('profile.portfolio');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const v = (user.profile?.portfolio || []).find(x => String(x._id) === String(req.params.videoId));
    if (!v) return res.status(404).json({ error: 'Vidéo introuvable' });
    await User.updateOne({ _id: user._id, 'profile.portfolio._id': v._id }, { $set: { 'profile.portfolio.$.watermarkAttempts': 0, 'profile.portfolio.$.watermarkedAt': null, 'profile.portfolio.$.watermarkError': null } });
    const { watermarkPortfolioVideo } = await import('../services/watermark.js');
    setImmediate(() => watermarkPortfolioVideo(user._id, v.videoUrl).catch(() => {}));
    res.json({ message: 'Réencodage lancé : comptez une à deux minutes selon la durée de la vidéo, puis rechargez la page' });
  } catch (error) {
    logger.error('reprocessPortfolioVideo failed:', error);
    res.status(500).json({ error: 'Relance impossible' });
  }
}

/* ---------- Messages aux inscrits (annonces) ---------- */
export async function memberMessagesView(req, res) {
  try { res.json(await memberMessagesOverview()); }
  catch (error) { logger.error('memberMessagesView failed:', error); res.status(500).json({ error: 'Messages indisponibles' }); }
}

export async function memberMessagesSend(req, res) {
  try {
    const audience = req.body?.audience === 'brands' ? 'brands' : 'creators';
    const subject = String(req.body?.subject || '').trim().slice(0, 150);
    const body = String(req.body?.body || '').trim().slice(0, 6000);
    if (subject.length < 5 || body.length < 20) return res.status(400).json({ error: 'Il manque : un objet (5 caractères au moins) et un texte (20 caractères au moins)' });
    if (req.query.preview === '1') {
      const r = await broadcastMemberMessage({ audience, subject, body, sentBy: req.user._id, previewTo: req.user._id });
      return res.json({ message: `Aperçu envoyé à ${r.to}`, preview: true });
    }
    const r = await broadcastMemberMessage({ audience, subject, body, sentBy: req.user._id });
    res.json({ message: `Message envoyé à ${r.count} ${audience === 'brands' ? 'marque(s)' : 'créateur(s)'} (${r.emailed} email(s), notification pour tous)`, count: r.count, emailed: r.emailed, broadcastId: r.broadcast._id });
  } catch (error) {
    if (error.status === 502) return res.status(502).json({ error: error.message });
    logger.error('memberMessagesSend failed:', error); res.status(500).json({ error: `Envoi impossible : ${error.message}` });
  }
}

/** Bilan hebdomadaire envoyé tout de suite aux administrateurs (sinon chaque lundi par la tâche planifiée) */
export async function weeklyReportNow(req, res) {
  try {
    const r = await sendWeeklyReport({ force: true });
    res.json({ message: r.sent ? 'Bilan de la semaine envoyé aux administrateurs' : `Bilan non envoyé : ${r.reason || 'aucun destinataire'}`, ...r });
  } catch (error) { logger.error('weeklyReportNow failed:', error); res.status(500).json({ error: `Bilan impossible : ${error.message}` }); }
}
