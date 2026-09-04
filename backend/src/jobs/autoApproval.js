import Delivery from '../models/Delivery.js';
import Campaign from '../models/Campaign.js';
import { captureAndTransfer } from '../services/stripe.js';
import { sendAutoApprovalNotification, sendAutoApprovalReminder } from '../services/email.js';
import logger from '../utils/logger.js';

/**
 * Check and process auto-approvals
 * Should run daily via cron
 */
export async function processAutoApprovals() {
  try {
    const pendingAutoApprovals = await Delivery.findPendingAutoApprovals();
    
    logger.info(`Found ${pendingAutoApprovals.length} deliveries pending auto-approval`);
    
    for (const delivery of pendingAutoApprovals) {
      try {
        // Capture payment and transfer to creator
        await captureAndTransfer(
          delivery.payment.stripePaymentIntentId,
          delivery.creatorId.stripeAccountId,
          delivery.payment.amount,
          delivery.payment.platformFee
        );
        
        delivery.approve(true); // isAuto = true
        await delivery.save();
        
        // Update campaign status
        const campaign = await Campaign.findById(delivery.campaignId);
        if (campaign) {
          campaign.status = 'completed';
          await campaign.save();
        }
        
        // Send notifications
        await sendAutoApprovalNotification(
          delivery.brandId.email,
          delivery.creatorId.email,
          delivery.brandId.profile.companyName || delivery.brandId.profile.name,
          delivery.creatorId.profile.name,
          delivery.campaignId.title,
          delivery.payment.creatorAmount
        );
        
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
 * Send reminders for deliveries approaching auto-approval
 * Should run daily via cron
 */
export async function sendAutoApprovalReminders() {
  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    
    const deliveries = await Delivery.find({
      status: 'submitted',
      autoApprovalDate: {
        $gte: now,
        $lte: threeDaysFromNow,
      },
    })
      .populate('campaignId', 'title')
      .populate('brandId', 'email profile.companyName profile.name');
    
    logger.info(`Sending ${deliveries.length} auto-approval reminders`);
    
    for (const delivery of deliveries) {
      try {
        const daysLeft = Math.ceil(
          (new Date(delivery.autoApprovalDate) - now) / (1000 * 60 * 60 * 24)
        );
        
        await sendAutoApprovalReminder(
          delivery.brandId.email,
          delivery.brandId.profile.companyName || delivery.brandId.profile.name,
          delivery.campaignId.title,
          daysLeft,
          delivery._id
        );
        
        logger.info(`Sent reminder for delivery: ${delivery._id}`);
      } catch (error) {
        logger.error(`Failed to send reminder for delivery ${delivery._id}:`, error);
      }
    }
    
    return deliveries.length;
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
  } catch (error) {
    logger.error('Scheduled jobs failed:', error);
  }
}
