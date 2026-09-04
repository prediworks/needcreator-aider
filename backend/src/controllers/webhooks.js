import { verifyWebhookSignature } from '../services/stripe.js';
import User from '../models/User.js';
import Delivery from '../models/Delivery.js';
import logger from '../utils/logger.js';

/**
 * Handle Stripe webhooks
 */
export async function handleStripeWebhook(req, res) {
  const signature = req.headers['stripe-signature'];
  
  try {
    const event = verifyWebhookSignature(req.body, signature);
    
    logger.info(`Stripe webhook received: ${event.type}`);
    
    switch (event.type) {
      case 'account.updated':
        await handleAccountUpdated(event.data.object);
        break;
        
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
        
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
        
      case 'transfer.created':
        await handleTransferCreated(event.data.object);
        break;
        
      case 'transfer.failed':
        await handleTransferFailed(event.data.object);
        break;
        
      default:
        logger.info(`Unhandled webhook event type: ${event.type}`);
    }
    
    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(400).json({ error: 'Webhook error' });
  }
}

/**
 * Handle account.updated event
 */
async function handleAccountUpdated(account) {
  try {
    const user = await User.findOne({ stripeAccountId: account.id });
    
    if (!user) {
      logger.warn(`User not found for Stripe account: ${account.id}`);
      return;
    }
    
    // Update verification status
    if (account.charges_enabled && account.payouts_enabled) {
      user.verification.identity = true;
      await user.save();
      logger.info(`User ${user._id} Stripe account verified`);
    }
  } catch (error) {
    logger.error('Failed to handle account.updated:', error);
  }
}

/**
 * Handle payment_intent.succeeded event
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  try {
    const delivery = await Delivery.findOne({
      'payment.stripePaymentIntentId': paymentIntent.id,
    });
    
    if (!delivery) {
      logger.warn(`Delivery not found for payment intent: ${paymentIntent.id}`);
      return;
    }
    
    logger.info(`Payment succeeded for delivery: ${delivery._id}`);
  } catch (error) {
    logger.error('Failed to handle payment_intent.succeeded:', error);
  }
}

/**
 * Handle payment_intent.payment_failed event
 */
async function handlePaymentIntentFailed(paymentIntent) {
  try {
    const delivery = await Delivery.findOne({
      'payment.stripePaymentIntentId': paymentIntent.id,
    });
    
    if (!delivery) {
      logger.warn(`Delivery not found for payment intent: ${paymentIntent.id}`);
      return;
    }
    
    delivery.payment.status = 'failed';
    await delivery.save();
    
    logger.error(`Payment failed for delivery: ${delivery._id}`);
  } catch (error) {
    logger.error('Failed to handle payment_intent.payment_failed:', error);
  }
}

/**
 * Handle transfer.created event
 */
async function handleTransferCreated(transfer) {
  try {
    const delivery = await Delivery.findOne({
      'payment.stripePaymentIntentId': transfer.source_transaction,
    });
    
    if (!delivery) {
      logger.warn(`Delivery not found for transfer: ${transfer.id}`);
      return;
    }
    
    delivery.payment.stripeTransferId = transfer.id;
    await delivery.save();
    
    logger.info(`Transfer created for delivery: ${delivery._id}`);
  } catch (error) {
    logger.error('Failed to handle transfer.created:', error);
  }
}

/**
 * Handle transfer.failed event
 */
async function handleTransferFailed(transfer) {
  try {
    const delivery = await Delivery.findOne({
      'payment.stripeTransferId': transfer.id,
    });
    
    if (!delivery) {
      logger.warn(`Delivery not found for transfer: ${transfer.id}`);
      return;
    }
    
    delivery.payment.status = 'failed';
    await delivery.save();
    
    logger.error(`Transfer failed for delivery: ${delivery._id}`);
  } catch (error) {
    logger.error('Failed to handle transfer.failed:', error);
  }
}
