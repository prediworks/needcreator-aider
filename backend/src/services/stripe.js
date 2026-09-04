import Stripe from 'stripe';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

const stripe = new Stripe(config.stripe.secretKey);

/**
 * Create Stripe Connect account for creator
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
 * Capture payment and transfer to creator
 */
export async function captureAndTransfer(paymentIntentId, creatorAccountId, amount, platformFee) {
  try {
    // Capture the payment
    const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
    
    // Calculate amounts
    const creatorAmount = amount - platformFee;
    
    // Transfer to creator
    const transfer = await stripe.transfers.create({
      amount: Math.round(creatorAmount * 100),
      currency: paymentIntent.currency,
      destination: creatorAccountId,
      transfer_group: paymentIntent.id,
      metadata: {
        paymentIntentId: paymentIntent.id,
      },
    });
    
    logger.info(`Payment captured and transferred: ${transfer.id}`);
    return { paymentIntent, transfer };
  } catch (error) {
    logger.error('Failed to capture and transfer:', error);
    throw error;
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
import Stripe from 'stripe';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

const stripe = new Stripe(config.stripe.secretKey);

/**
 * Create Stripe Connect account for creator
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
 * Capture payment and transfer to creator
 */
export async function captureAndTransfer(paymentIntentId, creatorAccountId, amount, platformFee) {
  try {
    // Capture the payment
    const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
    
    // Calculate amounts
    const creatorAmount = amount - platformFee;
    
    // Transfer to creator
    const transfer = await stripe.transfers.create({
      amount: Math.round(creatorAmount * 100),
      currency: paymentIntent.currency,
      destination: creatorAccountId,
      transfer_group: paymentIntent.id,
      metadata: {
        paymentIntentId: paymentIntent.id,
      },
    });
    
    logger.info(`Payment captured and transferred: ${transfer.id}`);
    return { paymentIntent, transfer };
  } catch (error) {
    logger.error('Failed to capture and transfer:', error);
    throw error;
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
