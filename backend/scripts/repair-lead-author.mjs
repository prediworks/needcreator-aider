/**
 * Répare les fiches « publication Instagram » auxquelles l'extension a attribué un mauvais auteur (ex. le compte connecté).
 * Usage : node --env-file=.env scripts/repair-lead-author.mjs <pseudo>   (sans @)
 * Retire pseudo, profil Instagram, description, abonnés et email s'il vient de ce profil, et remet la fiche « à compléter ».
 */
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
const handle = String(process.argv[2] || '').replace(/^@/, '').trim();
if (!handle) { console.error('Pseudo manquant. Exemple : node --env-file=.env scripts/repair-lead-author.mjs prospector003'); process.exit(1); }
await mongoose.connect(config.mongodb.uri);
const db = mongoose.connection.db;
const re = new RegExp(`^https?://(www\\.)?instagram\\.com/${handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`, 'i');
const filter = { kind: 'creator', url: /instagram\.com\/(p|reel|reels|tv)\//i, $or: [{ handle: new RegExp(`^@?${handle}$`, 'i') }, { 'socials.instagram': re }] };
const n = await db.collection('leads').countDocuments(filter);
const r = await db.collection('leads').updateMany(filter, { $unset: { handle: '', 'socials.instagram': '', description: '', 'stats.subscribers': '', website: '', 'enrich.assistantAt': '' }, $set: { status: 'new', updatedAt: new Date() } });
const t = await db.collection('browsertasks').updateMany({ status: 'pending', type: 'read_profile', 'input.url': re }, { $set: { status: 'cancelled', outcome: 'annulée : auteur erroné (compte connecté)' } });
console.log(`${n} fiche(s) trouvée(s), ${r.modifiedCount} remise(s) à zéro (pseudo, profil, description, abonnés) ; ${t.modifiedCount} tâche(s) de lecture de ce profil annulée(s). Relancez le lot « publications sans auteur ».`);
await mongoose.disconnect();
