import Delivery from '../models/Delivery.js';
import Campaign from '../models/Campaign.js';
import User from '../models/User.js';
import logger from './logger.js';

const DAY = 24 * 3600 * 1000;
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Recalcule la réactivité d'une marque : délai de validation et délai de réponse aux candidatures
 */
export async function updateBrandStats(brandId) {
  try {
    const deliveries = await Delivery.find({ brandId, status: 'approved', submittedAt: { $exists: true }, approvedAt: { $exists: true } })
      .select('submittedAt approvedAt revisions').lean();
    const validationDays = deliveries.map(d => {
      // Délai entre la dernière (re)soumission et la validation
      const lastResolved = d.revisions?.filter(r => r.resolvedAt).map(r => new Date(r.resolvedAt).getTime()).pop();
      const from = Math.max(new Date(d.submittedAt).getTime(), lastResolved || 0);
      return (new Date(d.approvedAt).getTime() - from) / DAY;
    }).filter(v => v >= 0);

    const campaigns = await Campaign.find({ brandId, selectedAt: { $exists: true }, 'applications.0': { $exists: true } })
      .select('selectedAt applications.appliedAt status').lean();
    const responseDays = campaigns.map(c => {
      const first = Math.min(...c.applications.map(a => new Date(a.appliedAt).getTime()));
      return (new Date(c.selectedAt).getTime() - first) / DAY;
    }).filter(v => v >= 0);

    const completed = await Campaign.countDocuments({ brandId, status: 'completed' });

    const avg = (arr) => arr.length ? round1(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    await User.updateOne({ _id: brandId }, {
      $set: {
        'profile.stats.avgValidationDays': avg(validationDays),
        'profile.stats.avgResponseDays': avg(responseDays),
        'profile.stats.campaignsCompleted': completed,
      },
    });
  } catch (error) {
    logger.error('Failed to update brand stats:', error);
  }
}
