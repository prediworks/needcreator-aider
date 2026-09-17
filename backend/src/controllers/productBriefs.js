import ProductBrief from '../models/ProductBrief.js';
import { buildProductBrief, createDraftCampaignFromProductBrief } from '../services/productBrief.js';
import { aiConfig } from '../services/ai.js';
import logger from '../utils/logger.js';

const PER_IP_PER_HOUR = 5;
const PER_DAY = 300;

const serialize = (pb) => ({
  id: pb._id, url: pb.url, domain: pb.domain, product: pb.product, analysis: pb.analysis, brief: pb.brief, budget: pb.budget,
  claimed: !!pb.campaignId, campaignId: pb.campaignId || null, createdAt: pb.createdAt,
});

/** Public : génère un brief depuis une URL produit (5 par heure et par IP, 300 par jour) */
export async function createProductBrief(req, res) {
  try {
    if (!aiConfig().configured) return res.status(503).json({ error: 'Génération indisponible pour le moment (IA non configurée)' });
    const ip = req.ip || req.headers['x-forwarded-for'] || '';
    const [hour, day] = await Promise.all([
      ProductBrief.countDocuments({ ip, createdAt: { $gte: new Date(Date.now() - 3600000) } }),
      ProductBrief.countDocuments({ createdAt: { $gte: new Date(Date.now() - 86400000) } }),
    ]);
    if (hour >= PER_IP_PER_HOUR) return res.status(429).json({ error: 'Limite atteinte : 5 briefs par heure. Créez un compte marque pour continuer sans limite.', code: 'RATE_LIMIT' });
    if (day >= PER_DAY) return res.status(429).json({ error: 'Outil très sollicité aujourd\'hui, réessayez demain ou créez un compte marque.', code: 'DAILY_LIMIT' });
    const pb = await buildProductBrief(req.body?.url, { ip });
    res.status(201).json({ brief: serialize(pb) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    logger.error('createProductBrief failed:', error);
    res.status(500).json({ error: 'Génération impossible sur cette page, réessayez avec une autre adresse' });
  }
}

export async function getProductBrief(req, res) {
  const pb = await ProductBrief.findById(req.params.id).catch(() => null);
  if (!pb) return res.status(404).json({ error: 'Brief introuvable ou expiré (30 jours)' });
  res.json({ brief: serialize(pb) });
}

/** Marque connectée : transforme le brief en campagne brouillon */
export async function claimProductBrief(req, res) {
  try {
    const pb = await ProductBrief.findById(req.params.id).catch(() => null);
    if (!pb) return res.status(404).json({ error: 'Brief introuvable ou expiré (30 jours)' });
    if (pb.campaignId && String(pb.claimedBy) !== String(req.user._id)) return res.status(409).json({ error: 'Ce brief a déjà été repris par une autre marque' });
    const campaign = await createDraftCampaignFromProductBrief(req.user, pb);
    res.json({ campaignId: campaign._id });
  } catch (error) {
    logger.error('claimProductBrief failed:', error);
    res.status(500).json({ error: 'Impossible de créer la campagne' });
  }
}
