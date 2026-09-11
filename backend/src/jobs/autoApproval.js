import Delivery from '../models/Delivery.js';
import Campaign from '../models/Campaign.js';
import User from '../models/User.js';
import { config } from '../config/index.js';
import { sendNewCampaignNotification } from '../services/email.js';
import { finalizeApproval } from '../controllers/deliveries.js';
import { sendAutoApprovalNotification, sendAutoApprovalReminder, sendRightsExpiring, sendDeliveryLate, sendReplacementAvailable } from '../services/email.js';
import logger from '../utils/logger.js';
import { transferToCreator } from '../services/stripe.js';
import { sendAdminDigest } from '../services/adminAlerts.js';
import { runFollowUps } from './followUps.js';
import { publishExpiredReviews } from '../controllers/reviews.js';
import { notify } from '../services/notifications.js';

/**
 * Check and process auto-approvals (J+7 après soumission)
 */
export async function processAutoApprovals() {
  try {
    const pendingAutoApprovals = await Delivery.findPendingAutoApprovals();

    if (pendingAutoApprovals.length) {
      logger.info(`Found ${pendingAutoApprovals.length} deliveries pending auto-approval`);
    }

    for (const delivery of pendingAutoApprovals) {
      try {
        await finalizeApproval(delivery, { isAuto: true });

        // Send notifications
        await sendAutoApprovalNotification(
          delivery.brandId.email,
          delivery.creatorId.email,
          delivery.brandId.profile.companyName || delivery.brandId.profile.name,
          delivery.creatorId.profile.name,
          delivery.campaignId.title,
          delivery.payment.creatorAmount
        ).catch(err => logger.error('Failed to send auto-approval emails:', err.message));

        notify(delivery.brandId._id, { type: 'approval', title: 'Livraison approuvée automatiquement', text: delivery.campaignId.title, href: `/deliveries/${delivery._id}` }).catch(() => {});
        notify(delivery.creatorId._id, { type: 'approval', title: `Validation automatique : ${delivery.payment.creatorAmount} € en route`, text: delivery.campaignId.title, href: `/deliveries/${delivery._id}` }).catch(() => {});
        logger.info(`Auto-approved delivery: ${delivery._id}`);
      } catch (error) {
        logger.error(`Failed to auto-approve delivery ${delivery._id}:`, error);
      }
    }

    return pendingAutoApprovals.length;
  } catch (error) {
    logger.error('Failed to process auto-approvals:', error);
    throw error;
  }
}

/**
 * Send reminders for deliveries approaching auto-approval (J+3 et J+6 → 4 et 1 jours restants)
 * Un rappel par jour maximum par livraison.
 */
export async function sendAutoApprovalReminders() {
  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

    const deliveries = await Delivery.find({
      status: 'submitted',
      autoApprovalDate: {
        $gte: now,
        $lte: threeDaysFromNow,
      },
    })
      .populate('campaignId', 'title')
      .populate('brandId', 'email profile.companyName profile.name');

    let sent = 0;

    for (const delivery of deliveries) {
      try {
        const daysLeft = Math.ceil(
          (new Date(delivery.autoApprovalDate) - now) / (1000 * 60 * 60 * 24)
        );

        // Rappels uniquement à J+3 (4 jours restants) et J+6 (1 jour restant)
        if (![4, 1].includes(daysLeft)) continue;

        const lastReminder = delivery.notes?.lastReminderDay;
        if (lastReminder === daysLeft) continue;

        await sendAutoApprovalReminder(
          delivery.brandId.email,
          delivery.brandId.profile.companyName || delivery.brandId.profile.name,
          delivery.campaignId.title,
          daysLeft,
          delivery._id
        );

        await Delivery.updateOne({ _id: delivery._id }, { $set: { 'notes.lastReminderDay': daysLeft } });
        sent++;

        logger.info(`Sent reminder for delivery: ${delivery._id} (${daysLeft} jours restants)`);
      } catch (error) {
        logger.error(`Failed to send reminder for delivery ${delivery._id}:`, error);
      }
    }

    return sent;
  } catch (error) {
    logger.error('Failed to send auto-approval reminders:', error);
    throw error;
  }
}

