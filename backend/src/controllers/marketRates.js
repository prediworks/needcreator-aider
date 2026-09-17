import Campaign from '../models/Campaign.js';
import logger from '../utils/logger.js';

/**
 * Suggestion de prix par type de vidéo : médiane (et quartiles) des devis réellement acceptés sur la plateforme.
 * Tant qu'un type n'a pas assez de devis, la grille indicative sert de secours.
 */
export const GRID = {
  testimonial: [80, 150], unboxing: [80, 150], demo: [100, 200], tutorial: [120, 250],
  review: [80, 150], comparison: [120, 220], lifestyle: [100, 200], 'behind-the-scenes': [100, 180],
  interview: [150, 300], challenge: [100, 200], haul: [90, 180], vlog: [120, 250],
};
const MIN_SAMPLE = 10;
const CACHE_MS = 10 * 60 * 1000;
let cache = { at: 0, data: null };

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];

export async function computeMarketRates() {
  const rows = await Campaign.aggregate([
    { $match: { type: { $ne: 'gifting' } } },
    { $unwind: '$applications' },
    { $match: { 'applications.status': 'accepted', 'applications.price': { $gt: 0 } } },
    { $group: { _id: '$brief.videoType', prices: { $push: '$applications.price' } } },
  ]);
  const byType = {};
  for (const [type, [min, max]] of Object.entries(GRID)) byType[type] = { min, max, median: Math.round((min + max) / 2), count: 0, source: 'grid' };
  for (const r of rows) {
    const sorted = r.prices.sort((a, b) => a - b);
    const entry = { count: sorted.length, median: pct(sorted, 0.5), min: pct(sorted, 0.25), max: pct(sorted, 0.75), source: sorted.length >= MIN_SAMPLE ? 'market' : 'grid' };
    if (entry.source === 'market') byType[r._id] = entry;
    else byType[r._id] = { ...(byType[r._id] || { min: 80, max: 200, median: 140 }), count: sorted.length, source: 'grid', marketMedian: entry.median };
  }
  return { rates: byType, minSample: MIN_SAMPLE, computedAt: new Date() };
}

export async function getMarketRates(req, res) {
  try {
    if (!cache.data || Date.now() - cache.at > CACHE_MS || req.query.fresh === '1') {
      cache = { at: Date.now(), data: await computeMarketRates() };
    }
    res.json(cache.data);
  } catch (error) {
    logger.error('getMarketRates failed:', error);
    res.status(500).json({ error: 'Suggestions de prix indisponibles' });
  }
}

/**
 * Calculateur de tarif (public) : fourchette à partir des devis acceptés (ou de la grille), ajustée selon les droits,
 * les supports, l'exclusivité, la durée de la vidéo et le nombre de vidéos. Indicatif : le créateur reste libre de son prix.
 */
const RIGHTS_FACTOR = { '6m': 0.9, '1y': 1, '2y': 1.2, '3y': 1.35, unlimited: 1.6 };
const SUPPORT_FACTOR = { paid_ads: 1.3, tv: 1.5, marketplace: 1.1, website: 1.05, email: 1.05, social_organic: 1, other: 1 };
/** Données de marché en cache (10 min) */
export async function marketRatesData() {
  if (!cache.data || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), data: await computeMarketRates() };
  return cache.data;
}

/** Estimation pure (réutilisée par le calculateur public et le brief depuis une URL) */
export function estimateRate(q = {}, rates = {}) {
  const videoType = GRID[q.videoType] ? q.videoType : 'testimonial';
  const base = rates[videoType] || { min: 80, max: 150, median: 115, source: 'grid', count: 0 };
  const duration = Math.max(5, parseInt(q.duration || 30, 10));
  const deliverables = Math.min(20, Math.max(1, parseInt(q.deliverables || 1, 10)));
  const rights = RIGHTS_FACTOR[q.rights] ? q.rights : '1y';
  const supports = String(q.supports || 'social_organic').split(',').filter(s => SUPPORT_FACTOR[s] !== undefined);
  const exclusivityMonths = q.exclusivity === 'true' || q.exclusivity === '1' || q.exclusivity === true ? Math.min(36, Math.max(1, parseInt(q.exclusivityMonths || 6, 10))) : 0;
  const factors = [];
  let f = 1;
  factors.push({ label: `Droits ${({ '6m': '6 mois', '1y': '1 an', '2y': '2 ans', '3y': '3 ans', unlimited: 'illimités' })[rights]}`, factor: RIGHTS_FACTOR[rights] }); f *= RIGHTS_FACTOR[rights];
  const sf = Math.max(1, ...supports.map(s => SUPPORT_FACTOR[s]));
  if (sf > 1) { factors.push({ label: supports.includes('tv') ? 'Diffusion TV / affichage' : supports.includes('paid_ads') ? 'Publicité payante' : 'Supports élargis', factor: sf }); f *= sf; }
  if (exclusivityMonths) { const ef = 1 + Math.min(0.5, 0.05 * exclusivityMonths); factors.push({ label: `Exclusivité ${exclusivityMonths} mois`, factor: Math.round(ef * 100) / 100 }); f *= ef; }
  if (duration > 60) { factors.push({ label: 'Vidéo longue (plus de 60 s)', factor: 1.25 }); f *= 1.25; }
  else if (duration < 15) { factors.push({ label: 'Format très court', factor: 0.9 }); f *= 0.9; }
  const volume = deliverables >= 10 ? 0.8 : deliverables >= 5 ? 0.85 : deliverables >= 3 ? 0.9 : 1;
  if (volume < 1) factors.push({ label: `Volume (${deliverables} vidéos)`, factor: volume });
  const r5 = (v) => Math.max(20, Math.round(v / 5) * 5);
  const perVideo = { low: r5(base.min * f * volume), mid: r5(base.median * f * volume), high: r5(base.max * f * volume) };
  const total = { low: perVideo.low * deliverables, mid: perVideo.mid * deliverables, high: perVideo.high * deliverables };
  return { videoType, base: { min: base.min, median: base.median, max: base.max, source: base.source, count: base.count || 0 }, factors, deliverables, perVideo, total, note: base.source === 'market' ? `Fourchette observée sur ${base.count} devis acceptés pour ce type de vidéo.` : 'Grille indicative, en attendant assez de devis acceptés pour ce type de vidéo.' };
}

export async function rateCalculator(req, res) {
  try {
    const data = await marketRatesData();
    res.json(estimateRate(req.query || {}, data.rates));
  } catch (error) {
    logger.error('rateCalculator failed:', error);
    res.status(500).json({ error: 'Calculateur indisponible' });
  }
}
