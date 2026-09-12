/**
 * Test navigateur automatique des parcours marque et créateur.
 * Prérequis : backend + frontend démarrés, puis une fois : npm install && npx playwright install chromium
 * Usage : npm run test:ui   (à la racine du projet)
 */
// Test navigateur (headless) des parcours marque et créateur sur le frontend local
import { chromium } from 'playwright';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BACKEND = new URL('../backend/', import.meta.url).pathname;
const require = createRequire(BACKEND + '/package.json');
const dotenv = require('dotenv');
dotenv.config({ path: BACKEND + '/.env' });
const admin = require('firebase-admin');
const mongoose = require('mongoose');

const FRONT = process.env.UI_FRONT_URL || 'http://localhost:3000';
const RUN = Date.now().toString(36);
const brandEmail = `ui-brand-${RUN}@needcreator-test.com`;
const creatorEmail = `ui-creator-${RUN}@needcreator-test.com`;
const PASSWORD = 'Test1234!';
const SHOTS = path.resolve('scripts/ui-screenshots'); fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ headless: true });

const results = []; let failed = 0;
let current = null;
async function step(name, fn) {
  try { const d = await fn(); results.push([true, name, d]); console.log(`✅ ${name}${d ? ' — ' + d : ''}`); }
  catch (e) {
    failed++; results.push([false, name, e.message]); console.log(`❌ ${name} — ${e.message.split('\n')[0]}`);
    if (current) { try { await current.screenshot({ path: `${SHOTS}/FAIL-${results.length}.png`, fullPage: true }); console.log('   url:', current.url()); } catch {} }
  }
}
const errors = [];
async function makeContext() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|401|404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  return { ctx, page };
}

let campaignUrl = '';

// ---------- MARQUE ----------
function adminAuth() {
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert({ projectId: process.env.FIREBASE_PROJECT_ID, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), clientEmail: process.env.FIREBASE_CLIENT_EMAIL }) });
  return admin.auth();
}
async function markEmailVerified(email) {
  const u = await adminAuth().getUserByEmail(email);
  await adminAuth().updateUser(u.uid, { emailVerified: true });
}

const brand = await makeContext();
const bp = brand.page; current = bp;