/**
 * Fin de l'avant-première : notifie tous les créateurs des niches (hors ambassadeurs déjà prévenus)
 */
export async function notifyAfterEarlyAccess() {
  const hours = config.badges.earlyAccessHours;
  if (hours <= 0) return 0;
  const limit = new Date(Date.now() - hours * 3600 * 1000);
  const campaigns = await Campaign.find({
    status: 'active',
    'timeline.publishedAt': { $lte: limit },
    'notifications.allNotifiedAt': { $exists: false },
  }).select('title matching.niches');
  let sent = 0;
  for (const campaign of campaigns) {
    const creators = await User.find({
      role: 'creator', status: 'active',
      'preferences.emailNotifications': { $ne: false },
      'profile.niches': { $in: campaign.matching.niches },
      'profile.ambassador.status': { $ne: 'approved' },
    }).select('email profile.name').limit(200);
    await Promise.allSettled(creators.map(c =>
      sendNewCampaignNotification(c.email, c.profile.name, campaign.title, campaign._id)
        .catch(err => logger.error('Failed to send notification:', err.message))
    ));
    campaign.set('notifications.allNotifiedAt', new Date());
    await campaign.save();
    sent += creators.length;
  }
  return sent;
}

/**
 * Run all scheduled jobs
 */
/**
 * Livraisons en retard : rappel au créateur à la date prévue, puis proposition de remplacement à la marque après le délai de grâce
 */
export async function flagLateDeliveries() {
  const now = new Date();
  const grace = config.business.replacementGraceHours * 3600000;
  const late = await Delivery.find({ status: 'pending', productionDeadline: { $lt: now }, 'replacement.status': { $in: ['none', 'late'] } })
    .populate('campaignId', 'title').populate('brandId', 'email profile.companyName profile.name').populate('creatorId', 'email profile.name');
  let flagged = 0;
  for (const d of late) {
    try {
      const title = d.campaignId?.title || 'votre mission';
      if (d.replacement?.status !== 'late') {
        if (d.creatorId?.email) await sendDeliveryLate(d.creatorId.email, d.creatorId.profile?.name, title, d.productionDeadline, d._id).catch(err => logger.warn(`Rappel retard non envoyé ${d._id}: ${err?.message}`));
        notify(d.creatorId?._id, { type: 'reminder', title: 'Mission en retard', text: title, href: `/deliveries/${d._id}` }).catch(() => {});
        d.replacement = { ...(d.replacement?.toObject?.() || {}), status: 'late', lateSince: now };
        await d.save(); flagged++;
      }
      if (now - new Date(d.productionDeadline) >= grace && !d.replacement.offeredAt) {
        if (d.brandId?.email) await sendReplacementAvailable(d.brandId.email, d.brandId.profile?.companyName || d.brandId.profile?.name, d.creatorId?.profile?.name || 'Le créateur', title, d._id).catch(err => logger.warn(`Email remplacement non envoyé ${d._id}: ${err?.message}`));
        notify(d.brandId?._id, { type: 'replacement', title: 'Garantie de remplacement disponible', text: title, href: `/deliveries/${d._id}` }).catch(() => {});
        d.replacement.status = 'offered';
        d.replacement.offeredAt = now;
        await d.save(); flagged++;
      }
    } catch (err) {
      logger.error(`flagLateDeliveries failed for ${d._id}: ${err?.message || err}`);
    }
  }
  return flagged;
}

/**
 * Virements différés : livraisons validées dont le paiement est encaissé mais pas encore versé
 * (créateur sans compte Stripe au moment de la validation, ou virement en échec). Retenté à chaque exécution.
 */
