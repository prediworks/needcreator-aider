import mongoose from 'mongoose';

/**
 * Rapport du scan par email : la personne laisse son adresse sous un scan, reçoit le rapport tout de suite, puis un email par semaine au plus
 * quand la marque lance de nouvelles publicités (ou qu'une passe les 90 jours). Un abonnement = une adresse × une page Meta.
 * role : ce que la personne a déclaré (ou son compte) ; seules les marques deviennent des fiches de prospection, jamais les créateurs.
 */
const schema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  role: { type: String, enum: ['brand', 'creator', 'unknown'], default: 'unknown' },
  pageId: { type: String, required: true, index: true },
  slug: String,
  pageName: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },   // compte inscrit (connecté, ou adresse déjà connue)
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },   // fiche de prospection (marque sans compte)
  token: { type: String, required: true, unique: true },           // lien de désinscription
  active: { type: Boolean, default: true, index: true },
  lastAdIds: [String],       // publicités connues au dernier email : les autres sont « nouvelles »
  lastSentAt: Date,
  lastCheckedAt: Date,       // dernière vérification hebdomadaire (envoi ou non)
  sentCount: { type: Number, default: 0 },
  ip: String,
}, { timestamps: true });

schema.index({ email: 1, pageId: 1 }, { unique: true });

export default mongoose.models.AdScanSubscription || mongoose.model('AdScanSubscription', schema);
