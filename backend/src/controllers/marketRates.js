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
