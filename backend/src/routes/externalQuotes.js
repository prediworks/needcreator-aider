import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { listExternalQuotes, createExternalQuote, updateExternalQuote, sendExternalQuote, markExternalQuoteDirect, deleteExternalQuote, publicExternalQuote, declineExternalQuote, acceptExternalQuoteAsBrand } from '../controllers/externalQuotes.js';

const router = express.Router();
// Public : vue du devis par le client, refus, acceptation par une marque connectée
router.get('/public/:token', publicExternalQuote);
router.post('/public/:token/decline', declineExternalQuote);
router.post('/public/:token/accept', authenticate, authorize('brand'), acceptExternalQuoteAsBrand);
// Créateur
router.get('/', authenticate, authorize('creator'), listExternalQuotes);
router.post('/', authenticate, authorize('creator'), createExternalQuote);
router.patch('/:id', authenticate, authorize('creator'), updateExternalQuote);
router.post('/:id/send', authenticate, authorize('creator'), sendExternalQuote);
router.post('/:id/direct', authenticate, authorize('creator'), markExternalQuoteDirect);
router.delete('/:id', authenticate, authorize('creator'), deleteExternalQuote);
export default router;
