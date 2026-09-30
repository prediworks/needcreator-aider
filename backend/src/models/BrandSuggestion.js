import mongoose from 'mongoose';

/**
 * Marque suggérée par un créateur qui possède déjà l'un de ses produits (candidature spontanée en vidéo).
 * La fiche prospect (Lead) n'est créée qu'à la validation par l'équipe : une suggestion refusée ne laisse pas de prospect.
 */
const schema = new mongoose.Schema({
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  key: { type: String, required: true, index: true }, // domaine du site, sinon pseudo Instagram, sinon nom normalisé : sert au dédoublonnage
  name: { type: String, required: true, trim: true, maxlength: 120 },
  website: { type: String, trim: true, maxlength: 300 },
  instagram: { type: String, trim: true, maxlength: 300 },
  tiktok: { type: String, trim: true, maxlength: 300 },
  product: { type: String, required: true, trim: true, maxlength: 120 }, // produit que le créateur possède
  // Taille estimée : ok (accessible), large (répond rarement, le créateur a confirmé), huge (refus d'office)
  tier: { type: String, enum: ['ok', 'large', 'huge'], default: 'ok' },
  size: { ads: Number, ai: String, group: String, reason: String, blocked: Boolean },
  status: { type: String, enum: ['pending', 'approved', 'refused'], default: 'pending', index: true },
  // Lecture du profil Instagram par l'extension avant la validation : marque ou personne, abonnés, site, bio
  check: { at: Date, isBrand: Boolean, followers: Number, site: String, bio: String, note: String },
  reason: { type: String, trim: true, maxlength: 300 }, // motif du refus, montré au créateur
  auto: { type: Boolean, default: false }, // refus d'office (très grande marque)
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  decidedAt: Date,
}, { timestamps: true });

const BrandSuggestion = mongoose.models.BrandSuggestion || mongoose.model('BrandSuggestion', schema);
export default BrandSuggestion;
