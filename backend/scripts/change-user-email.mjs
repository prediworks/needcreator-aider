/**
 * Remplace l'adresse email d'un compte (erreur à l'inscription), sans toucher au compte, au portfolio ni au mot de passe :
 * connexion Firebase et fiche NeedCreator, puis lien de confirmation envoyé à la nouvelle adresse.
 * Même chose que le bouton « Changer l'email » dans Admin → Utilisateurs.
 * Usage : node --env-file=.env scripts/change-user-email.mjs ancienne@adresse nouvelle@adresse [--apply]   (sans --apply : simulation)
 */
import mongoose from 'mongoose';
import '../src/middleware/auth.js';
import User from '../src/models/User.js';
import { config } from '../src/config/index.js';
import { changeUserEmail } from '../src/services/userEmail.js';

const [oldEmail, newEmail] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const apply = process.argv.includes('--apply');
if (!oldEmail || !newEmail) { console.log('Usage : node --env-file=.env scripts/change-user-email.mjs ancienne@adresse nouvelle@adresse [--apply]'); process.exit(1); }

await mongoose.connect(config.mongodb.uri);
const user = await User.findOne({ email: oldEmail.trim().toLowerCase() }).select('email role profile.name profile.companyName createdAt').lean();
if (!user) { console.log(`Aucun compte avec l'adresse ${oldEmail}.`); await mongoose.disconnect(); process.exit(1); }
console.log(`Compte trouvé : ${user.profile?.companyName || user.profile?.name || '(sans nom)'} · ${user.role} · inscrit le ${new Date(user.createdAt).toLocaleDateString('fr-FR')}`);
if (!apply) {
  console.log(`\nSimulation : ${user.email} serait remplacée par ${newEmail.trim().toLowerCase()}. Relancez avec --apply pour le faire.`);
} else {
  try {
    const out = await changeUserEmail(user._id, newEmail, 'script');
    console.log(`✅ Adresse changée : ${out.old} → ${out.email}`);
    console.log(out.linkSent ? 'Lien de confirmation envoyé à la nouvelle adresse.' : '⚠️  Lien de confirmation non envoyé : utilisez « Confirmer l\'email » dans l\'admin si besoin.');
  } catch (err) {
    console.log(`❌ ${err.message}`);
  }
}
await mongoose.disconnect();
process.exit(0);
