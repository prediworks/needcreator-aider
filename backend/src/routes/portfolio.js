import express from 'express';
import multer from 'multer';
import { validate, schemas } from '../middleware/validate.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';
import {
  uploadPortfolioVideo,
  getPortfolioUploadUrl,
  registerPortfolioVideo,
  deletePortfolioVideo,
  getCreatorPortfolio,
} from '../controllers/portfolio.js';

const router = express.Router();

// Configure multer for video uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  },
});

// Portfolio management
router.post(
  '/upload',
  authenticate,
  authorize('creator'),
  upload.single('video'),
  uploadPortfolioVideo
);
// Envoi direct navigateur → R2 (sans limite de taille du proxy)
router.post('/upload-url', authenticate, authorize('creator'), validate(schemas.uploadUrl), getPortfolioUploadUrl);
router.post('/videos', authenticate, authorize('creator'), validate(schemas.portfolioRegister), registerPortfolioVideo);
router.delete('/:videoId', authenticate, authorize('creator'), deletePortfolioVideo);

// Public portfolio
router.get('/creator/:creatorId', optionalAuth, getCreatorPortfolio);

export default router;
