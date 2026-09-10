import mongoose from 'mongoose';

/**
 * Créateurs référencés (importés de fichiers, pas encore inscrits).
 * Séparés des comptes utilisateurs : ni matching, ni devis, ni statistiques.
 * L'email n'est jamais exposé publiquement ni aux marques : les contacts passent par la plateforme.
 */
const externalCreatorSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  slug: { type: String, unique: true, index: true },
  name: String,
  country: { type: String, index: true },       // ISO 3166-1 alpha-2
  email: { type: String, lowercase: true, trim: true, index: true, select: false },
  instagram: String,
  youtube: String,
  tiktok: String,
  followers: { type: Number, default: 0, index: true },
  posts: Number,
  likes: Number,
  niches: [{ type: String }],                    // niches NeedCreator (ex. 'tech')
  sourceNiche: String,                           // libellé d'origine (ex. 'Technology')
  source: String,                                // nom du fichier / fournisseur
  importedAt: Date,
  updatedFromImportAt: Date,
  status: { type: String, enum: ['listed', 'invited', 'joined', 'optout'], default: 'listed', index: true },
  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  joinedAt: Date,
  optoutAt: Date,
  lastInvitedAt: Date,
  invitations: [{
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    sentAt: Date,
  }],
}, { timestamps: true });

externalCreatorSchema.index({ status: 1, country: 1, followers: -1 });
externalCreatorSchema.index({ name: 'text', username: 'text' });

/** Données publiques (site + marques) : jamais l'email */
externalCreatorSchema.methods.toPublic = function() {
  return {
    id: this._id,
    username: this.username,
    slug: this.slug,
    name: this.name,
    country: this.country,
    instagram: this.instagram || null,
    youtube: this.youtube || null,
    tiktok: this.tiktok || null,
    followers: this.followers,
    posts: this.posts,
    likes: this.likes,
    niches: this.niches,
    status: this.status,
    lastInvitedAt: this.lastInvitedAt,
  };
};

export default mongoose.model('ExternalCreator', externalCreatorSchema);
