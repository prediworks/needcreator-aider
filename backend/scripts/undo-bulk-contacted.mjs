/**
 * Annule un passage groupé en « Contacté » fait par erreur (sélection + bouton « Contactés » dans l'admin).
 * Usage : node --env-file=.env scripts/undo-bulk-contacted.mjs [minutes]   (défaut : 60)
 * Remet en « Qualifié » les fiches passées « Contacté » (canal email) dans les N dernières minutes, non poussées au mailing.
 */
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
const minutes = Math.max(1, parseInt(process.argv[2] || '60', 10));
await mongoose.connect(config.mongodb.uri);
const db = mongoose.connection.db;
const since = new Date(Date.now() - minutes * 60000);
const filter = { status: 'contacted', contactedVia: 'email', contactedAt: { $gte: since }, $or: [{ 'mailing.pushedAt': null }, { 'mailing.pushedAt': { $exists: false } }] };
const n = await db.collection('leads').countDocuments(filter);
const r = await db.collection('leads').updateMany(filter, { $set: { status: 'qualified', updatedAt: new Date() }, $unset: { contactedAt: '', contactedVia: '' } });
console.log(`${n} fiche(s) passée(s) « Contacté » (email) dans les ${minutes} dernières minutes : ${r.modifiedCount} remise(s) en « Qualifié ». Les fiches contactées avant, ou déjà envoyées au mailing, n'ont pas été touchées.`);
await mongoose.disconnect();
