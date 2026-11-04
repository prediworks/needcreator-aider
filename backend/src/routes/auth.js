import express from 'express';
import multer from 'multer';
import { uploadAvatar, removeAvatar } from '../controllers/avatar.js';
import { authenticate, authenticateFirebase, authorize } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { verifyTurnstile } from '../middleware/turnstile.js';
import { acceptTerms, exportData, deleteAccount, updateLegalInfo } from '../controllers/account.js';
import { getMediaKit, getPayouts, submitQuiz } from '../controllers/creatorTools.js';
import { ownerOnly, getTeam, inviteMember, cancelInvitation, removeMember, invitationInfo } from '../controllers/team.js';
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
router.put('/legal-info', authenticate, ownerOnly, (req, res, next) => validate(req.user.role === 'brand' ? schemas.legalInfoBrand : schemas.legalInfoCreator)(req, res, next), updateLegalInfo);
router.get('/export', authenticate, exportData);
router.delete('/account', authenticate, ownerOnly, deleteAccount);

// Profile (authenticate required)
router.get('/profile', authenticate, getProfile);
router.get('/profile/:userId', getProfile); // Public profile endpoint
router.patch('/profile', authenticate, updateProfile);

// Photo de profil (créateur) / logo (marque) : 5 Mo au plus, recadrée côté serveur
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => cb(/^image\/(jpeg|png|webp)$/.test(file.mimetype) ? null : Object.assign(new Error('Image JPG, PNG ou WebP uniquement'), { status: 400 }), true) });
const avatarUploadHandler = (req, res, next) => avatarUpload.single('avatar')(req, res, (err) => {
  if (!err) return next();
  res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image trop lourde : 5 Mo au plus' : err.message });
});
router.post('/avatar', authenticate, ownerOnly, avatarUploadHandler, uploadAvatar);
router.delete('/avatar', authenticate, ownerOnly, removeAvatar);

// Vérification d'entreprise (marques)
router.post('/business-verification', authenticate, authorize('brand'), ownerOnly, validate(schemas.businessVerification), verifyBusiness);

// Équipe marque (propriétaire seulement, sauf lecture de l'invitation à l'inscription)
router.get('/team', authenticate, authorize('brand'), ownerOnly, getTeam);
router.post('/team/invite', authenticate, authorize('brand'), ownerOnly, inviteMember);
router.delete('/team/invitations/:email', authenticate, authorize('brand'), ownerOnly, cancelInvitation);
router.delete('/team/members/:memberId', authenticate, authorize('brand'), ownerOnly, removeMember);
router.get('/team/invitations/:token', invitationInfo);

// Parrainage et revenus
router.get('/referral', authenticate, getReferral);
router.get('/earnings', authenticate, authorize('creator'), getEarnings);
router.get('/media-kit', authenticate, authorize('creator'), getMediaKit);   // lien court + QR code
router.get('/payouts', authenticate, authorize('creator'), getPayouts);       // calendrier des virements + seuils micro
router.post('/academy/:slug/quiz', authenticate, authorize('creator'), submitQuiz);

// Badge Ambassadeur : lien vers une vidéo qui parle de NeedCreator
router.post('/ambassador', authenticate, authorize('creator'), validate(schemas.ambassadorVideo), submitAmbassadorVideo);

// Stripe Connect (créateurs) : démarrer l'onboarding et consulter le statut
router.post('/stripe/connect', authenticate, authorize('creator'), validate(schemas.stripeConnect), startStripeConnect);
router.get('/stripe/status', authenticate, authorize('creator'), getStripeConnectStatus);

logger.info('Auth routes configured');

export default router;
