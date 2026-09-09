import { generateBrief, aiConfig } from '../services/ai.js';
import { config } from '../config/index.js';
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
  const user = req.user;
  let quota = null;
  if (user?.role === 'brand') {
    user.rollUsage();
    const pro = user.isPro();
    quota = { pro, limit: pro ? null : config.plans.aiBriefFreeQuota, used: user.usage?.aiBriefCount || 0, remaining: pro ? null : Math.max(0, config.plans.aiBriefFreeQuota - (user.usage?.aiBriefCount || 0)) };
  }
  res.json({ configured, provider, model, quota });
}

/**
 * Brief assisté par IA : la marque décrit son produit, on renvoie titre, description, consignes...
 */
export async function aiBrief(req, res) {
  try {
    const brand = req.user;
    brand.rollUsage();
    if (!brand.isPro() && (brand.usage.aiBriefCount || 0) >= config.plans.aiBriefFreeQuota) {
      return res.status(402).json({
        error: `Vous avez utilisé vos ${config.plans.aiBriefFreeQuota} rédactions de brief par l'IA gratuites ce mois-ci. Vous pouvez toujours rédiger vos briefs vous-même, ou passer en Pro pour un accès illimité à l'IA.`,
        code: 'AI_QUOTA_EXCEEDED',
      });
    }
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
    brand.usage.aiBriefCount = (brand.usage.aiBriefCount || 0) + 1;
    await brand.save();
    res.json({ brief, ...aiConfig(), remaining: brand.isPro() ? null : Math.max(0, config.plans.aiBriefFreeQuota - brand.usage.aiBriefCount) });
  } catch (error) {
    if (error.status === 503) return res.status(503).json({ error: error.message });
    logger.error('AI brief failed:', error);
    res.status(502).json({ error: `Le service IA a échoué : ${error.message}` });
  }
}
