import { generateBrief, aiConfig } from '../services/ai.js';
import logger from '../utils/logger.js';

const VIDEO_TYPE_LABELS = {
  testimonial: 'témoignage', unboxing: 'unboxing', demo: 'démonstration', tutorial: 'tutoriel', review: 'avis produit',
  comparison: 'comparatif', lifestyle: 'lifestyle', 'behind-the-scenes': 'coulisses', interview: 'interview',
  challenge: 'challenge', haul: 'haul', vlog: 'vlog',
};

/**
 * Statut du service IA (pour afficher ou masquer le bouton côté front)
 */
export function aiStatus(req, res) {
  const { provider, model, configured } = aiConfig();
  res.json({ configured, provider, model });
}

/**
 * Brief assisté par IA : la marque décrit son produit, on renvoie titre, description, consignes...
 */
export async function aiBrief(req, res) {
  try {
    const brand = req.user;
    const { productDescription, videoType, platforms, niches, goal, tone, duration, deliverables } = req.body;
    const brief = await generateBrief({
      productDescription,
      brandName: brand.profile.companyName || brand.profile.name,
      industry: brand.profile.industry,
      videoType,
      videoTypeLabel: VIDEO_TYPE_LABELS[videoType] || videoType,
      platforms: (platforms || []).join(', '),
      niches: (niches || []).join(', '),
      goal,
      tone,
      duration,
      deliverables,
    });
    res.json({ brief, ...aiConfig() });
  } catch (error) {
    if (error.status === 503) return res.status(503).json({ error: error.message });
    logger.error('AI brief failed:', error);
    res.status(502).json({ error: `Le service IA a échoué : ${error.message}` });
  }
}
