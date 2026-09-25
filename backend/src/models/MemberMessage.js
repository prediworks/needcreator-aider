import mongoose from 'mongoose';

/** Trace d'un message envoyé à un inscrit (séquence d'accueil ou annonce) : jamais deux fois le même */
const logSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true }, // onboarding1..3 ou broadcast:<id>
  sentAt: { type: Date, default: Date.now },
  emailed: { type: Boolean, default: true },
}, { timestamps: false });
logSchema.index({ userId: 1, key: 1 }, { unique: true });
export const MemberMessageLog = mongoose.models.MemberMessageLog || mongoose.model('MemberMessageLog', logSchema);

/** Annonce envoyée depuis l'admin à tous les inscrits d'un public */
const broadcastSchema = new mongoose.Schema({
  audience: { type: String, enum: ['creators', 'brands'], required: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sentAt: { type: Date, default: Date.now },
  count: { type: Number, default: 0 },
  emailed: { type: Number, default: 0 },
}, { timestamps: true });
export const MemberBroadcast = mongoose.models.MemberBroadcast || mongoose.model('MemberBroadcast', broadcastSchema);
