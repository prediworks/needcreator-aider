import mongoose from 'mongoose';

/**
 * Marques cherchées par un créateur dans « Candidature vidéo » sans résultat : il possède le produit et voulait tourner.
 * C'est le meilleur signal de prospection qui soit ; il reste interne, et ne sert qu'à proposer la marque à ce créateur.
 */
export const BRAND_SEARCH_STATUSES = ['open', 'created', 'dismissed'];

const schema = new mongoose.Schema({
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  query: { type: String, trim: true, maxlength: 80, required: true }, // tel que tapé, dernière saisie
  norm: { type: String, required: true },  // lettres et chiffres seulement : « Thés de Lune » ↔ « thesdelune »
  count: { type: Number, default: 1 },     // nombre de fois cherchée par ce créateur
  firstAt: { type: Date, default: Date.now },
  lastAt: { type: Date, default: Date.now },
  status: { type: String, enum: BRAND_SEARCH_STATUSES, default: 'open', index: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
}, { timestamps: true });
schema.index({ creatorId: 1, norm: 1 }, { unique: true });
schema.index({ norm: 1, status: 1 });

const BrandSearch = mongoose.models.BrandSearch || mongoose.model('BrandSearch', schema);
export default BrandSearch;
