import mongoose from 'mongoose';

/**
 * Registre « Contenus & droits » d'une marque : une fiche par contenu, qu'il vienne d'une mission NeedCreator
 * (synchronisée automatiquement) ou de l'extérieur (agence, autre plateforme, achat direct : saisie ou import).
 * Qui a créé quoi, pour combien, avec quels droits, jusqu'à quand, où c'est utilisé, qui peut le renouveler.
 */
export const CONTRACT_TYPES = ['cession', 'licence', 'gifting', 'influence', 'other'];
export const USAGE_CHANNELS = ['product_page', 'paid_ads', 'social', 'website', 'email', 'marketplace', 'tv', 'other'];
export const RIGHTS_SUPPORTS = ['social_organic', 'paid_ads', 'website', 'email', 'marketplace', 'tv', 'other'];

const contentSchema = new mongoose.Schema({
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  source: { type: String, enum: ['needcreator', 'external'], default: 'external', index: true },
  // Origine NeedCreator (synchronisation) : livraison + fichier ou lien précis
  deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery' },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  itemId: String, // _id du fichier ou du lien dans la livraison
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  title: { type: String, required: true, trim: true, maxlength: 200 },
  kind: { type: String, enum: ['video', 'image', 'audio', 'other'], default: 'video' },
  url: String,        // fichier ou lien du contenu
  thumbnail: String,
  product: String,    // produit, gamme ou campagne concernée
  tags: [String],

  creator: {          // pour un contenu extérieur (ou copie du nom pour NeedCreator)
    name: String,
    handle: String,
    email: String,
    platform: String, // agence, plateforme d'origine, contact direct…
  },

  contractType: { type: String, enum: CONTRACT_TYPES, default: 'cession' },
  rights: {
    startAt: Date,
    endAt: Date,      // null = illimité
    supports: [{ type: String, enum: RIGHTS_SUPPORTS }],
    territories: { type: String, default: 'France' },
    exclusivity: { type: Boolean, default: false },
    exclusivityMonths: Number,
  },
  price: Number,      // prix payé HT
  currency: { type: String, default: 'EUR' },
  documents: [{ label: String, url: String, _id: false }], // contrat, facture, avenant (liens ou fichiers)

  usages: [{
    channel: { type: String, enum: USAGE_CHANNELS, default: 'other' },
    url: String,
    note: String,
    addedAt: { type: Date, default: Date.now },
  }],
  notes: String,

  renewal: {
    requestedAt: Date,     // « Relancer le créateur » envoyé (contenu extérieur)
    reminded30At: Date,    // rappels d'expiration (contenus extérieurs ; NeedCreator a déjà les siens)
    reminded7At: Date,
  },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

contentSchema.index({ brandId: 1, deliveryId: 1, itemId: 1 });
contentSchema.index({ brandId: 1, 'rights.endAt': 1 });

/** Statut calculé : active, expiring (≤ 30 jours), expired, unlimited */
contentSchema.virtual('status').get(function() {
  const end = this.rights?.endAt;
  if (!end) return 'unlimited';
  const days = (new Date(end) - Date.now()) / 86400000;
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring';
  return 'active';
});
contentSchema.virtual('daysLeft').get(function() {
  const end = this.rights?.endAt;
  return end ? Math.ceil((new Date(end) - Date.now()) / 86400000) : null;
});

const Content = mongoose.models.Content || mongoose.model('Content', contentSchema);
export default Content;
