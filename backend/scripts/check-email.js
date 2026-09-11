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

const origin = (process.env.FRONTEND_URL || 'https://needcreator.com').split(',')[0].trim();
const fakeLink = `${origin}/auth/action?mode=verifyEmail&oobCode=TEST&continueUrl=${origin}/dashboard`;
const firebaseLink = `https://${FIREBASE_PROJECT_ID}.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=TEST`;
const { renderLayout, summary, htmlToText } = await import('../src/services/email.js');
const layoutFragment = `<h1>Bonjour Marque test,</h1><p>Un créateur a envoyé un devis pour votre campagne.</p>${summary([['Campagne', 'Vidéo témoignage soins visage'], ['Créateur', 'Camille · Ambassadeur'], ['Prix', '300 €']])}<p><a href="${origin}/dashboard">Voir le devis</a></p><p style="color:#666;font-size:13px">Cet email est un aperçu du gabarit utilisé par tous les emails NeedCreator.</p>`;
const tests = [
  ['Test NeedCreator 4/4 : gabarit HTML (logo, résumé, bouton, pied de page)', renderLayout(layoutFragment), htmlToText(layoutFragment)],
  ['Test NeedCreator 1/2 : texte simple', '<p>Email de test envoyé par le script check:email. Si vous le recevez, le SMTP fonctionne.</p>'],
  ['Test NeedCreator 2/3 : lien de confirmation NeedCreator', `<h1>Bienvenue !</h1><p>Confirmez votre adresse :</p><p><a href="${fakeLink}">Confirmer mon adresse</a></p><p style="color:#666;font-size:13px">${fakeLink}</p>`],
  ['Test NeedCreator 3/3 : lien firebaseapp.com (ancien format)', `<p>Lien : <a href="${firebaseLink}">${firebaseLink}</a></p>`],
];
for (const [subject, html, text] of tests) {
  try {
    const info = await transporter.sendMail({ from: FROM_EMAIL, to, subject, html, text: text || html.replace(/<[^>]*>/g, '') });
    console.log(`✅ "${subject}" accepté par le serveur · id ${info.messageId} · réponse : ${info.response}`);
  } catch (e) {
    console.log(`❌ "${subject}" refusé : ${e.response || e.message}`);
  }
}
console.log('\nAttendu : 1/3 et 2/3 reçus. Si 3/3 n\'arrive pas, c\'est le filtre sur firebaseapp.com, contourné par l\'application.');
