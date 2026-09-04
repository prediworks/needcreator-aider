import User from '../models/User.js';
import { createConnectAccount, createCustomer } from '../services/stripe.js';
import { sendCreatorWelcome, sendBrandWelcome } from '../services/email.js';
import logger from '../utils/logger.js';

/**
 * Register new creator
 */
export async function registerCreator(req, res) {
  try {
    const { email, name, bio, niches, minPrice } = req.body;
    const { uid } = req.firebaseUser;
    
    // Check if user already exists
    const existingUser = await User.findOne({ firebaseUid: uid });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Create Stripe Connect account
    const stripeAccount = await createConnectAccount(email);
    
    // Create user
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
      },
      stripeAccountId: stripeAccount.id,
      status: 'pending', // Needs admin approval
    });
    
    await user.save();
    
    // Send welcome email
    await sendCreatorWelcome(email, name);
    
    logger.info(`Creator registered: ${user._id}`);
    
    res.status(201).json({
      message: 'Creator account created successfully',
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        status: user.status,
        profileCompletion: user.profileCompletion,
      },
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
    const { email, companyName, website, industry } = req.body;
    const { uid } = req.firebaseUser;
    
    // Check if user already exists
    const existingUser = await User.findOne({ firebaseUid: uid });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
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
    
    // Send welcome email
    await sendBrandWelcome(email, companyName);
    
    logger.info(`Brand registered: ${user._id}`);
    
    res.status(201).json({
      message: 'Brand account created successfully',
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        status: user.status,
        profileCompletion: user.profileCompletion,
      },
    });
  } catch (error) {
    logger.error('Brand registration failed:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
}

/**
 * Get current user profile
 */
export async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user._id)
      .select('-__v')
      .lean();
    
    res.json({
      user: {
        ...user,
        profileCompletion: req.user.profileCompletion,
      },
    });
  } catch (error) {
    logger.error('Failed to get profile:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
}

/**
 * Update user profile
 */
export async function updateProfile(req, res) {
  try {
    const updates = req.body;
    const user = req.user;
    
    // Update allowed fields based on role
    if (user.role === 'creator') {
      const allowedFields = ['profile.name', 'profile.bio', 'profile.avatar', 'profile.niches', 'profile.pricing'];
      Object.keys(updates).forEach(key => {
        if (allowedFields.some(field => key.startsWith(field))) {
          user.set(key, updates[key]);
        }
      });
    } else if (user.role === 'brand') {
      const allowedFields = ['profile.name', 'profile.companyName', 'profile.website', 'profile.industry', 'profile.avatar'];
      Object.keys(updates).forEach(key => {
        if (allowedFields.some(field => key.startsWith(field))) {
          user.set(key, updates[key]);
        }
      });
    }
    
    await user.save();
    
    logger.info(`Profile updated: ${user._id}`);
    
    res.json({
      message: 'Profile updated successfully',
      user: {
        ...user.toObject(),
        profileCompletion: user.profileCompletion,
      },
    });
  } catch (error) {
    logger.error('Failed to update profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}