export async function retryPendingTransfers() {
  const pending = await Delivery.find({ status: { $in: ['approved', 'auto_approved'] }, 'payment.status': 'captured', 'payment.stripePaymentIntentId': { $exists: true, $ne: null }, 'payment.creatorAmount': { $gt: 0 } })
    .populate('creatorId', 'profile.stripeConnect stripeAccountId profile.name');
  let done = 0;
  for (const d of pending) {
    const c = d.creatorId;
    const accountId = c?.profile?.stripeConnect?.payoutsEnabled ? (c.profile.stripeConnect.accountId || c.stripeAccountId) : null;
    if (!accountId) continue;
    try {
      const t = await transferToCreator(d.payment.stripePaymentIntentId, accountId, d.payment.creatorAmount, d.payment.currency || 'eur');
      d.payment.status = 'released';
      d.payment.releasedAt = new Date();
      d.payment.stripeTransferId = t.id;
      await d.save();
      done++;
      logger.info(`Virement différé effectué : ${d._id} → ${accountId} (${t.id})`);
    } catch (err) {
      logger.warn(`Virement différé toujours en échec pour ${d._id}: ${err?.message || err}`);
    }
  }
  return done;
}

/**
 * Rappel 30 jours avant l'expiration des droits d'utilisation (marque + créateur)
 */
export async function sendRightsExpiryReminders() {
  const now = new Date();
  const limit = new Date(now.getTime() + 30 * 86400000);
  const deliveries = await Delivery.find({
    'contract.rightsEndAt': { $gt: now, $lte: limit },
    'contract.expiryReminderSentAt': null,
  }).populate('campaignId', 'title').populate('brandId', 'email profile.companyName profile.name').populate('creatorId', 'email profile.name');
  let sent = 0;
  for (const d of deliveries) {
    try {
      const title = d.campaignId?.title || 'votre campagne';
      // Un email refusé (adresse invalide…) ne doit pas bloquer le rappel ni le faire répéter à chaque exécution
      if (d.brandId?.email) await sendRightsExpiring(d.brandId.email, d.brandId.profile?.companyName || d.brandId.profile?.name, title, d.contract.rightsEndAt, d._id, true)
        .catch(err => logger.warn(`Rappel droits (marque) non envoyé pour ${d._id}: ${err?.message || err}`));
      if (d.creatorId?.email) await sendRightsExpiring(d.creatorId.email, d.creatorId.profile?.name, title, d.contract.rightsEndAt, d._id, false)
        .catch(err => logger.warn(`Rappel droits (créateur) non envoyé pour ${d._id}: ${err?.message || err}`));
      d.contract.expiryReminderSentAt = now;
      await d.save();
      sent++;
    } catch (err) {
      logger.error(`Rights expiry reminder failed for ${d._id}: ${err?.message || err}`);
    }
  }
  return sent;
}

export async function runScheduledJobs() {
  logger.info('Running scheduled jobs...');

  try {
    const [autoApprovals, reminders, notified, rightsReminders, lateFlags, transfers] = await Promise.all([
      processAutoApprovals(),
      sendAutoApprovalReminders(),
      notifyAfterEarlyAccess(),
      sendRightsExpiryReminders(),
      flagLateDeliveries(),
      retryPendingTransfers(),
    ]);
    const followUps = await runFollowUps();
    const reviewsPublished = await publishExpiredReviews().catch(err => { logger.error('publishExpiredReviews:', err); return 0; });
    const adminDigest = await sendAdminDigest().catch(err => ({ sent: false, error: err.message }));

    logger.info(`Scheduled jobs completed: ${autoApprovals} auto-approvals, ${reminders} reminders sent, ${notified} creators notified after early access, ${rightsReminders} rights expiry reminders, ${lateFlags} late-delivery flags, ${transfers} deferred transfers, follow-ups ${JSON.stringify(followUps)}`);
    return { autoApprovals, reminders, notified, rightsReminders, lateFlags, transfers, followUps, reviewsPublished, adminDigest };
  } catch (error) {
    logger.error('Scheduled jobs failed:', error);
    return { autoApprovals: 0, reminders: 0, error: error.message };
  }
}
