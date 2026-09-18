import crypto from 'crypto';
import mongoose from 'mongoose';

/**
 * Liste d'exclusion de la prospection : empreintes (SHA-256) des emails et profils supprimés, pour ne plus les collecter ni les contacter.
 * Aucune donnée lisible n'est conservée (politique de confidentialité, « Supprimer vos données »).
 */
const schema = new mongoose.Schema({
  hash: { type: String, required: true, unique: true },
  type: { type: String, enum: ['email', 'profile'], required: true },
}, { timestamps: true });

const LeadSuppression = mongoose.model('LeadSuppression', schema);
export default LeadSuppression;

const norm = (v) => String(v || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
export const suppressionHash = (v) => crypto.createHash('sha256').update(norm(v)).digest('hex');

/** Empreintes d'un prospect : email, lien du profil, identifiant source, réseaux */
export function leadFingerprints(lead) {
  const out = [];
  if (lead.email) out.push({ hash: suppressionHash(lead.email), type: 'email' });
  for (const v of [lead.url, lead.source && lead.externalId ? `${lead.source}:${lead.externalId}` : null, ...Object.values(lead.socials?.toObject?.() || lead.socials || {})]) if (v) out.push({ hash: suppressionHash(v), type: 'profile' });
  return out;
}

export async function suppressLead(lead) {
  const fps = leadFingerprints(lead);
  if (fps.length) await LeadSuppression.bulkWrite(fps.map(f => ({ updateOne: { filter: { hash: f.hash }, update: { $setOnInsert: f }, upsert: true } })));
  return fps.length;
}

export async function isSuppressed(cand) {
  const hashes = leadFingerprints(cand).map(f => f.hash);
  return hashes.length ? !!(await LeadSuppression.exists({ hash: { $in: hashes } })) : false;
}
