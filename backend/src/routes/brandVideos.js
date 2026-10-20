import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { brandVideosByToken, brandVideosForUser } from '../services/showcase.js';
import logger from '../utils/logger.js';

/** Vidéos tournées pour une marque : page publique par lien personnel, et liste dans l'espace de la marque inscrite */
const router = express.Router();

router.get('/public/:token', async (req, res) => {
  try {
    const data = await brandVideosByToken(req.params.token);
    if (!data) return res.status(404).json({ error: 'Lien inconnu ou expiré' });
    res.json(data);
  } catch (error) { logger.error('brandVideosByToken failed:', error); res.status(500).json({ error: 'Page indisponible pour le moment' }); }
});

router.get('/mine', authenticate, authorize('brand'), async (req, res) => {
  try { res.json({ videos: await brandVideosForUser(req.user) }); } catch (error) { logger.error('brandVideosForUser failed:', error); res.status(500).json({ error: 'Liste indisponible pour le moment' }); }
});

export default router;
