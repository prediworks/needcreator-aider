/**
 * Active la visibilité publique (site + communication) pour les créateurs existants,
 * suite au passage de ces accords à « activé par défaut ». Le créateur peut toujours décocher dans son profil.
 * Usage : npm run consent:default
 */
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import User from '../src/models/User.js';

await mongoose.connect(config.mongodb.uri);
const r = await User.updateMany(
  { role: 'creator', $or: [{ 'profile.publicConsent.site': { $ne: true } }, { 'profile.publicConsent.marketing': { $ne: true } }] },
  { $set: { 'profile.publicConsent.site': true, 'profile.publicConsent.marketing': true, 'profile.publicConsent.updatedAt': new Date() } },
);
console.log(`Créateurs mis à jour : ${r.modifiedCount}`);
await mongoose.disconnect();
