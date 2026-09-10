import express from 'express';
import { authenticate, authenticateFirebase, authorize } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { verifyTurnstile } from '../middleware/turnstile.js';
import { acceptTerms, exportData, deleteAccount, updateLegalInfo } from '../controllers/account.js';
import { sendVerificationEmail, requestPasswordReset, passwordResetLimiter } from '../controllers/authEmails.js';
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
  verifyBusiness,
} from '../controllers/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Log all requests to auth routes
router.use((req, res, next) => {
  logger.info(`Auth route: ${req.method} ${req.path}`);
  next();
});

// Registration (authenticateFirebase only, user doesn't exist yet)
router.post('/register/creator', authenticateFirebase, verifyTurnstile, validate(schemas.registerCreator), registerCreator);
router.post('/register/brand', authenticateFirebase, verifyTurnstile, validate(schemas.registerBrand), registerBrand);

// Emails d'authentification (envoyés par notre SMTP)
router.post('/send-verification', authenticate, sendVerificationEmail);
router.post('/password-reset', passwordResetLimiter, requestPasswordReset);

// Légal / RGPD
router.post('/accept-terms', authenticate, acceptTerms);
router.put('/legal-info', authenticate, (req, res, next) => validate(req.user.role === 'brand' ? schemas.legalInfoBrand : schemas.legalInfoCreator)(req, res, next), updateLegalInfo);
router.get('/export', authenticate, exportData);
router.delete('/account', authenticate, deleteAccount);

// Profile (authenticate required)
router.get('/profile', authenticate, getProfile);
router.get('/profile/:userId', getProfile); // Public profile endpoint
router.patch('/profile', authenticate, updateProfile);

// Vérification d'entreprise (marques)
router.post('/business-verification', authenticate, authorize('brand'), validate(schemas.businessVerification), verifyBusiness);

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
