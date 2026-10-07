import mongoose from 'mongoose';

export const LEAD_STATUSES = ['new', 'qualified', 'to_contact', 'contacted', 'replied', 'registered', 'rejected', 'excluded'];
export const LEAD_SOURCES = ['youtube', 'instagram', 'meta', 'manual'];

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
  socials: { instagram: String, tiktok: String, youtube: String, linkedin: String, facebook: String },
  enrich: { emailSearchedAt: Date, socialsSearchedAt: Date, noSite: Boolean, assistantAt: Date, assistantYtAt: Date, skippedAt: Date }, // mémoire des passes de recherche : un même prospect n'est pas revisité avant 30 jours // profils trouvés dans la bio, le lien de bio ou le site
  country: String,
  language: String,
  description: String,
  email: { type: String, lowercase: true, trim: true, index: true },
  emailSource: String, // bio, site, mentions-legales, lien-bio
  emailChecked: { type: Boolean, default: false },
  stats: { subscribers: Number, videos: Number, views: Number, ads: Number, likes: Number, comments: Number, postedAt: Date, lastUploadAt: Date },
  keyword: String, // mot-clé de recherche qui l'a trouvé
  niche: String, // niche NeedCreator (créateur) ou secteur (marque)
  score: Number, // 0-100
  signals: [String], // ex. « fait déjà de l'UGC », « pub vidéo active »
  aiSummary: String,
  message: String, // message court pour les réseaux (≤ 300 caractères)
  hooks: [String], // marques : trois accroches de créateur pour leur produit (mini-audit de leur publicité), reprises dans l'email 1 et le message
  extraEmails: [{ type: String, lowercase: true, trim: true }], // marques : autres adresses retenues (plusieurs personnes à joindre) ; chacune part au mailing avec les mêmes champs, une réponse de l'une vaut pour la fiche
  contacts: [{ name: String, title: String, linkedin: String, email: String, emailGuessed: { type: Boolean, default: false }, foundAt: Date, _id: false }], // marques : personnes à joindre (LinkedIn), email déduit du format connu de la marque
  emailParagraph: String, // paragraphe personnalisé pour l'email
  status: { type: String, enum: LEAD_STATUSES, default: 'new', index: true },
  runId: String,
  contactedAt: Date,
  contactedVia: String,
  registeredUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  externalCreatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalCreator' },
  notes: String,
  error: String,
  mailing: { provider: String, listId: String, pushedAt: Date, replyAt: Date, replyVia: String, replyText: String, replyIntent: String, replySummary: String, replySuggestion: String, replyMessageId: String, replySentAt: Date, replySentText: String, replySentVia: String, bounced: Boolean, unsubscribedAt: Date, removedAt: Date, hold: Boolean }, // hold : jamais poussée vers les envois automatiques (on répond à une demande, on n'ajoute pas à une liste)
  showcaseRequestedAt: Date, // la marque a dit oui à une vidéo tournée pour elle : affichée en priorité aux créateurs
  // Demande explicite (« oui vidéo » ou saisie par l'équipe) : produit visé, créateurs prévenus, alerte à J+7, réponse de repli à J+10, clôture
  showcaseRequest: {
    explicit: { type: Boolean, default: false }, product: String, via: String,
    notifiedAt: Date, notifiedCount: Number, alertAt: Date,
    fallbackAt: Date, fallbackText: String, fallbackSentAt: Date,
    closedAt: Date, closedReason: String,
  },
  // Compte cité par un créateur (marque taguée) : tant que son profil n'a pas été lu et reconnu comme celui d'une marque, la fiche n'est ni qualifiée ni proposée
  profilePending: Boolean,
  profileCheckedAt: Date,
  socialsCheck: { instagram: String, tiktok: String },
  nameCheck: String, // 'person' : le nom de l'annonceur ressemble à un nom de personne, sans site (page Meta douteuse) ; signalé, jamais écarté // 'ok' ou 'unverified' : compte trouvé sur le site qui ne ressemble pas au nom de la marque
  sizeTier: { type: String, enum: ['ok', 'large', 'huge'] }, // taille estimée d'une marque (abonnés, annonces, liste des marques refusées) : « large » répond rarement, « huge » est écartée
  // Marque suggérée par un créateur : elle lui est réservée quelques jours pour sa candidature spontanée
  suggestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reservedUntil: Date,
  offeredBriefId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductBrief' }, // brief offert préparé quand une marque répond positivement
  draftCampaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
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
