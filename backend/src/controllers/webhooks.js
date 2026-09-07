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

      case 'payment_intent.amount_capturable_updated':
        await handlePaymentAuthorized(event.data.object);
        break;
        
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
        
      case 'transfer.created':
        await handleTransferCreated(event.data.object);
        break;
        
      case 'transfer.reversed':
        await handleTransferReversed(event.data.object);
        break;
        
      case 'transfer.updated':
        await handleTransferUpdated(event.data.object);
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
    const user = await User.findOne({
      $or: [{ stripeAccountId: account.id }, { 'profile.stripeConnect.accountId': account.id }],
    });
    
    if (!user) {
      logger.warn(`User not found for Stripe account: ${account.id}`);
      return;
    }
    
    user.set('profile.stripeConnect.chargesEnabled', !!account.charges_enabled);
    user.set('profile.stripeConnect.payoutsEnabled', !!account.payouts_enabled);
    user.set('profile.stripeConnect.detailsSubmitted', !!account.details_submitted);
    user.set('profile.stripeConnect.onboardingComplete', !!(account.details_submitted && account.payouts_enabled));
    if (account.charges_enabled && account.payouts_enabled) {
      user.verification.identity = true;
    }
    await user.save();
    logger.info(`User ${user._id} Stripe account updated (payouts=${account.payouts_enabled})`);
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
 * Paiement autorisé (carte confirmée, montant bloqué)
 */
async function handlePaymentAuthorized(paymentIntent) {
  try {
    const delivery = await Delivery.findOne({ 'payment.stripePaymentIntentId': paymentIntent.id });
    if (!delivery) return;
    if (delivery.payment.status === 'pending' || delivery.payment.status === 'failed') {
      delivery.payment.status = 'held';
      delivery.payment.heldAt = new Date();
      await delivery.save();
      logger.info(`Payment authorized for delivery: ${delivery._id}`);
    }
  } catch (error) {
    logger.error('Failed to handle amount_capturable_updated:', error);
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
 * Handle transfer.reversed event
 */
async function handleTransferReversed(transfer) {
  try {
    const delivery = await Delivery.findOne({
      'payment.stripeTransferId': transfer.id,
    });
    
    if (!delivery) {
      logger.warn(`Delivery not found for transfer: ${transfer.id}`);
      return;
    }
    
    delivery.payment.status = 'refunded';
    await delivery.save();
    
    logger.error(`Transfer reversed for delivery: ${delivery._id}`);
  } catch (error) {
    logger.error('Failed to handle transfer.reversed:', error);
  }
}

/**
 * Handle transfer.updated event
 */
async function handleTransferUpdated(transfer) {
  try {
    const delivery = await Delivery.findOne({
      'payment.stripeTransferId': transfer.id,
    });
    
    if (!delivery) {
      logger.warn(`Delivery not found for transfer: ${transfer.id}`);
      return;
    }
    
    // Update transfer status if needed
    if (transfer.reversed) {
      delivery.payment.status = 'refunded';
      await delivery.save();
      logger.info(`Transfer updated (reversed) for delivery: ${delivery._id}`);
    }
  } catch (error) {
    logger.error('Failed to handle transfer.updated:', error);
  }
}
