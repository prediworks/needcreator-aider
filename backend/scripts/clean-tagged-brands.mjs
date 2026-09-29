/**
 * Nettoie les fausses fiches « marques taguées » créées avant le 29/09/2026 : comptes personnels cités dans des concours.
 * Usage : node --env-file=.env scripts/clean-tagged-brands.mjs [--apply]
 * Sans --apply : compte seulement. Avec --apply : supprime les fiches non contactées, non envoyées au mailing, sans partenariat rémunéré déclaré ;
 * sur les fiches gardées, retire un « site » qui est en réalité un lien de Meta.
 */
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
const apply = process.argv.includes('--apply');
await mongoose.connect(config.mongodb.uri);
const leads = mongoose.connection.db.collection('leads');
const origin = { kind: 'brand', keyword: /créateurs UGC \(tag\)/i };
const untouched = { contactedAt: { $in: [null, undefined] }, $or: [{ 'mailing.pushedAt': null }, { 'mailing.pushedAt': { $exists: false } }], status: { $nin: ['contacted', 'replied', 'registered'] } };
const fake = { ...origin, ...untouched, description: { $not: /partenariat rémunéré déclaré/i } };
const total = await leads.countDocuments(origin);
const toDelete = await leads.countDocuments(fake);
const metaSite = { ...origin, website: /^https?:\/\/([a-z0-9-]+\.)*(meta\.com|meta\.ai|threads\.(net|com)|fb\.com|fb\.me|messenger\.com|whatsapp\.com)(\/|$)/i };
const toFix = await leads.countDocuments(metaSite);
console.log(`Fiches « marques taguées » : ${total}. À supprimer (comptes cités sans partenariat déclaré, jamais contactés) : ${toDelete}. Site à retirer (lien Meta) : ${toFix}.`);
if (apply) {
  const d = await leads.deleteMany(fake);
  const f = await leads.updateMany(metaSite, { $unset: { website: '' } });
  console.log(`Fait : ${d.deletedCount} fiche(s) supprimée(s), ${f.modifiedCount} site(s) retiré(s). Relancez un lot « marques taguées » : seules les vraies marques seront créées.`);
} else console.log('Rien n\'a été modifié. Ajoutez --apply pour nettoyer.');
await mongoose.disconnect();
