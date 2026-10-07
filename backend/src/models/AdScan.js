import mongoose from 'mongoose';

/**
 * Scan concurrentiel : les publicités Meta actives d'une page (marque), lues par la bibliothèque publicitaire, avec une lecture factuelle par l'IA.
 * Page publique sans compte, partageable. Une page = un scan, rafraîchi au plus une fois par 24 h quel que soit le nombre de visiteurs.
 * On ne garde que du texte et des dates : les aperçus restent chez Meta (lien public de la bibliothèque, jamais notre jeton).
 */
const adSchema = new mongoose.Schema({
  id: String,                // identifiant Meta de la publicité : https://www.facebook.com/ads/library/?id=<id>
  body: String,              // texte principal
  title: String,             // titre du lien
  description: String,       // description du lien
  caption: String,           // domaine affiché sous le lien
  startedAt: Date,           // début de diffusion : une publicité qui tourne depuis longtemps est rentable
  platforms: [String],       // facebook, instagram, messenger, audience_network
  reach: Number,             // portée estimée en Europe (transparence européenne), quand Meta la donne
  ages: String,              // tranche d'âge visée (« 25-54 »)
  gender: String,            // All, Women, Men
  countries: [String],
  languages: [String],
  variants: Number,          // nombre d'ensembles de publicités qui diffusent cette même création
}, { _id: false });

const adScanSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  query: String,             // ce que le visiteur a tapé
  pageId: { type: String, required: true, index: true },
  pageName: String,
  website: String,           // domaine le plus cité dans les publicités
  ads: [adSchema],           // les plus anciennes d'abord, 50 au plus
  totalActive: Number,       // nombre total de publicités actives vues chez Meta (peut dépasser ads.length)
  stats: {
    oldestDays: Number, medianDays: Number, over90Days: Number,
    platforms: mongoose.Schema.Types.Mixed, // { instagram: 12, facebook: 15 }
    countries: [String], ages: [String], reach: Number,
  },
  insights: {                // lecture IA, factuelle : constats comptés, jamais de jugement
    summary: String,
    angles: [{ name: String, count: Number, example: String, _id: false }],
    hooks: [String],
    missing: [String],
    facts: [String],
  },
  status: { type: String, enum: ['pending', 'ready', 'empty', 'failed', 'blocked'], default: 'ready', index: true }, // pending : lecture en cours en arrière-plan
  error: String,
  insightsPending: { type: Boolean, default: false }, // publicités déjà là, lecture IA encore en cours
  ip: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  views: { type: Number, default: 0 },
  humanViewedAt: Date,       // première consultation confirmée par un navigateur : condition d'indexation
  briefs: { type: Number, default: 0 },   // « Commander l'équivalent » cliqués
  proposals: { type: Number, default: 0 }, // « Proposer une vidéo » cliqués (créateurs)
  fetchedAt: { type: Date, default: Date.now }, // dernière lecture chez Meta
}, { timestamps: true });

adScanSchema.index({ fetchedAt: -1 });
adScanSchema.index({ views: -1 });

/** Journal des lectures fraîches (appel Meta + IA) : sert aux plafonds par visiteur, par compte et global ; effacé après deux jours */
const requestSchema = new mongoose.Schema({
  ip: { type: String, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  slug: String,
  createdAt: { type: Date, default: Date.now, index: true },
});
requestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 86400 });

export const AdScanRequest = mongoose.models.AdScanRequest || mongoose.model('AdScanRequest', requestSchema);
const AdScan = mongoose.models.AdScan || mongoose.model('AdScan', adScanSchema);
export default AdScan;
