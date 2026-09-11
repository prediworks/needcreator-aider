import Report from '../models/Report.js';
import Campaign from '../models/Campaign.js';
import Delivery from '../models/Delivery.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

/**
 * Trouve l'utilisateur responsable du contenu signalé
 */
async function ownerOf(targetType, targetId) {
  if (targetType === 'user') return targetId;
  if (targetType === 'campaign') return (await Campaign.findById(targetId).select('brandId'))?.brandId;
  if (targetType === 'delivery') return (await Delivery.findById(targetId).select('creatorId'))?.creatorId;
  if (targetType === 'message') {
    const conv = await Conversation.findOne({ 'messages._id': targetId }).select('messages.$');
    return conv?.messages?.[0]?.senderId;
  }
  return null;
}

export async function createReport(req, res) {
  try {
    const { targetType, targetId, reason, details } = req.body;
    const targetUserId = await ownerOf(targetType, targetId);
    if (!targetUserId) return res.status(404).json({ error: 'Contenu introuvable' });
    if (String(targetUserId) === String(req.user._id)) return res.status(400).json({ error: 'Vous ne pouvez pas vous signaler vous-même' });
    const existing = await Report.findOne({ reporterId: req.user._id, targetType, targetId });
    if (existing) return res.status(400).json({ error: 'Vous avez déjà signalé ce contenu' });
    const report = await Report.create({ reporterId: req.user._id, targetType, targetId, targetUserId, reason, details });
    logger.warn(`Report ${report._id}: ${targetType} ${targetId} by ${req.user._id} (${reason})`);
    import('../services/adminAlerts.js').then(m => m.alertNewReport(report, req.user)).catch(() => {});
    res.status(201).json({ message: 'Signalement envoyé, notre équipe le traite sous 24 h', report });
  } catch (error) {
    logger.error('Failed to create report:', error);
    res.status(500).json({ error: 'Failed to create report' });
  }
}

/**
 * Admin : liste des signalements
 */
export async function listReports(req, res) {
  try {
    const status = req.query.status || 'open';
    const reports = await Report.find(status === 'all' ? {} : { status })
      .populate('reporterId', 'profile.name profile.companyName role email')
      .populate('targetUserId', 'profile.name profile.companyName role email status')
      .sort({ createdAt: -1 }).limit(200).lean();
    const counts = await Report.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    res.json({ reports, counts: Object.fromEntries(counts.map(c => [c._id, c.n])) });
  } catch (error) {
    logger.error('Failed to list reports:', error);
    res.status(500).json({ error: 'Failed to list reports' });
  }
}

/**
 * Admin : traite un signalement (dismiss | resolve | suspend)
 */
export async function resolveReport(req, res) {
  try {
    const { action, note } = req.body;
    const report = await Report.findById(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (action === 'suspend' && report.targetUserId) {
      await User.updateOne({ _id: report.targetUserId }, { $set: { status: 'suspended' } });
      if (report.targetType === 'campaign') await Campaign.updateOne({ _id: report.targetId, status: { $in: ['draft', 'active'] } }, { $set: { status: 'cancelled' } });
    }
    report.status = action === 'dismiss' ? 'dismissed' : 'resolved';
    report.resolution = note || (action === 'suspend' ? 'Utilisateur suspendu' : action === 'dismiss' ? 'Sans suite' : 'Traité');
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();
    await report.save();
    res.json({ message: 'Signalement traité', report });
  } catch (error) {
    logger.error('Failed to resolve report:', error);
    res.status(500).json({ error: 'Failed to resolve report' });
  }
}
