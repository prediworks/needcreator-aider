import Delivery from '../models/Delivery.js';
import { finalizeApproval } from '../controllers/deliveries.js';
import { sendAutoApprovalNotification, sendAutoApprovalReminder } from '../services/email.js';
import logger from '../utils/logger.js';

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
 * Run all scheduled jobs
 */
export async function runScheduledJobs() {
  logger.info('Running scheduled jobs...');

  try {
    const [autoApprovals, reminders] = await Promise.all([
      processAutoApprovals(),
      sendAutoApprovalReminders(),
    ]);

    logger.info(`Scheduled jobs completed: ${autoApprovals} auto-approvals, ${reminders} reminders sent`);
    return { autoApprovals, reminders };
  } catch (error) {
    logger.error('Scheduled jobs failed:', error);
    return { autoApprovals: 0, reminders: 0, error: error.message };
  }
}
