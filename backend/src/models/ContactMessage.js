import mongoose from 'mongoose';

/** Message envoyé par le formulaire « Nous contacter » : trace de 12 mois (suivi, limite d'envois par adresse IP) */
const schema = new mongoose.Schema({
  name: String,
  email: String,
  role: { type: String, enum: ['brand', 'creator', 'other'], default: 'other' },
  subject: String,
  message: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  ip: String,
  sentTo: String,
  delivered: { type: Boolean, default: false },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 365 * 86400000), index: { expires: 0 } },
}, { timestamps: true });
schema.index({ ip: 1, createdAt: -1 });

export default mongoose.model('ContactMessage', schema);
