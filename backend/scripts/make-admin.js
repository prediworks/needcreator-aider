/**
 * Donne le rôle administrateur à un utilisateur existant (identifié par son email).
 * Usage : cd backend && npm run make-admin -- email@exemple.com
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const email = process.argv[2];
if (!email) {
  console.error('Usage : npm run make-admin -- email@exemple.com');
  process.exit(1);
}

const conn = await mongoose.connect(process.env.MONGODB_URI);
const users = conn.connection.db.collection('users');
const user = await users.findOne({ email: email.toLowerCase() });

if (!user) {
  console.error(`❌ Aucun utilisateur avec l'email ${email}. Créez d'abord le compte via la page d'inscription.`);
  await mongoose.disconnect();
  process.exit(1);
}

await users.updateOne({ _id: user._id }, { $set: { role: 'admin', status: 'active' } });
console.log(`✅ ${email} est maintenant administrateur. Reconnectez-vous puis ouvrez /admin.`);
await mongoose.disconnect();
