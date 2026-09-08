import User from '../models/User.js';
import { config } from '../config/index.js';
import { stripe } from '../services/stripe.js';
import logger from '../utils/logger.js';

const LOOKUP_KEY = 'needcreator_pro_monthly';

/**
 * Prix Stripe de l'abonnement Pro : STRIPE_PRO_PRICE_ID, sinon recherché/créé par lookup_key (mode test pratique)
 */
export async function ensureProPrice() {
  if (config.plans.stripeProPriceId) return config.plans.stripeProPriceId;
  const existing = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], active: true, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const product = await stripe.products.create({ name: 'NeedCreator Pro', description: 'Abonnement mensuel marque : brief IA illimité, gifting, multi-créateurs, commission réduite' });
  const price = await stripe.prices.create({
    product: product.id, currency: 'eur', unit_amount: Math.round(config.plans.proPriceEur * 100),
    recurring: { interval: 'month' }, lookup_key: LOOKUP_KEY,
  });
  logger.info(`Stripe Pro price created: ${price.id}`);
  return price.id;
}

/**
 * Applique l'état d'un abonnement Stripe à l'utilisateur
 */
export async function applyStripeSubscription(user, sub) {
  const map = { trialing: 'trialing', active: 'active', past_due: 'past_due', canceled: 'canceled', unpaid: 'past_due', incomplete: 'none', incomplete_expired: 'none', paused: 'canceled' };
  const status = map[sub.status] || 'none';
  const isLive = ['trialing', 'active', 'past_due'].includes(status);
  user.set('subscription', {
    plan: isLive ? 'pro' : 'free',
    status,
    trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : (sub.items?.data?.[0]?.current_period_end ? new Date(sub.items.data[0].current_period_end * 1000) : null),
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    stripeSubscriptionId: sub.id,
  });
  await user.save();
}

export function planInfo(user) {
  const sub = user.subscription || {};
  return {
    plan: user.isPro() ? 'pro' : 'free',
    status: sub.status || 'none',
    trialEndsAt: sub.trialEndsAt || null,
    currentPeriodEnd: sub.currentPeriodEnd || null,
    cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
    hasStripeSubscription: !!sub.stripeSubscriptionId,
    price: config.plans.proPriceEur,
    trialDays: config.plans.proTrialDays,
    feePercent: user.isPro() ? config.plans.proFeePercent : config.stripe.platformFeePercent,
    proFeePercent: config.plans.proFeePercent,
    standardFeePercent: config.stripe.platformFeePercent,
    aiBriefQuota: user.isPro() ? null : config.plans.aiBriefFreeQuota,
  };
}

export async function billingStatus(req, res) {
  const user = req.user;
  user.rollUsage();
  res.json({
    ...planInfo(user),
    aiBriefsUsed: user.usage?.aiBriefCount || 0,
    limits: config.limits,
    gifting: config.gifting,
  });
}

/**
 * Crée une session Stripe Checkout pour souscrire au Pro
 */
export async function createCheckout(req, res) {
  try {
    const user = req.user;
    if (!user.stripeCustomerId) return res.status(400).json({ error: 'Aucun client Stripe' });
    if (user.subscription?.stripeSubscriptionId && user.isPro() && user.subscription.status !== 'trialing') {
      return res.status(400).json({ error: 'Vous êtes déjà abonné' });
    }
    const priceId = await ensureProPrice();
    const frontend = config.cors.origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: user.stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontend}/profile?billing=success`,
      cancel_url: `${frontend}/profile?billing=cancel`,
      allow_promotion_codes: true,
      locale: 'fr',
      metadata: { userId: String(user._id) },
    });
    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    logger.error('Checkout creation failed:', error);
    res.status(500).json({ error: `Impossible de démarrer l'abonnement : ${error?.raw?.message || error.message}` });
  }
}

/**
 * Portail client Stripe (changer de carte, annuler)
 */
export async function createPortal(req, res) {
  try {
    const user = req.user;
    if (!user.stripeCustomerId) return res.status(400).json({ error: 'Aucun client Stripe' });
    const session = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${config.cors.origin}/profile` });
    res.json({ url: session.url });
  } catch (error) {
    logger.error('Portal creation failed:', error);
    res.status(500).json({ error: `Portail indisponible : ${error?.raw?.message || error.message}. Activez le portail client dans le dashboard Stripe (Paramètres → Portail client).` });
  }
}

/**
 * Resynchronise l'abonnement depuis Stripe (utile sans webhook, après le retour de Checkout)
 */
export async function syncSubscription(req, res) {
  try {
    const user = req.user;
    if (!user.stripeCustomerId) return res.json(planInfo(user));
    const subs = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: 'all', limit: 5 });
    const live = subs.data.find(s => ['trialing', 'active', 'past_due'].includes(s.status)) || subs.data[0];
    if (live) await applyStripeSubscription(user, live);
    res.json(planInfo(user));
  } catch (error) {
    logger.error('Subscription sync failed:', error);
    res.status(500).json({ error: 'Synchronisation impossible' });
  }
}
