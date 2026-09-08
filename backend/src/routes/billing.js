import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { billingStatus, createCheckout, createPortal, syncSubscription } from '../controllers/billing.js';

const router = express.Router();
router.use(authenticate, authorize('brand'));
router.get('/status', billingStatus);
router.post('/checkout', createCheckout);
router.post('/portal', createPortal);
router.post('/sync', syncSubscription);
export default router;
