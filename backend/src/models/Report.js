import mongoose from 'mongoose';

/**
 * Signalement d'un contenu ou d'un utilisateur, traité par l'admin
 */
const reportSchema = new mongoose.Schema({
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  targetType: { type: String, enum: ['campaign', 'user', 'message', 'delivery'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // utilisateur responsable du contenu
  reason: {
    type: String,
    enum: ['free_work', 'off_platform', 'scam', 'inappropriate', 'spam', 'fake', 'other'],
    required: true,
  },
  details: { type: String, maxlength: 1000 },
  status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open', index: true },
  resolution: String,
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date,
}, { timestamps: true });

reportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });

export default mongoose.model('Report', reportSchema);
