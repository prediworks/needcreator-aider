import mongoose from 'mongoose';

/**
 * Groupes Facebook suivis et demandes relevées dans leurs publications.
 * Seules les publications qui expriment un besoin sont gardées (une marque cherche des créateurs, une question de prix…), jamais la
 * liste des membres. Une demande est effacée soixante jours après sa lecture ; les compteurs du groupe, eux, restent.
 */
export const GROUP_AUDIENCES = ['creators', 'brands', 'ads', 'other'];
export const GROUP_POST_KINDS = ['brand_seeks_creators', 'brand_question', 'creator_seeks_brands', 'creator_question'];
export const GROUP_POST_STATUSES = ['todo', 'answered', 'skipped'];

const groupSchema = new mongoose.Schema({
  workspaceId: { type: String, default: 'default', index: true },
  key: { type: String, required: true },   // identifiant ou nom court du groupe dans son adresse
  url: { type: String, required: true },   // https://www.facebook.com/groups/<key>/
  name: { type: String, trim: true, maxlength: 160 },
  audience: { type: String, enum: GROUP_AUDIENCES, default: 'creators' }, // qui s'y trouve : créateurs UGC, marques et e-commerçants, annonceurs
  active: { type: Boolean, default: true },
  lastReadAt: Date,
  lastOutcome: { type: String, maxlength: 300 },
  stats: { reads: { type: Number, default: 0 }, requests: { type: Number, default: 0 }, answered: { type: Number, default: 0 }, skipped: { type: Number, default: 0 } },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
groupSchema.index({ workspaceId: 1, key: 1 }, { unique: true });

const postSchema = new mongoose.Schema({
  workspaceId: { type: String, default: 'default', index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'FacebookGroup', required: true, index: true },
  key: { type: String, required: true },   // empreinte du début du texte : une même publication n'est relevée qu'une fois
  author: { type: String, trim: true, maxlength: 120 }, // nom affiché sur la publication, pour la retrouver
  when: { type: String, trim: true, maxlength: 40 },    // date ou ancienneté affichée sur la publication (« 2 h », « 3 sept. »)
  text: { type: String, maxlength: 900 },  // début de la publication, tel qu'écrit
  kind: { type: String, enum: GROUP_POST_KINDS, required: true },
  comment: { type: String, maxlength: 900 }, // commentaire proposé : à relire et à publier soi-même
  searchUrl: { type: String, maxlength: 600 }, // recherche dans le groupe sur les premiers mots : mène à la publication
  status: { type: String, enum: GROUP_POST_STATUSES, default: 'todo', index: true },
  foundAt: { type: Date, default: Date.now },
  decidedAt: Date,
}, { timestamps: true });
postSchema.index({ groupId: 1, key: 1 }, { unique: true });
postSchema.index({ foundAt: 1 }, { expireAfterSeconds: 60 * 86400 });

export const GroupPost = mongoose.models.GroupPost || mongoose.model('GroupPost', postSchema);
const FacebookGroup = mongoose.models.FacebookGroup || mongoose.model('FacebookGroup', groupSchema);
export default FacebookGroup;
