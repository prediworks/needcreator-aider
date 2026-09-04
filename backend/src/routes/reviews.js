import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import {
  createReview,
  getUserReviews,
  respondToReview,
} from '../controllers/reviews.js';

const router = express.Router();

// Reviews
router.post('/campaign/:campaignId', authenticate, validate(schemas.createReview), createReview);
router.get('/user/:userId', getUserReviews);
router.post('/:reviewId/respond', authenticate, respondToReview);

export default router;
