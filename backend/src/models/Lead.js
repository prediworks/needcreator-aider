import mongoose from 'mongoose';

export const LEAD_STATUSES = ['new', 'qualified', 'to_contact', 'contacted', 'replied', 'registered', 'rejected', 'excluded'];
export const LEAD_SOURCES = ['youtube', 'meta', 'manual'];

/**
 * Prospect trouvé par les agents d'acquisition (créateur ou marque), enrichi (email), qualifié par l'IA,
 * puis contacté par email (export CSV vers l'outil de mailing) ou à la main sur les réseaux.
 */
const leadSchema = new mongoose.Schema({
  kind: { type: String, enum: ['creator', 'brand'], required: true, index: true },
  source: { type: String, enum: LEAD_SOURCES, required: true, index: true },
  externalId: { type: String, required: true }, // youtube channelId, meta pageId, ou domaine
  name: { type: String, trim: true },
  handle: { type: String, trim: true }, // @pseudo YouTube / nom de page
  url: String,
  website: String,
  country: String,
  language: String,
  description: String,
  email: { type: String, lowercase: true, trim: true, index: true },
  emailSource: String, // bio, site, mentions-legales, lien-bio
  emailChecked: { type: Boolean, default: false },
  stats: { subscribers: Number, videos: Number, views: Number, ads: Number, lastUploadAt: Date },
  keyword: String, // mot-clé de recherche qui l'a trouvé
  niche: String, // niche NeedCreator (créateur) ou secteur (marque)
  score: Number, // 0-100
  signals: [String], // ex. « fait déjà de l'UGC », « pub vidéo active »
  aiSummary: String,
  message: String, // message court pour les réseaux (≤ 300 caractères)
  emailParagraph: String, // paragraphe personnalisé pour l'email
  status: { type: String, enum: LEAD_STATUSES, default: 'new', index: true },
  runId: String,
  contactedAt: Date,
  contactedVia: String,
  registeredUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  externalCreatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalCreator' },
  notes: String,
  error: String,
}, { timestamps: true });

leadSchema.index({ source: 1, externalId: 1 }, { unique: true });
leadSchema.index({ kind: 1, status: 1, score: -1 });

const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);
export default Lead;

/** Journal d'une exécution nocturne */
const runSchema = new mongoose.Schema({
  runId: { type: String, unique: true },
  startedAt: Date,
  finishedAt: Date,
  trigger: { type: String, default: 'scheduled' },
  sources: mongoose.Schema.Types.Mixed, // { youtube: { searched, found, new, withEmail, errors }, meta: {...} }
  qualified: { type: Number, default: 0 },
  issues: [String],
}, { timestamps: true });
export const LeadRun = mongoose.models.LeadRun || mongoose.model('LeadRun', runSchema);
