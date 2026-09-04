import express from 'express';
import { handleStripeWebhook } from '../controllers/webhooks.js';

const router = express.Router();

// Stripe webhook (raw body needed for signature verification)
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

export default router;
