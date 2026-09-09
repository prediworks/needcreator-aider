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
const brand = await makeContext();
const bp = brand.page; current = bp;

await step('Marque : inscription via le formulaire', async () => {
  await bp.goto(`${FRONT}/register?role=brand`);
  await bp.getByLabel('Email').fill(brandEmail);
  await bp.getByLabel(/Mot de passe/).fill(PASSWORD);
  await bp.getByLabel(/Nom de l'entreprise/).fill('Marque UI Test');
  await bp.getByLabel(/Site web/).fill('https://exemple.fr');
  await bp.locator('select').selectOption('beauty');
  await bp.getByRole('checkbox').check();
  await bp.getByRole('button', { name: 'Créer mon compte' }).click();
  await bp.waitForURL(/\/dashboard/, { timeout: 30000 });
  await bp.getByText('Nouvelle campagne').first().waitFor({ timeout: 20000 });
  await bp.screenshot({ path: `${SHOTS}/01-brand-dashboard.png`, fullPage: true });
  return 'arrivée sur le tableau de bord';
});

await step('Marque : vérification de l\'entreprise (SIRET) depuis le profil', async () => {
  await bp.goto(`${FRONT}/profile`);
  await bp.getByText('Vérification de l\'entreprise').waitFor({ timeout: 20000 });
  await bp.getByLabel(/SIRET/).fill('356 000 000 00048');
  await bp.getByRole('button', { name: 'Vérifier mon entreprise' }).click();
  await bp.getByText('Entreprise vérifiée').first().waitFor({ timeout: 20000 });
  await bp.getByText('NeedCreator Pro').first().waitFor({ timeout: 20000 });
  return 'vérifiée automatiquement, essai Pro affiché';
});

await step('Marque : création + publication d\'une campagne', async () => {
  await bp.goto(`${FRONT}/campaigns/new`);
  await bp.getByLabel(/Titre de la campagne/).fill('Campagne test interface utilisateur');
  await bp.getByPlaceholder(/Présentez votre marque/).fill('Nous cherchons une vidéo témoignage authentique pour notre nouvelle gamme de soins visage bio.');
  await bp.getByRole('button', { name: 'Beauté' }).click();
  await bp.getByRole('button', { name: 'Continuer' }).click();
  await bp.getByLabel(/Budget total/).fill('300');
  const d = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  await bp.getByLabel(/Date limite/).fill(d);
  await bp.getByRole('button', { name: /Enregistrer le brouillon/ }).click();
  await bp.getByText('Brouillon enregistré').waitFor({ timeout: 20000 });
  await bp.screenshot({ path: `${SHOTS}/02-campaign-draft.png`, fullPage: true });
  await bp.getByRole('button', { name: /Publier maintenant/ }).click();
  await bp.waitForURL(/\/campaigns\/[a-f0-9]{24}$/, { timeout: 20000 });
  campaignUrl = bp.url();
  await bp.getByText('Ouverte aux candidatures').first().waitFor({ timeout: 20000 });
  await bp.screenshot({ path: `${SHOTS}/03-campaign-published.png`, fullPage: true });
  return campaignUrl;
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
  await bp.getByRole('button', { name: 'Enregistrer' }).click();
  await bp.getByText('Marque UI Test Modifiée').first().waitFor({ timeout: 20000 });
  return 'nom modifié';
});

// ---------- CRÉATEUR ----------
const creator = await makeContext();
const cp = creator.page; current = cp;

await step('Créateur : inscription via le formulaire', async () => {
  await cp.goto(`${FRONT}/register?role=creator`);
  await cp.getByLabel('Email').fill(creatorEmail);
  await cp.getByLabel(/Mot de passe/).fill(PASSWORD);
  await cp.getByLabel(/Nom ou pseudo/).fill('Créateur UI Test');
  await cp.getByRole('button', { name: 'Beauté' }).click();
  await cp.getByRole('checkbox').check();
  await cp.getByRole('button', { name: 'Créer mon compte' }).click();
  await cp.waitForURL(/\/dashboard/, { timeout: 30000 });
  await cp.getByText('Avant de pouvoir candidater').waitFor({ timeout: 20000 });
  await cp.screenshot({ path: `${SHOTS}/04-creator-dashboard.png`, fullPage: true });
  return 'tableau de bord avec les étapes à compléter';
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

await step('Créateur : navigation Campagnes / Livraisons', async () => {
  await cp.goto(`${FRONT}/campaigns?filter=applied`);
  await cp.getByText('Vous n\'avez pas encore candidaté').waitFor({ timeout: 20000 });
  await cp.goto(`${FRONT}/deliveries`);
  await cp.getByText('Aucune livraison').waitFor({ timeout: 20000 });
  return 'OK';
});

await step('Aucune erreur JavaScript dans les pages', async () => {
  if (errors.length) throw new Error(errors.slice(0, 5).join(' | '));
  return 'OK';
});

// ---------- Nettoyage ----------
await step('Nettoyage des comptes de test', async () => {
  admin.initializeApp({ credential: admin.credential.cert({ projectId: process.env.FIREBASE_PROJECT_ID, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), clientEmail: process.env.FIREBASE_CLIENT_EMAIL }) });
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
