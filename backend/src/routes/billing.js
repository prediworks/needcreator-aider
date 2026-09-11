import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { billingStatus, createCheckout, createPortal, syncSubscription } from '../controllers/billing.js';
import { ownerOnly } from '../controllers/team.js';

const router = express.Router();
router.use(authenticate, authorize('brand'));
router.get('/status', billingStatus);
router.post('/checkout', ownerOnly, createCheckout);
router.post('/portal', ownerOnly, createPortal);
router.post('/sync', syncSubscription);
export default router;
