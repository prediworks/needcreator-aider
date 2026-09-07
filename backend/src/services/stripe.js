import Stripe from 'stripe';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

const stripe = new Stripe(config.stripe.secretKey, {
  ...(config.stripe.apiVersion && { apiVersion: config.stripe.apiVersion }),
});

export { stripe };

/**
 * Create Stripe Connect account for creator (using Accounts v1, kept for onboarding)
 */
export async function createConnectAccount(email, country = 'FR') {
  try {
    const account = await stripe.accounts.create({
      type: 'express',
      country,
      email,
      capabilities: {
        transfers: { requested: true },
      },
      business_type: 'individual',
    });
    
    logger.info(`Stripe Connect account created: ${account.id}`);
    return account;
  } catch (error) {
    logger.error('Failed to create Stripe Connect account:', error);
    throw error;
  }
}

/**
 * Create account link for onboarding
 */
export async function createAccountLink(accountId, returnUrl, refreshUrl) {
  try {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    
    return accountLink.url;
  } catch (error) {
    logger.error('Failed to create account link:', error);
    throw error;
  }
}

/**
 * Create customer for brand
 */
export async function createCustomer(email, name) {
  try {
    const customer = await stripe.customers.create({
      email,
      name,
    });
    
    logger.info(`Stripe customer created: ${customer.id}`);
    return customer;
  } catch (error) {
    logger.error('Failed to create Stripe customer:', error);
    throw error;
  }
}

/**
 * Create payment intent with hold
 */
export async function createPaymentIntent(amount, currency, customerId, metadata) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      customer: customerId,
      capture_method: 'manual', // Hold the payment
      payment_method_types: ['card'], // pas de moyens de paiement à redirection
      metadata,
    });
    
    logger.info(`Payment intent created: ${paymentIntent.id}`);
    return paymentIntent;
  } catch (error) {
    logger.error('Failed to create payment intent:', error);
    throw error;
  }
}

/**
 * Confirme un PaymentIntent avec une carte de test (hors production uniquement).
 * Permet de tester le flux complet sans intégrer Stripe Elements côté front.
 */
export async function confirmWithTestCard(paymentIntentId) {
  if (config.env === 'production') {
    throw new Error('confirmWithTestCard is not allowed in production');
  }
  const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: 'pm_card_visa',
  });
  logger.info(`Payment intent confirmed with test card: ${paymentIntent.id} (${paymentIntent.status})`);
  return paymentIntent;
}

export async function createSetupIntent(customerId) {
  return stripe.setupIntents.create({ customer: customerId, payment_method_types: ['card'], usage: 'off_session' });
}

/**
 * Confirme un PaymentIntent avec une carte déjà enregistrée (paiement groupé)
 */
export async function confirmWithPaymentMethod(paymentIntentId, paymentMethodId) {
  return stripe.paymentIntents.confirm(paymentIntentId, { payment_method: paymentMethodId, off_session: true });
}

export async function retrievePaymentIntent(paymentIntentId) {
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

/**
 * Capture payment (encaissement) — ne transfère pas encore au créateur
 */
export async function capturePayment(paymentIntentId) {
  try {
    const current = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (current.status === 'succeeded') {
      return current; // déjà capturé
    }
    const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
    logger.info(`Payment captured: ${paymentIntent.id}`);
    return paymentIntent;
  } catch (error) {
    logger.error('Failed to capture payment:', error);
    throw error;
  }
}

/**
 * Transfert au créateur (montant déjà net de commission)
 */
export async function transferToCreator(paymentIntentId, creatorAccountId, creatorAmount, currency = 'eur') {
  try {
    const transfer = await stripe.transfers.create({
      amount: Math.round(creatorAmount * 100),
      currency: currency.toLowerCase(),
      destination: creatorAccountId,
      transfer_group: paymentIntentId,
      metadata: { paymentIntentId },
    });
    logger.info(`Transfer created: ${transfer.id} → ${creatorAccountId}`);
    return transfer;
  } catch (error) {
    logger.error('Failed to transfer to creator:', error);
    throw error;
  }
}

/**
 * Capture payment and transfer to creator.
 * Si le créateur n'a pas encore de compte Stripe Connect opérationnel,
 * le paiement est encaissé et le virement sera fait plus tard (transferred=false).
 */
export async function captureAndTransfer(paymentIntentId, creatorAccountId, amount, platformFee) {
  const paymentIntent = await capturePayment(paymentIntentId);
  const creatorAmount = amount - platformFee;
  
  if (!creatorAccountId) {
    logger.warn(`No Stripe Connect account for creator — payment ${paymentIntentId} captured, transfer deferred`);
    return { paymentIntent, transfer: null, transferred: false };
  }
  
  try {
    const transfer = await transferToCreator(paymentIntentId, creatorAccountId, creatorAmount, paymentIntent.currency);
    return { paymentIntent, transfer, transferred: true };
  } catch (error) {
    // Ne bloque pas l'approbation : l'argent est encaissé, le virement sera retenté
    logger.error('Transfer failed, payment captured but not transferred:', error.message);
    return { paymentIntent, transfer: null, transferred: false, transferError: error.message };
  }
}

/**
 * Refund payment
 */
export async function refundPayment(paymentIntentId, amount = null) {
  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(amount && { amount: Math.round(amount * 100) }),
    });
    
    logger.info(`Payment refunded: ${refund.id}`);
    return refund;
  } catch (error) {
    logger.error('Failed to refund payment:', error);
    throw error;
  }
}

/**
 * Get account status
 */
export async function getAccountStatus(accountId) {
  try {
    const account = await stripe.accounts.retrieve(accountId);
    
    return {
      id: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements: account.requirements,
    };
  } catch (error) {
    logger.error('Failed to get account status:', error);
    throw error;
  }
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(payload, signature) {
  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      config.stripe.webhookSecret
    );
    return event;
  } catch (error) {
    logger.error('Webhook signature verification failed:', error);
    throw error;
  }
}
