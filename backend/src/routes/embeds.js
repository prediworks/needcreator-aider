import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveEmbed } from '../services/embeds.js';

const router = express.Router();

// Aperçu intégré d'une publication Instagram, TikTok ou YouTube (livraisons par lien, prospection)
router.get('/', authenticate, async (req, res) => {
  const data = await resolveEmbed(req.query.url).catch(() => null);
  if (!data) return res.status(422).json({ error: 'Adresse non reconnue : publication Instagram, TikTok ou YouTube attendue' });
  res.json({ embed: data });
});

export default router;
