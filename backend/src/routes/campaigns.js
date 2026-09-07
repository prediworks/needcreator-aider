import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import {
  createCampaign,
  publishCampaign,
  getCampaigns,
  getCampaign,
  applyToCampaign,
  selectCreator,
  updateCampaign,
  cancelCampaign,
  updateQuote,
  inviteCreator,
  createPaymentSetup,
  payAllPending,
} from '../controllers/campaigns.js';

import { aiBrief, aiStatus } from '../controllers/ai.js';

const router = express.Router();

// Brief assisté par IA
router.get('/ai-brief/status', authenticate, aiStatus);
router.post('/ai-brief', authenticate, authorize('brand'), validate(schemas.aiBrief), aiBrief);

// Campaign CRUD
router.post('/', authenticate, authorize('brand'), validate(schemas.createCampaign), createCampaign);
router.get('/', authenticate, getCampaigns);
router.get('/:campaignId', authenticate, getCampaign);
router.patch('/:campaignId', authenticate, authorize('brand'), validate(schemas.updateCampaign), updateCampaign);
router.delete('/:campaignId', authenticate, authorize('brand'), cancelCampaign);

// Campaign actions
router.post('/:campaignId/publish', authenticate, authorize('brand'), publishCampaign);
router.post('/:campaignId/apply', authenticate, authorize('creator'), validate(schemas.quote), applyToCampaign);
router.patch('/:campaignId/quote', authenticate, authorize('creator'), validate(schemas.quote), updateQuote);
router.post('/:campaignId/invite/:creatorId', authenticate, authorize('brand'), inviteCreator);
router.post('/:campaignId/payment-setup', authenticate, authorize('brand'), createPaymentSetup);
router.post('/:campaignId/pay-all', authenticate, authorize('brand'), payAllPending);
router.post('/:campaignId/select/:creatorId', authenticate, authorize('brand'), selectCreator);

export default router;
