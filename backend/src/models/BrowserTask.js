import mongoose from 'mongoose';

/**
 * File de tâches pour l'extension Chrome de prospection (dossier extension/).
 * Isolé du reste : l'extension ne connaît que ce protocole (tâche → résultat brut : texte visible, liens, blocage).
 */
export const TASK_TYPES = ['read_post_author', 'read_profile', 'list_hashtag', 'list_ad_library'];
export const TASK_STATUSES = ['pending', 'running', 'done', 'failed', 'cancelled'];

const taskSchema = new mongoose.Schema({
  workspaceId: { type: String, default: 'default', index: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'BrowserTaskBatch', required: true, index: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'BrowserTask' }, // tâche qui a engendré celle-ci (publication → profil)
  type: { type: String, enum: TASK_TYPES, required: true, index: true },
  input: {
    url: String,       // page à ouvrir
    query: String,     // mot-clé (bibliothèque publicitaire) ou hashtag
    count: Number,     // nombre d'éléments à relever (listes)
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }, // fiche à compléter, le cas échéant
    postUrl: String,   // publication d'origine (pour compléter la fiche « publication seule »)
  },
  status: { type: String, enum: TASK_STATUSES, default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  claimedAt: Date,
  finishedAt: Date,
  result: mongoose.Schema.Types.Mixed,   // résultat brut renvoyé par l'extension (texte réduit, liens)
  extracted: mongoose.Schema.Types.Mixed, // ce que le serveur en a tiré (email, profil, abonnés, annonceurs…)
  outcome: String, // en clair : « fiche complétée », « 12 annonceurs importés », « bloqué : page de connexion »
  error: String,
}, { timestamps: true });
taskSchema.index({ status: 1, createdAt: 1 });
taskSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

const batchSchema = new mongoose.Schema({
  workspaceId: { type: String, default: 'default', index: true },
  label: String,               // « Publications Instagram sans auteur · 23/09 »
  kind: { type: String, enum: ['creator', 'brand'], default: 'creator' },
  origin: String,              // origine donnée aux prospects importés (ex. « bibliothèque Meta »)
  niche: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  counts: { total: { type: Number, default: 0 }, done: { type: Number, default: 0 }, failed: { type: Number, default: 0 } },
  imported: { created: { type: Number, default: 0 }, updated: { type: Number, default: 0 }, emailsAdded: { type: Number, default: 0 } },
  blockedAt: Date,
  blockedReason: String,       // « page de connexion », « captcha », « restriction »
  closedAt: Date,
}, { timestamps: true });
batchSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

export const BrowserTaskBatch = mongoose.models.BrowserTaskBatch || mongoose.model('BrowserTaskBatch', batchSchema);
const BrowserTask = mongoose.models.BrowserTask || mongoose.model('BrowserTask', taskSchema);
export default BrowserTask;
