import mongoose from 'mongoose';
import { CONTRACT_TYPES, RIGHTS_SUPPORTS } from './Content.js';

/**
 * Registre des droits côté créateur : chaque contenu vendu, sur NeedCreator (synchronisé) ou ailleurs (saisi),
 * avec le client, les droits cédés, l'exclusivité et leurs dates de fin. Rappels et renouvellement via un devis NeedCreator.
 */
const creatorContentSchema = new mongoose.Schema({
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  source: { type: String, enum: ['needcreator', 'external', 'quote'], default: 'external', index: true },
  deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery' },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  externalQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalQuote' },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  kind: { type: String, enum: ['video', 'image', 'audio', 'other'], default: 'video' },
  url: String,
  client: { name: String, email: String, platform: String }, // marque ou client ; platform : NeedCreator, agence, direct…
  contractType: { type: String, enum: CONTRACT_TYPES, default: 'cession' },
  rights: {
    startAt: Date,
    endAt: Date, // null = illimité
    supports: [{ type: String, enum: RIGHTS_SUPPORTS }],
    territories: { type: String, default: 'France' },
    exclusivity: { type: Boolean, default: false },
    exclusivityMonths: Number,
    exclusivityEndAt: Date, // calculé : début + mois d'exclusivité
    exclusivityScope: String, // secteur / concurrents concernés
  },
  price: Number,
  documents: [{ label: String, url: String, _id: false }],
  notes: String,
  reminders: { rights30At: Date, rights7At: Date, exclusivityEndAt: Date, renewalProposedAt: Date },
}, { timestamps: true });

creatorContentSchema.index({ creatorId: 1, deliveryId: 1 });
creatorContentSchema.index({ creatorId: 1, 'rights.endAt': 1 });

const CreatorContent = mongoose.models.CreatorContent || mongoose.model('CreatorContent', creatorContentSchema);
export default CreatorContent;
