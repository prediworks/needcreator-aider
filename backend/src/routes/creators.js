import express from 'express';
import { creatorBySlug } from '../controllers/creatorTools.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { searchCreators, publicCreators } from '../controllers/creators.js';
import { createQuoteRequest } from '../services/quoteRequests.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Annuaire des créateurs (marques et admin)
router.get('/public', publicCreators); // site public, créateurs ayant donné leur accord
router.get('/slug/:slug', creatorBySlug); // kit média : /c/<slug>
// « Demander un devis » sans compte, depuis la page publique du créateur
router.post('/:id/quote-request', async (req, res) => {
  try {
    const { creatorName } = await createQuoteRequest(req.params.id, req.body, { ip: req.ip });
    res.status(201).json({ message: `Demande envoyée à ${creatorName} : vous recevrez son devis par email.` });
  } catch (error) {
    if (!error.status) logger.error('createQuoteRequest failed:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Envoi impossible pour le moment' });
  }
});
router.get('/', authenticate, authorize('brand', 'admin'), searchCreators);

export default router;
