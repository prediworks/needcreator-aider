import User from '../models/User.js';
import { config } from '../config/index.js';
import {
  createCustomer,
  createConnectAccount,
  createAccountLink,
  getAccountStatus,
} from '../services/stripe.js';
import { resolveUrlsIn } from '../services/storage.js';
import { sendCreatorWelcome, sendBrandWelcome } from '../services/email.js';
import logger from '../utils/logger.js';

/**
 * Sérialise un utilisateur pour le frontend (ajoute id, complétion, blocages)
 */
async function serializeUser(userDoc) {
  const user = userDoc.toObject ? userDoc.toObject() : userDoc;
  const out = {
    ...user,
    id: user._id,
    profileCompletion: userDoc.profileCompletion ?? user.profileCompletion,
  };
  if (user.role === 'creator') {
    out.applyBlockers = typeof userDoc.applyBlockers === 'function' ? userDoc.applyBlockers() : [];
    out.canApply = typeof userDoc.canApplyToCampaign === 'function' ? userDoc.canApplyToCampaign() : false;
    if (user.profile?.portfolio?.length) {
      out.profile = { ...user.profile, portfolio: await resolveUrlsIn(user.profile.portfolio) };
    }
  }
  return out;
}

/**
 * Register new creator
 */
export async function registerCreator(req, res) {
  try {
    const { email, name, bio, niches, minPrice } = req.body;
    const { uid } = req.firebaseUser;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ firebaseUid: uid }, { email: email.toLowerCase() }] });
    if (existingUser) {
      return res.status(400).json({ error: 'Un compte existe déjà avec cet email' });
    }

    // Create user without Stripe Connect account — the creator will connect later
    const user = new User({
      firebaseUid: uid,
      email,
      role: 'creator',
      profile: {
        name,
        bio,
        niches,
        pricing: {
          minPrice,
          avgPrice: minPrice,
        },
        stripeConnect: {
          accountId: null,
          onboardingComplete: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          requirements: {},
        },
      },
      status: 'pending', // Needs admin approval
    });

    await user.save();

    // Send welcome email (non bloquant)
    sendCreatorWelcome(email, name).catch(err =>
      logger.error('Failed to send welcome email:', err.message)
    );

    logger.info(`Creator registered: ${user._id}`);

    res.status(201).json({
      message: 'Creator account created successfully',
      user: await serializeUser(user),
    });
  } catch (error) {
    logger.error('Creator registration failed:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
}

/**
 * Register new brand
 */
export async function registerBrand(req, res) {
  try {
    logger.info('Brand registration started', {
      email: req.body.email,
      firebaseUid: req.firebaseUser?.uid
    });

    const { email, companyName, website, industry } = req.body;
    const { uid } = req.firebaseUser;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ firebaseUid: uid }, { email: email.toLowerCase() }] });
    if (existingUser) {
      logger.warn('User already exists', { firebaseUid: uid });
      return res.status(400).json({ error: 'Un compte existe déjà avec cet email' });
    }

    // Create Stripe customer
    const stripeCustomer = await createCustomer(email, companyName);

    // Create user
    const user = new User({
      firebaseUid: uid,
      email,
      role: 'brand',
      profile: {
        name: companyName,
        companyName,
        website,
        industry,
      },
      stripeCustomerId: stripeCustomer.id,
      status: 'active', // Brands are active immediately
    });

    await user.save();

    logger.info(`Brand user saved to database: ${user._id}`);

    // Send welcome email (non bloquant)
    sendBrandWelcome(email, companyName).catch(err =>
      logger.error('Failed to send welcome email:', err.message)
    );

    logger.info(`Brand registered successfully: ${user._id}`);

    res.status(201).json({
      message: 'Brand account created successfully',
      user: await serializeUser(user),
    });
  } catch (error) {
    logger.error('Brand registration failed:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
}

/**
 * Get current user profile or public profile by ID
 */
export async function getProfile(req, res) {
  try {
    const { userId } = req.params;

    // If userId is provided, get public profile
    if (userId) {
      const user = await User.findById(userId)
        .select('profile role status createdAt')
        .lean();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Ne pas exposer les infos Stripe
      if (user.profile?.stripeConnect) delete user.profile.stripeConnect;
      if (user.profile?.portfolio?.length) {
        user.profile.portfolio = await resolveUrlsIn(user.profile.portfolio);
      }

      return res.json({ user: { ...user, id: user._id } });
    }

    // Otherwise get current user's full profile
    const user = await User.findById(req.user._id).select('-__v');

    res.json({ user: await serializeUser(user) });
  } catch (error) {
    logger.error('Failed to get profile:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
}

/**
 * Aplatis un objet imbriqué en clés "a.b.c" (pour user.set)
 */
function flatten(obj, prefix = '', out = {}) {
  Object.entries(obj || {}).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      flatten(value, path, out);
    } else {
      out[path] = value;
    }
  });
  return out;
}

