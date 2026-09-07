import express from 'express';
import { authenticate, authenticateFirebase, authorize } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import {
  registerCreator,
  registerBrand,
  getProfile,
  updateProfile,
  startStripeConnect,
  getStripeConnectStatus,
  submitAmbassadorVideo,
  getReferral,
  getEarnings,
} from '../controllers/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Log all requests to auth routes
router.use((req, res, next) => {
  logger.info(`Auth route: ${req.method} ${req.path}`);
  next();
});

// Registration (authenticateFirebase only, user doesn't exist yet)
router.post('/register/creator', authenticateFirebase, validate(schemas.registerCreator), registerCreator);
router.post('/register/brand', authenticateFirebase, validate(schemas.registerBrand), registerBrand);

// Profile (authenticate required)
router.get('/profile', authenticate, getProfile);
router.get('/profile/:userId', getProfile); // Public profile endpoint
router.patch('/profile', authenticate, updateProfile);

// Parrainage et revenus
router.get('/referral', authenticate, getReferral);
router.get('/earnings', authenticate, authorize('creator'), getEarnings);

// Badge Ambassadeur : lien vers une vidéo qui parle de NeedCreator
router.post('/ambassador', authenticate, authorize('creator'), validate(schemas.ambassadorVideo), submitAmbassadorVideo);

// Stripe Connect (créateurs) : démarrer l'onboarding et consulter le statut
router.post('/stripe/connect', authenticate, authorize('creator'), validate(schemas.stripeConnect), startStripeConnect);
router.get('/stripe/status', authenticate, authorize('creator'), getStripeConnectStatus);

logger.info('Auth routes configured');

export default router;
