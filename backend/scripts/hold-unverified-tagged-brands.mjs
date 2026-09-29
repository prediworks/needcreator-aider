/**
 * Marques taguées par les créateurs entrées dans la prospection sans vérification stricte (avant le 29/09/2026 au soir).
 * Usage : node --env-file=.env scripts/hold-unverified-tagged-brands.mjs [--apply]
 * Sans --apply : liste seulement, rien n'est modifié.
 * Avec --apply : les fiches sont remises en attente (statut « À qualifier », hors file du jour, hors mailing, hors lot LinkedIn).
 *   Le prochain lot « marques taguées » lit leur profil en premier (60 par lot), puis les qualifie ou les écarte avec la règle stricte.
 * Aucune fiche n'est écartée par ce script : la bio lue autrefois n'a pas toujours été gardée, seule une nouvelle lecture du profil
 *   permet de dire sans se tromper si le compte est une marque ou une personne.
 * Jamais touchées : les fiches contactées, ayant répondu, inscrites, envoyées au mailing, ou en partenariat rémunéré déclaré.
 */
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';

const apply = process.argv.includes('--apply');
await mongoose.connect(config.mongodb.uri);
const leads = mongoose.connection.db.collection('leads');
const scope = {
  kind: 'brand', keyword: /créateurs UGC \(tag\)/i, status: { $in: ['new', 'qualified', 'to_contact'] },
  contactedAt: { $in: [null, undefined] }, $or: [{ 'mailing.pushedAt': null }, { 'mailing.pushedAt': { $exists: false } }],
  description: { $not: /partenariat rémunéré déclaré/i }, profilePending: { $ne: true }, profileCheckedAt: { $in: [null, undefined] },
};
const all = await leads.find(scope).project({ name: 1, handle: 1, status: 1, stats: 1, sizeTier: 1, socials: 1 }).sort({ createdAt: 1 }).toArray();
const withProfile = all.filter(l => l.socials?.instagram);
const noProfile = all.filter(l => !l.socials?.instagram);
const neverRead = withProfile.filter(l => l.stats?.subscribers == null && !l.sizeTier);
const oldRule = withProfile.filter(l => !(l.stats?.subscribers == null && !l.sizeTier));
const names = (list) => list.slice(0, 80).map(l => l.handle || l.name).join(', ') + (list.length > 80 ? `, … (${list.length - 80} de plus)` : '');

console.log(`Marques taguées actives, jamais contactées, sans vérification stricte : ${all.length}`);
console.log(`\n1. Profil jamais lu : ${neverRead.length}`);
if (neverRead.length) console.log(`   ${names(neverRead)}`);
console.log(`\n2. Profil lu avec l'ancienne règle, trop indulgente : ${oldRule.length}`);
if (oldRule.length) console.log(`   ${names(oldRule)}`);
if (noProfile.length) console.log(`\nSans profil Instagram sur la fiche (laissées telles quelles) : ${noProfile.length} · ${names(noProfile)}`);
console.log(`\nÀ remettre en attente : ${withProfile.length}, soit ${Math.ceil(withProfile.length / 60)} lot(s) « marques taguées » pour les relire.`);

if (!apply) console.log('\nRien n\'a été modifié. Ajoutez --apply pour remettre ces fiches en attente.');
else {
  const r = withProfile.length ? await leads.updateMany({ _id: { $in: withProfile.map(l => l._id) } }, { $set: { profilePending: true, status: 'new' }, $unset: { score: '', message: '', emailParagraph: '', hooks: '', aiSummary: '', signals: '' } }) : { modifiedCount: 0 };
  console.log(`\nFait : ${r.modifiedCount} fiche(s) remise(s) en attente. Elles ont quitté la file du jour.`);
  console.log('Lancez un lot « Marques taguées par les créateurs » : les profils en attente sont lus en premier.');
}
await mongoose.disconnect();
process.exit(0);