await step('Marque : inscription via le formulaire', async () => {
  await bp.goto(`${FRONT}/register?role=brand`);
  await bp.getByLabel('Email').fill(brandEmail);
  await bp.getByLabel(/Mot de passe/).fill(PASSWORD);
  await bp.getByLabel(/Nom de l'entreprise/).fill('Marque UI Test');
  await bp.getByRole('checkbox').check();
  await bp.getByRole('button', { name: 'Créer mon compte' }).click();
  await bp.waitForURL(/\/dashboard/, { timeout: 30000 });
  await bp.getByText('Nouvelle campagne').first().waitFor({ timeout: 20000 });
  await bp.getByText('Confirmez votre adresse email').waitFor({ timeout: 10000 });
  await markEmailVerified(brandEmail); // simule le clic sur le lien de confirmation
  await bp.screenshot({ path: `${SHOTS}/01-brand-dashboard.png`, fullPage: true });
  return 'arrivée sur le tableau de bord';
});

await step('Marque : vérification de l\'entreprise (SIRET) depuis le profil', async () => {
  await bp.goto(`${FRONT}/profile`);
  await bp.getByText('Vérification de l\'entreprise').waitFor({ timeout: 20000 });
  // Entreprise hors UE : code pays + numéro d'immatriculation → contrôle manuel
  await bp.getByLabel('Où votre entreprise est-elle immatriculée ?').selectOption('OTHER');
  await bp.getByLabel('Pays (code)').fill('CH');
  await bp.getByLabel('Numéro d\'immatriculation').fill('CHE-123.456.789');
  await bp.screenshot({ path: path.join(SHOTS, 'business-foreign.png'), fullPage: false });
  await bp.getByRole('button', { name: 'Envoyer pour contrôle manuel' }).click();
  await bp.getByText('Vérification manuelle en cours').first().waitFor({ timeout: 20000 });
  // Puis entreprise française : vérification immédiate
  await bp.getByLabel('Où votre entreprise est-elle immatriculée ?').selectOption('FR');
  await bp.getByLabel(/SIRET/).fill('356 000 000 00048');
  await bp.getByRole('button', { name: 'Vérifier mon entreprise' }).click();
  await bp.getByText('Entreprise vérifiée').first().waitFor({ timeout: 20000 });
  await bp.getByText('NeedCreator Pro').first().waitFor({ timeout: 20000 });
  return 'hors UE → contrôle manuel, puis SIRET vérifié automatiquement, essai Pro affiché';
});

await step('Marque : création + publication d\'une campagne', async () => {
  await bp.goto(`${FRONT}/campaigns/new`);
  await bp.getByText(/Il manque : un titre de 10 caractères/).waitFor({ timeout: 20000 }); // bouton grisé expliqué
  await bp.getByLabel(/Titre de la campagne/).fill('Campagne test interface utilisateur');
  await bp.getByPlaceholder(/Présentez votre marque/).fill('Nous cherchons une vidéo témoignage authentique pour notre nouvelle gamme de soins visage bio.');
  await bp.getByRole('button', { name: 'Beauté', exact: true }).click();
  await bp.getByRole('button', { name: 'Continuer' }).click();
  await bp.getByLabel(/Budget total/).fill('300');
  const d = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  await bp.getByLabel(/Date limite/).fill(d);
  await bp.getByRole('button', { name: /Enregistrer le brouillon/ }).click();
  await bp.getByText('Brouillon enregistré').waitFor({ timeout: 20000 });
  await bp.screenshot({ path: `${SHOTS}/02-campaign-draft.png`, fullPage: true });
  await bp.getByRole('button', { name: /Publier maintenant/ }).click();
  await bp.waitForURL(/\/campaigns\/[a-f0-9]{24}$/, { timeout: 60000, waitUntil: 'commit' });
  campaignUrl = bp.url();
  await bp.getByText('Ouverte aux candidatures').first().waitFor({ timeout: 20000 });
  await bp.getByText('Inviter un créateur que vous connaissez').waitFor({ timeout: 20000 }); // invitation d'un créateur extérieur
  await bp.screenshot({ path: `${SHOTS}/03-campaign-published.png`, fullPage: true });
  return campaignUrl;
});

await step('Site public : la campagne publiée est visible sans connexion (page indexable)', async () => {
  const id = campaignUrl.split('/').pop();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${FRONT}/campagnes`, { waitUntil: 'commit' });
  await p.getByText('Campagne test interface utilisateur').first().waitFor({ timeout: 60000 });
  await p.screenshot({ path: `${SHOTS}/03b-public-campaigns.png`, fullPage: true });
  await p.goto(`${FRONT}/campagnes/${id}`, { waitUntil: 'commit' });
  await p.getByRole('button', { name: 'Créer mon profil et envoyer un devis' }).waitFor({ timeout: 60000 });
  await p.screenshot({ path: `${SHOTS}/03c-public-campaign.png`, fullPage: true });
  await ctx.close();
  return 'liste et fiche publiques OK';
});

await step('Marque : rechargement de page = session conservée', async () => {
  await bp.reload();
  await bp.getByText('Ouverte aux candidatures').first().waitFor({ timeout: 20000 });
  if (bp.url().includes('/login')) throw new Error('Redirigé vers /login après rechargement');
  return 'OK';
});

await step('Marque : déconnexion puis reconnexion', async () => {
  await bp.getByRole('button', { name: 'Déconnexion' }).click();
  await bp.waitForURL(`${FRONT}/`, { timeout: 20000 });
  await bp.goto(`${FRONT}/login`);
  await bp.getByLabel('Email').fill(brandEmail);
  await bp.getByLabel('Mot de passe').fill(PASSWORD);
  await bp.getByRole('button', { name: 'Se connecter' }).click();
  await bp.waitForURL(/\/dashboard/, { timeout: 30000 });
  await bp.getByText('Campagne test interface utilisateur').first().waitFor({ timeout: 20000 });
  return 'campagne visible sur le tableau de bord';
});

await step('Marque : page profil (édition)', async () => {
  await bp.goto(`${FRONT}/profile`);
  await bp.getByRole('button', { name: 'Modifier le profil' }).click();
  await bp.getByLabel(/Nom de l'entreprise/).fill('Marque UI Test Modifiée');
  await bp.getByPlaceholder(/Qui êtes-vous, que vendez-vous/).fill('Marque de cosmétiques bio testée par le parcours interface.');
  await bp.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await bp.getByText('Marque UI Test Modifiée').first().waitFor({ timeout: 20000 });
  await bp.reload();
  await bp.getByText('Marque de cosmétiques bio testée par le parcours interface.').waitFor({ timeout: 20000 }); // présentation sauvegardée et affichée hors édition
  return 'nom et présentation modifiés, visibles après rechargement';
});

// ---------- CRÉATEUR ----------
const creator = await makeContext();
const cp = creator.page; current = cp;

await step('Créateur : inscription via le formulaire', async () => {
  await cp.goto(`${FRONT}/register?role=creator`);
  await cp.getByLabel('Email').fill(creatorEmail);
  await cp.getByLabel(/Mot de passe/).fill(PASSWORD);
  await cp.getByLabel(/Nom ou pseudo/).fill('Créateur UI Test');
  await cp.getByRole('button', { name: 'Beauté', exact: true }).click();
  await cp.getByRole('checkbox').check();
  await cp.getByRole('button', { name: 'Créer mon compte' }).click();
  await cp.waitForURL(/\/dashboard/, { timeout: 30000 });
  await cp.getByText('Ajoutez 3 vidéos à votre portfolio').waitFor({ timeout: 20000 });
  await markEmailVerified(creatorEmail);
  await cp.screenshot({ path: `${SHOTS}/04-creator-dashboard.png`, fullPage: true });
  return 'tableau de bord avec les étapes à compléter';
});

await step('Créateur : « Ajouter mes vidéos » mène directement au bloc portfolio', async () => {
  await cp.goto(`${FRONT}/dashboard`);
  await cp.getByRole('link', { name: /Ajouter mes vidéos/ }).click();
  await cp.waitForURL(/\/profile#portfolio$/, { timeout: 20000 });
  await cp.locator('#portfolio').waitFor({ timeout: 20000 });
  await cp.getByLabel('Titre', { exact: true }).waitFor({ timeout: 10000 }); // formulaire d'ajout ouvert automatiquement
  await cp.screenshot({ path: `${SHOTS}/04b-profile-portfolio-anchor.png` });
  return 'défilement ciblé + formulaire d\'ajout ouvert';
});

await step('Créateur : campagne fraîchement publiée = avant-première Ambassadeurs', async () => {
  await cp.goto(campaignUrl);
  await cp.getByText(/avant-première/i).first().waitFor({ timeout: 20000 });
  await cp.screenshot({ path: `${SHOTS}/05-creator-campaign.png`, fullPage: true });
  return 'message d\'avant-première affiché';
});

await step('Créateur : profil, Stripe et upload portfolio', async () => {
  await cp.goto(`${FRONT}/profile`);
  await cp.getByText('Recevoir mes paiements').waitFor({ timeout: 20000 });
  await cp.getByRole('button', { name: 'Ajouter une vidéo' }).click();
  const bytes = Buffer.concat([Buffer.from('\x00\x00\x00\x18ftypmp42', 'binary'), Buffer.alloc(4096, 1)]);
  await cp.setInputFiles('input[type=file]', { name: 'portfolio.mp4', mimeType: 'video/mp4', buffer: bytes });
  await cp.getByLabel('Titre').fill('Ma vidéo test');
  await cp.getByRole('button', { name: /^Envoyer$/ }).click();
  await cp.getByText('Vidéo ajoutée au portfolio').waitFor({ timeout: 60000 });
  await cp.getByText('Portfolio (1 vidéo').waitFor({ timeout: 20000 });
  const video = await cp.locator('video').first().getAttribute('src');
  if (!video || !video.startsWith('http')) throw new Error('Lecteur vidéo sans source');
  await cp.screenshot({ path: `${SHOTS}/06-creator-profile.png`, fullPage: true });
  return 'vidéo listée avec lecteur';
});

await step('Créateur : informations administratives (mandat de facturation) depuis le profil', async () => {
  await cp.goto(`${FRONT}/profile#legal`);
  await cp.getByText('Informations administratives').first().waitFor({ timeout: 20000 });
  await cp.getByLabel('Prénom').fill('Camille');
  await cp.getByLabel('Nom', { exact: true }).fill('Test');
  await cp.getByLabel(/SIRET/).fill('356 000 000 00048');
  await cp.getByLabel('Adresse', { exact: true }).fill('1 rue de la Paix');
  await cp.getByLabel('Code postal').fill('75002');
  await cp.getByLabel('Ville').fill('Paris');
  await cp.getByText(/Il manque : .*Mandat de facturation/).waitFor({ timeout: 10000 }); // le bouton grisé explique ce qui manque
  await cp.getByRole('checkbox', { name: /Mandat de facturation/ }).check();
  await cp.getByRole('button', { name: 'Enregistrer les informations administratives' }).click();
  await cp.getByText(/Mandat de facturation accepté le/).waitFor({ timeout: 30000 });
  await cp.getByText(/Non assujetti à la TVA/).waitFor({ timeout: 10000 });
  return 'formulaire explicite, mandat accepté, franchise de TVA par défaut';
});

await step('Créateur : navigation Campagnes / Missions', async () => {
  await cp.goto(`${FRONT}/campaigns?filter=applied`);
  await cp.getByText('Vous n\'avez pas encore candidaté').waitFor({ timeout: 20000 });
  await cp.goto(`${FRONT}/deliveries`);
  await cp.getByRole('heading', { name: 'Mes missions' }).waitFor({ timeout: 20000 });
  await cp.getByRole('tab', { name: /À livrer/ }).click();
  await cp.getByText('Aucune mission').waitFor({ timeout: 20000 });
  return 'OK';
});

await step('Académie : liste des guides et un guide avec son quiz', async () => {
  await cp.goto(`${FRONT}/academie`);
  await cp.getByRole('heading', { name: /Académie/ }).waitFor({ timeout: 20000 });
  await cp.getByRole('link', { name: /Lire le guide/ }).first().click();
  await cp.getByRole('heading', { name: 'Quiz' }).waitFor({ timeout: 20000 });
  await cp.getByText(/Il manque : \d+ réponse/).waitFor({ timeout: 10000 });
  return 'guides listés, quiz affiché';
});

await step('Pages publiques /marques et /createurs', async () => {
  await cp.goto(`${FRONT}/marques`);
  await cp.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
  await cp.getByText('Pourquoi les marques choisissent NeedCreator').waitFor({ timeout: 20000 });
  await cp.getByRole('link', { name: /Publier ma première campagne/ }).first().waitFor();
  await cp.goto(`${FRONT}/createurs`);
  await cp.getByText('Pourquoi les créateurs choisissent NeedCreator').waitFor({ timeout: 20000 });
  await cp.getByText(/% du devis pour vous/).first().waitFor();
  return 'les deux pages se chargent avec leurs arguments et boutons';
});

await step('Page /auth/action : lien invalide affiche une erreur claire', async () => {
  await cp.goto(`${FRONT}/auth/action?mode=verifyEmail&oobCode=invalide`);
  await cp.getByText('Lien invalide').waitFor({ timeout: 30000 });
  await cp.getByText(/invalide ou a déjà été utilisé/).waitFor({ timeout: 10000 });
  return 'OK';
});

await step('Aucune erreur JavaScript dans les pages', async () => {
  if (errors.length) throw new Error(errors.slice(0, 5).join(' | '));
  return 'OK';
});

// ---------- Nettoyage ----------
await step('Nettoyage des comptes de test', async () => {
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert({ projectId: process.env.FIREBASE_PROJECT_ID, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), clientEmail: process.env.FIREBASE_CLIENT_EMAIL }) });
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const users = await db.collection('users').find({ email: { $in: [brandEmail, creatorEmail] } }).toArray();
  const ids = users.map(u => u._id);
  const camps = await db.collection('campaigns').find({ brandId: { $in: ids } }).project({ _id: 1 }).toArray();
  await db.collection('deliveries').deleteMany({ campaignId: { $in: camps.map(c => c._id) } });
  await db.collection('campaigns').deleteMany({ brandId: { $in: ids } });
  await db.collection('users').deleteMany({ _id: { $in: ids } });
  for (const e of [brandEmail, creatorEmail]) { try { const u = await admin.auth().getUserByEmail(e); await admin.auth().deleteUser(u.uid); } catch {} }
  await mongoose.disconnect();
  return 'OK';
});

await browser.close();
console.log(`\n=== Résultat UI : ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
