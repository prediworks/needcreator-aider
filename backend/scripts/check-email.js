/**
 * Envoie un email de test avec la configuration SMTP du .env et affiche la réponse du serveur.
 * Usage : cd backend && npm run check:email -- destinataire@exemple.com
 * Le contenu imite l'email de confirmation (lien Firebase) pour détecter un filtrage sur le contenu.
 */
import 'dotenv/config';
import nodemailer from 'nodemailer';

const to = process.argv[2];
if (!to) { console.log('Usage : npm run check:email -- destinataire@exemple.com'); process.exit(1); }

const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, FROM_EMAIL, FIREBASE_PROJECT_ID } = process.env;
console.log(`SMTP ${SMTP_HOST}:${SMTP_PORT} (secure=${SMTP_SECURE}) · utilisateur ${SMTP_USER} · expéditeur ${FROM_EMAIL}`);
if (SMTP_USER && FROM_EMAIL && SMTP_USER.toLowerCase() !== FROM_EMAIL.toLowerCase()) {
  console.log('⚠️  FROM_EMAIL différent de SMTP_USER : OVH refuse généralement cette configuration.');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST, port: Number(SMTP_PORT), secure: SMTP_SECURE === 'true',
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  logger: false,
});

try {
  await transporter.verify();
  console.log('✅ Connexion et authentification SMTP OK');
} catch (e) {
  console.log(`❌ Connexion SMTP impossible : ${e.message}`); process.exit(1);
}

const fakeLink = `https://${FIREBASE_PROJECT_ID}.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=TEST&continueUrl=https://needcreator.com/dashboard`;
const tests = [
  ['Test NeedCreator 1/2 : texte simple', '<p>Email de test envoyé par le script check:email. Si vous le recevez, le SMTP fonctionne.</p>'],
  ['Test NeedCreator 2/2 : avec lien de confirmation', `<h1>Bienvenue !</h1><p>Confirmez votre adresse :</p><p><a href="${fakeLink}">Confirmer mon adresse</a></p><p style="color:#666;font-size:13px">${fakeLink}</p>`],
];
for (const [subject, html] of tests) {
  try {
    const info = await transporter.sendMail({ from: FROM_EMAIL, to, subject, html, text: html.replace(/<[^>]*>/g, '') });
    console.log(`✅ "${subject}" accepté par le serveur · id ${info.messageId} · réponse : ${info.response}`);
  } catch (e) {
    console.log(`❌ "${subject}" refusé : ${e.response || e.message}`);
  }
}
console.log('\nSi les deux sont acceptés mais qu\'un seul arrive, le filtrage se fait sur le contenu (lien firebaseapp.com) côté réception.');
