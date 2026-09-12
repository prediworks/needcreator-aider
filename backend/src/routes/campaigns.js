import express from 'express';
import { authenticate, authorize, requireVerifiedEmail } from '../middleware/auth.js';
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
  listTemplates,
  counterOffer,
  respondCounterOffer,
  listPublicCampaigns,
  getPublicCampaign,
  inviteExternalCreator,
  externalInvitationInfo,
} from '../controllers/campaigns.js';

import { aiBrief, aiStatus } from '../controllers/ai.js';
import { getMarketRates } from '../controllers/marketRates.js';

const router = express.Router();

// Brief assisté par IA
router.get('/ai-brief/status', authenticate, aiStatus);
router.get('/market-rates', authenticate, getMarketRates); // suggestion de prix : médiane des devis acceptés
router.post('/ai-brief', authenticate, authorize('brand'), validate(schemas.aiBrief), aiBrief);

// Pages publiques (sans authentification) : liste et détail des campagnes ouvertes, invitation extérieure
router.get('/public', listPublicCampaigns);
router.get('/public/:campaignId', getPublicCampaign);
router.get('/invitation/:token', externalInvitationInfo);

// Campaign CRUD
router.post('/', authenticate, authorize('brand'), validate(schemas.createCampaign), createCampaign);
router.get('/templates', authenticate, authorize('brand'), listTemplates); // modèles par secteur
router.get('/', authenticate, getCampaigns);
router.get('/:campaignId', authenticate, getCampaign);
router.patch('/:campaignId', authenticate, authorize('brand'), validate(schemas.updateCampaign), updateCampaign);
router.delete('/:campaignId', authenticate, authorize('brand'), cancelCampaign);

// Campaign actions
router.post('/:campaignId/publish', authenticate, authorize('brand'), requireVerifiedEmail, publishCampaign);
router.post('/:campaignId/apply', authenticate, authorize('creator'), requireVerifiedEmail, validate(schemas.quote), applyToCampaign);
router.patch('/:campaignId/quote', authenticate, authorize('creator'), validate(schemas.quote), updateQuote);
router.post('/:campaignId/invite/:creatorId', authenticate, authorize('brand'), inviteCreator);
router.post('/:campaignId/invite-external', authenticate, authorize('brand'), validate(schemas.externalInvite), inviteExternalCreator); // créateur non inscrit
router.post('/:campaignId/applications/:creatorId/counter', authenticate, authorize('brand'), validate(schemas.counterOffer), counterOffer); // contre-proposition
router.post('/:campaignId/counter/respond', authenticate, authorize('creator'), validate(schemas.counterOfferResponse), respondCounterOffer);
router.post('/:campaignId/payment-setup', authenticate, authorize('brand'), createPaymentSetup);
router.post('/:campaignId/pay-all', authenticate, authorize('brand'), payAllPending);
router.post('/:campaignId/select/:creatorId', authenticate, authorize('brand'), selectCreator);

export default router;
