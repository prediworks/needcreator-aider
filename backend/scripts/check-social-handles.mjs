/**
 * Marques dont le compte Instagram ou TikTok inscrit sur la fiche ne ressemble ni au nom ni au site (compte d'un partenaire, d'une
 * publicité ou d'un jeu pris sur le site). Usage : node --env-file=.env scripts/check-social-handles.mjs [--apply]
 * Sans --apply : liste seulement. Avec --apply : la fiche est marquée « compte à vérifier » ; la file du jour affiche un avertissement
 * avant d'écrire. Rien n'est supprimé, aucun compte n'est retiré.
 * --reject <pseudo> : toutes les fiches jamais contactées qui portent ce compte Instagram ou TikTok passent « Hors cible » (ex. --reject pubgmobile).
 */
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { handleMatches } from '../src/services/acquisition/enrich.js';

const apply = process.argv.includes('--apply');
const rejectAt = process.argv.indexOf('--reject');
const reject = rejectAt > 0 ? String(process.argv[rejectAt + 1] || '').replace(/^@/, '').trim() : '';
await mongoose.connect(config.mongodb.uri);
const leads = mongoose.connection.db.collection('leads');
if (reject) {
  const rx = new RegExp(`(instagram\\.com/|tiktok\\.com/@)${reject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`, 'i');
  const hit = await leads.find({ kind: 'brand', status: { $nin: ['contacted', 'replied', 'registered'] }, $or: [{ 'socials.instagram': rx }, { 'socials.tiktok': rx }] }).project({ name: 1, status: 1 }).toArray();
  console.log(`Fiches jamais contactées portant le compte « ${reject} » : ${hit.length}`);
  for (const l of hit) console.log(`  ${l.name} (${l.status})`);
  if (hit.length) { const r = await leads.updateMany({ _id: { $in: hit.map(l => l._id) } }, { $set: { status: 'rejected' }, $unset: { 'socials.instagram': '', 'socials.tiktok': '' } }); await leads.updateMany({ _id: { $in: hit.map(l => l._id) } }, [{ $set: { notes: { $concat: [{ $ifNull: ['$notes', ''] }, { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$notes', ''] } }, 0] }, ' · ', ''] }, `Écarté le ${new Date().toLocaleDateString('fr-FR')} : compte ${reject} sans rapport avec la marque`] } } }]); console.log(`Fait : ${r.modifiedCount} fiche(s) passée(s) « Hors cible », le compte retiré.`); }
  await mongoose.disconnect(); process.exit(0);
}
const all = await leads.find({ kind: 'brand', status: { $in: ['new', 'qualified', 'to_contact', 'contacted', 'replied'] }, $or: [{ 'socials.instagram': { $nin: [null, ''] } }, { 'socials.tiktok': { $nin: [null, ''] } }] }).project({ name: 1, website: 1, socials: 1, socialsCheck: 1, status: 1 }).toArray();
const doubtful = [];
for (const l of all) {
  const hint = { name: l.name, website: l.website || '' };
  const bad = ['instagram', 'tiktok'].filter(net => l.socials?.[net] && !handleMatches(l.socials[net], hint));
  if (bad.length) doubtful.push({ l, bad });
}
const byHandle = new Map();
for (const { l, bad } of doubtful) for (const net of bad) { const h = l.socials[net]; byHandle.set(h, (byHandle.get(h) || []).concat(l.name)); }
console.log(`Marques actives avec un compte Instagram ou TikTok : ${all.length}`);
console.log(`Comptes qui ne ressemblent ni au nom ni au site : ${doubtful.length} fiche(s)\n`);
for (const { l, bad } of doubtful.slice(0, 150)) console.log(`  ${l.name} (${l.status}) · ${bad.map(net => `${net} : ${l.socials[net]}`).join(' · ')}${l.website ? ` · site ${l.website}` : ''}`);
if (doubtful.length > 150) console.log(`  … ${doubtful.length - 150} de plus`);
const shared = [...byHandle.entries()].filter(([, names]) => names.length > 1);
if (shared.length) { console.log('\nMême compte sur plusieurs fiches :'); for (const [h, names] of shared) console.log(`  ${h} → ${names.join(', ')}`); }
if (!apply) console.log('\nRien n\'a été modifié. Ajoutez --apply pour marquer ces fiches « compte à vérifier ».');
else {
  let n = 0;
  for (const { l, bad } of doubtful) { const set = {}; for (const net of bad) set[`socialsCheck.${net}`] = 'unverified'; const r = await leads.updateOne({ _id: l._id }, { $set: set }); n += r.modifiedCount; }
  console.log(`\nFait : ${n} fiche(s) marquée(s) « compte à vérifier ». La file du jour affiche l'avertissement ; corrigez avec « Réseaux » ou passez la fiche « Hors cible ».`);
}
await mongoose.disconnect();
process.exit(0);