/**
 * Update user profile
 * Accepte { profile: { name, bio, ... } } ou { 'profile.name': ... }
 */
export async function updateProfile(req, res) {
  try {
    const updates = flatten(req.body);
    const user = req.user;

    const allowedFields = user.role === 'creator'
      ? [
          'profile.name',
          'profile.bio',
          'profile.avatar',
          'profile.niches',
          'profile.pricing.minPrice',
          'profile.pricing.avgPrice',
          'preferences.emailNotifications',
          'preferences.language',
        ]
      : [
          'profile.name',
          'profile.companyName',
          'profile.website',
          'profile.industry',
          'profile.avatar',
          'profile.companySize',
          'preferences.emailNotifications',
          'preferences.language',
        ];

    let applied = 0;
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key) && updates[key] !== undefined) {
        user.set(key, updates[key]);
        applied++;
      }
    });

    if (applied === 0) {
      return res.status(400).json({ error: 'Aucun champ modifiable fourni' });
    }

    await user.save();

    logger.info(`Profile updated: ${user._id} (${applied} champs)`);

    res.json({
      message: 'Profile updated successfully',
      user: await serializeUser(user),
    });
  } catch (error) {
    logger.error('Failed to update profile:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

/**
 * Démarre (ou reprend) l'onboarding Stripe Connect d'un créateur.
 * Retourne l'URL Stripe vers laquelle rediriger le créateur.
 */
export async function startStripeConnect(req, res) {
  try {
    const user = req.user;
    if (user.role !== 'creator') {
      return res.status(403).json({ error: 'Réservé aux créateurs' });
    }

    const frontend = config.cors.origin;
    const returnUrl = req.body?.returnUrl || `${frontend}/profile?stripe=return`;
    const refreshUrl = req.body?.refreshUrl || `${frontend}/profile?stripe=refresh`;

    let accountId = user.profile.stripeConnect?.accountId || user.stripeAccountId;

    if (!accountId) {
      const account = await createConnectAccount(user.email, 'FR');
      accountId = account.id;
      user.set('profile.stripeConnect.accountId', accountId);
      user.stripeAccountId = accountId;
      await user.save();
    }

    const url = await createAccountLink(accountId, returnUrl, refreshUrl);

    res.json({ url, accountId });
  } catch (error) {
    logger.error('Failed to start Stripe Connect onboarding:', error);
    const message = error?.raw?.message || error.message || 'Erreur Stripe';
    res.status(500).json({ error: `Impossible de démarrer la connexion Stripe : ${message}` });
  }
}

/**
 * Rafraîchit et renvoie le statut du compte Stripe Connect du créateur
 */
export async function getStripeConnectStatus(req, res) {
  try {
    const user = req.user;
    const accountId = user.profile.stripeConnect?.accountId || user.stripeAccountId;

    if (!accountId) {
      return res.json({ connected: false });
    }

    const status = await getAccountStatus(accountId);

    user.set('profile.stripeConnect.chargesEnabled', !!status.chargesEnabled);
    user.set('profile.stripeConnect.payoutsEnabled', !!status.payoutsEnabled);
    user.set('profile.stripeConnect.detailsSubmitted', !!status.detailsSubmitted);
    user.set('profile.stripeConnect.onboardingComplete', !!(status.detailsSubmitted && status.payoutsEnabled));
    user.set('profile.stripeConnect.requirements', {
      currentlyDue: status.requirements?.currently_due || [],
      disabledReason: status.requirements?.disabled_reason || null,
    });
    if (!user.stripeAccountId) user.stripeAccountId = accountId;
    await user.save();

    res.json({
      connected: true,
      accountId,
      chargesEnabled: status.chargesEnabled,
      payoutsEnabled: status.payoutsEnabled,
      detailsSubmitted: status.detailsSubmitted,
      onboardingComplete: user.profile.stripeConnect.onboardingComplete,
      currentlyDue: status.requirements?.currently_due || [],
    });
  } catch (error) {
    logger.error('Failed to get Stripe Connect status:', error);
    res.status(500).json({ error: 'Impossible de récupérer le statut Stripe' });
  }
}
