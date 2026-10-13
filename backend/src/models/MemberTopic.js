import mongoose from 'mongoose';

/**
 * Thématiques hebdomadaires (décision du 13/10/2026) : une bibliothèque de conseils, un email par semaine et par inscrit, dans l'ordre,
 * jamais deux fois la même avant le délai de reprise. Quand tout est couvert, on recommence au début (objet de rappel).
 * La liste s'enrichit à chaque développement : une nouvelle thématique arrive désactivée, l'équipe la relit puis l'active.
 * skipIf : « inutile si déjà utilisé » (un créateur qui a envoyé un devis ne reçoit pas la thématique des devis).
 */
export const TOPIC_SKIPS = ['', 'quote', 'showcase', 'prospect', 'content', 'scan', 'campaign'];
const schema = new mongoose.Schema({
  audience: { type: String, enum: ['creators', 'brands'], required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },         // nom interne, visible dans l'admin
  subject: { type: String, required: true, trim: true, maxlength: 150 },
  subjectRepeat: { type: String, trim: true, maxlength: 150, default: '' },      // objet du second tour (sinon « Rappel : … »)
  body: { type: String, required: true, maxlength: 6000 },                       // même format que les annonces ({{prenom}}, **gras**, listes)
  href: { type: String, trim: true, default: '/dashboard', maxlength: 300 },
  cta: { type: String, trim: true, default: 'Ouvrir mon tableau de bord', maxlength: 80 },
  order: { type: Number, default: 0, index: true },
  active: { type: Boolean, default: false, index: true },
  skipIf: { type: String, enum: TOPIC_SKIPS, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.models.MemberTopic || mongoose.model('MemberTopic', schema);
