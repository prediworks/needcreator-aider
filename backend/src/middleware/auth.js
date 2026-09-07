import admin from 'firebase-admin';
import { config } from '../config/index.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

// Initialize Firebase Admin
let firebaseApp;
try {
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebase.projectId,
      privateKey: config.firebase.privateKey,
      clientEmail: config.firebase.clientEmail,
    }),
  });
  logger.info('Firebase Admin initialized');
} catch (error) {
  logger.error('Firebase Admin initialization failed:', error);
}

/**
 * Middleware to verify Firebase ID token without requiring an existing user
 */
export async function authenticateFirebase(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    req.firebaseUser = decodedToken;
    
    next();
  } catch (error) {
    logger.error('Firebase authentication error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Middleware to verify Firebase ID token and load the user from DB
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    
    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Find user in database
    const user = await User.findOne({ firebaseUid: decodedToken.uid });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.status === 'suspended' || user.status === 'banned') {
      return res.status(403).json({ error: 'Account suspended or banned' });
    }
    
    // Attach user to request
    req.user = user;
    req.firebaseUser = decodedToken;
    
    // Update last login (sans re-valider tout le document)
    User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).catch(() => {});
    
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Middleware to check user role
 */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: roles,
        current: req.user.role,
      });
    }
    
    next();
  };
}

/**
 * Optional authentication - doesn't fail if no token
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const user = await User.findOne({ firebaseUid: decodedToken.uid });
    
    if (user && user.status === 'active') {
      req.user = user;
      req.firebaseUser = decodedToken;
    }
    
    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
}
