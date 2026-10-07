/**
 * Nouveau message côté marques (07/10/2026) : met à jour les textes déjà rédigés mais pas encore envoyés, sans repasser par l'IA.
 * - Messages privés des fiches marques jamais contactées : la phrase qui présente NeedCreator est remplacée.
 * - Commentaires proposés sous les demandes de marques encore « à répondre » : la présentation de NeedCreator est remplacée quand elle reprend
 *   la formule exacte ; les commentaires formulés autrement restent tels quels (ils sont relus avant publication).
 * Rien n'est touché sur ce qui est parti (fiches contactées, demandes répondues) : la fiche garde la trace de ce qui a été envoyé.
 * Usage : node --env-file=.env scripts/update-brand-messages.mjs [--apply]   (sans --apply : simulation, rien n'est modifié)
 */
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';

const apply = process.argv.includes('--apply');
const DM_OLD = 'une plateforme où des créateurs vérifiés tournent des vidéos pour vos pubs, payées seulement si elles vous conviennent';
const DM_NEW = 'qui repère les publicités qui marchent dans votre secteur et les fait tourner par des créateurs vérifiés, payées seulement si elles vous conviennent';
const GROUP_OLD = 'NeedCreator, plateforme française de vidéos UGC';
const GROUP_NEW = 'NeedCreator, plateforme française qui aide les marques à savoir quelles vidéos tourner et les fait tourner par des créateurs';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

await mongoose.connect(config.mongodb.uri);
const db = mongoose.connection.db;

// Messages privés : fiches marques jamais contactées
const leads = await db.collection('leads').find({ kind: 'brand', status: { $in: ['new', 'qualified', 'to_contact'] }, message: { $regex: esc(DM_OLD) } }).project({ name: 1, status: 1, message: 1 }).toArray();
console.log(`Messages privés à mettre à jour (marques jamais contactées) : ${leads.length}`);
for (const l of leads.slice(0, 10)) console.log(`  ${l.name} (${l.status})`);
if (leads.length > 10) console.log(`  … ${leads.length - 10} de plus`);

// Commentaires de groupes : demandes de marques encore à traiter
const posts = await db.collection('groupposts').find({ status: 'todo', kind: { $in: ['brand_seeks_creators', 'brand_question'] }, comment: { $regex: esc(GROUP_OLD) } }).project({ brand: 1, author: 1, comment: 1 }).toArray();
const otherPosts = await db.collection('groupposts').countDocuments({ status: 'todo', kind: { $in: ['brand_seeks_creators', 'brand_question'] }, comment: { $not: { $regex: esc(GROUP_OLD) } } });
console.log(`\nCommentaires de groupes à mettre à jour : ${posts.length} (${otherPosts} autre(s) formulé(s) autrement, laissé(s) tel(s) quel(s))`);
for (const p of posts.slice(0, 10)) console.log(`  ${p.brand || p.author || 'demande'}`);

if (apply) {
  let n = 0;
  for (const l of leads) { await db.collection('leads').updateOne({ _id: l._id }, { $set: { message: l.message.split(DM_OLD).join(DM_NEW) } }); n++; }
  let m = 0;
  for (const p of posts) { await db.collection('groupposts').updateOne({ _id: p._id }, { $set: { comment: p.comment.split(GROUP_OLD).join(GROUP_NEW) } }); m++; }
  console.log(`\nMis à jour : ${n} message(s) privé(s), ${m} commentaire(s).`);
} else console.log('\nRien n\'a été modifié. Ajoutez --apply pour mettre à jour.');
await mongoose.disconnect();
