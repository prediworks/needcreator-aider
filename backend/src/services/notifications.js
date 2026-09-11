import mongoose from 'mongoose';
import logger from '../utils/logger.js';

/**
 * Notifications dans l'application (cloche) : une par événement utile, en plus des emails.
 * type : application | selection | delivery | revision | approval | message | dispute | reminder | contract | rights | replacement | system
 */
const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, default: 'system' },
  title: { type: String, required: true },
  text: String,
  href: String,
  readAt: Date,
}, { timestamps: true });

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 }); // purge automatique après 90 jours

export const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

export async function notify(userId, { type = 'system', title, text = '', href = '' }) {
  if (!userId || !title) return null;
  try {
    return await Notification.create({ userId, type, title, text, href });
  } catch (err) {
    logger.warn(`Notification non créée (${title}) : ${err?.message || err}`);
    return null;
  }
}

export async function listNotifications(userId, limit = 20) {
  const [items, unread] = await Promise.all([
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ userId, readAt: null }),
  ]);
  return { notifications: items, unread };
}

export async function markRead(userId, ids = null) {
  const q = { userId, readAt: null };
  if (Array.isArray(ids) && ids.length) q._id = { $in: ids };
  const r = await Notification.updateMany(q, { $set: { readAt: new Date() } });
  return r.modifiedCount || 0;
}
