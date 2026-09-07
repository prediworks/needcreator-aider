import mongoose from 'mongoose';

/**
 * Fil de discussion entre une marque et un créateur, rattaché à une campagne
 * (négociation du devis, questions sur le brief, suivi de production)
 */
const conversationSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  messages: [{
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 4000 },
    createdAt: { type: Date, default: Date.now },
  }],

  lastMessageAt: Date,
  lastMessagePreview: String,

  // Compteurs de non-lus par côté
  unread: {
    brand: { type: Number, default: 0 },
    creator: { type: Number, default: 0 },
  },

  // Dernière notification email envoyée par côté (anti-spam)
  lastNotifiedAt: {
    brand: Date,
    creator: Date,
  },
}, { timestamps: true });

conversationSchema.index({ campaignId: 1, creatorId: 1 }, { unique: true });
conversationSchema.index({ brandId: 1, lastMessageAt: -1 });
conversationSchema.index({ creatorId: 1, lastMessageAt: -1 });

export default mongoose.model('Conversation', conversationSchema);
