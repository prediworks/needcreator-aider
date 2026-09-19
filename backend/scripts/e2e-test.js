/**
 * Test de bout en bout de tous les flux métier, via l'API réelle.
 *
 * Crée une marque + un créateur de test (emails e2e-*@needcreator-test.com), puis déroule :
 * inscription → campagne → publication → portfolio → candidature → sélection (+ paiement Stripe test)
 * → upload livrables → soumission → révision → re-soumission → approbation (+ encaissement) → avis.
 *
 * Usage : cd backend && npm run test:e2e            (garde les données)
 *         cd backend && npm run test:e2e -- --clean  (supprime les comptes de test à la fin)
 *
 * Prérequis : backend démarré (npm run dev) et frontend/.env.local présent (clé API Firebase web).
 */
import dotenv from 'dotenv';
import fs from 'fs';
import http from 'http';
import path from 'path';
import mongoose from 'mongoose';
import admin from 'firebase-admin';

dotenv.config();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API = process.env.E2E_API_URL || `http://localhost:${process.env.PORT || 3002}/api`;
const CLEAN = process.argv.includes('--clean');
const RUN = Date.now().toString(36);

// Clé API Firebase web (lue dans frontend/.env.local) pour échanger un custom token contre un ID token
function readFrontendEnv() {
  for (const file of ['../frontend/.env.local', '../frontend/.env']) {
    const p = path.resolve(process.cwd(), file);
    if (fs.existsSync(p)) {
      const m = fs.readFileSync(p, 'utf8').match(/NEXT_PUBLIC_FIREBASE_API_KEY=(.+)/);
      if (m) return m[1].trim();
    }
  }
  return process.env.FIREBASE_WEB_API_KEY;
}
const WEB_API_KEY = readFrontendEnv();
if (!WEB_API_KEY) {
  console.error('❌ Clé NEXT_PUBLIC_FIREBASE_API_KEY introuvable (frontend/.env.local)');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
});

const results = [];
let failed = 0;

async function step(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`✅ ${name}${detail ? ' — ' + detail : ''}`);
  } catch (e) {
    failed++;
    results.push({ name, ok: false, detail: e.message });
    console.log(`❌ ${name} — ${e.message}`);
  }
}

async function firebaseUser(email, emailVerified = true) {
  let user;
  try { user = await admin.auth().getUserByEmail(email); }
  catch {
    try { user = await admin.auth().createUser({ email, password: 'Test1234!', emailVerified }); }
    catch (err) {
      // Firebase peut mettre quelques secondes à refléter une suppression récente
      if (err?.code !== 'auth/email-already-exists') throw err;
      await new Promise(r => setTimeout(r, 3000));
      user = await admin.auth().getUserByEmail(email);
    }
  }
  const customToken = await admin.auth().createCustomToken(user.uid);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const data = await r.json();
  if (!data.idToken) throw new Error('Échec échange token Firebase : ' + JSON.stringify(data));
  return { uid: user.uid, idToken: data.idToken };
}

/** Informations administratives (obligatoires pour devis / acceptation) */
async function setLegalInfo(api, role) {
  const body = role === 'brand'
    ? { signatoryName: 'Jean Test', signatoryTitle: 'Gérant' }
    : { firstName: 'Camille', lastName: 'Test', status: 'micro', siret: '35600000000048', address: { line1: '1 rue de la Paix', postalCode: '75002', city: 'Paris', country: 'France' }, billingMandate: true };
  const r = await api('PUT', '/auth/legal-info', body);
  expect(r.status === 200 && r.data.hasLegalInfo === true, `Informations administratives (${role}) refusées`, r);
  return r;
}

function client(idToken) {
  return async (method, url, body, { form } = {}) => {
    const headers = { Authorization: `Bearer ${idToken}` };
    let payload = body;
    if (!form && body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const r = await fetch(API + url, { method, headers, body: payload });
    let data = null;
    try { data = await r.json(); } catch { /* no body */ }
    return { status: r.status, data };
  };
}

function expect(cond, message, res) {
  if (!cond) throw new Error(`${message}${res ? (res.status ? ' → HTTP ' + res.status + ' ' : ' → ') + String(JSON.stringify(res.data !== undefined ? res.data : res)).slice(0, 400) : ''}`);
}

// Petit fichier vidéo factice (les vrais encodages ne sont pas nécessaires pour tester l'upload)
function fakeVideo(name) {
  const bytes = Buffer.concat([Buffer.from('\x00\x00\x00\x18ftypmp42', 'binary'), Buffer.alloc(2048, 1)]);
  return new File([bytes], name, { type: 'video/mp4' });
}
function fakeImage(name) {
  // PNG 1×1 valide
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  return new File([bytes], name, { type: 'image/png' });
}

const brandEmail = `e2e-brand-${RUN}@needcreator-test.com`;
const creatorEmail = `e2e-creator-${RUN}@needcreator-test.com`;
let brand, creator, brandApi, creatorApi, adminApi;
const extraCleanup = [];
let brandUser, creatorUser, campaign, delivery;
let c2, c2Api; // second créateur (multi-créateurs), réutilisé par la garantie de remplacement

console.log(`\n=== Test de bout en bout (${API}) ===\n`);

await step('Backend joignable (/health)', async () => {
  const r = await fetch(API.replace(/\/api$/, '/health'));
  expect(r.ok, 'Le backend ne répond pas. Lancez "npm run dev" dans backend/');
  return 'OK';
});

await step('Comptes Firebase de test', async () => {
  brand = await firebaseUser(brandEmail);
  creator = await firebaseUser(creatorEmail);
  brandApi = client(brand.idToken);
  creatorApi = client(creator.idToken);
  return `${brandEmail}, ${creatorEmail}`;
});

await mongoose.connect(process.env.MONGODB_URI);

await step('Inscription marque (+ client Stripe)', async () => {
  const res = await brandApi('POST', '/auth/register/brand', {
    acceptTerms: true, email: brandEmail, companyName: 'Marque Test E2E', website: 'https://exemple.fr', industry: 'ecommerce',
  });
  expect(res.status === 201, 'Inscription marque échouée', res);
  brandUser = res.data.user;
  expect(brandUser.stripeCustomerId, 'Client Stripe non créé', res);
  expect(brandUser.hasLegalInfo === false, 'Une marque neuve ne devrait pas avoir de signataire', res);
  await setLegalInfo(brandApi, 'brand');
  return `id ${brandUser.id}, Stripe ${brandUser.stripeCustomerId}, signataire enregistré`;
});

await step('Marque : essai Pro offert à l\'inscription + vérification d\'entreprise (SIRET)', async () => {
  const me = await brandApi('GET', '/auth/profile');
  expect(me.data.user.plan?.plan === 'pro' && me.data.user.plan.status === 'trialing', 'La marque devrait être en essai Pro', me);
  expect(me.data.user.businessVerified === false, 'La marque ne devrait pas encore être vérifiée', me);
  const bad = await brandApi('POST', '/auth/business-verification', { siret: '12345678901234' });
  expect(bad.status === 200 && bad.data.business.status === 'rejected', 'Un SIRET au format invalide doit être refusé', bad);
  const users = mongoose.connection.db.collection('users');
  const settings = mongoose.connection.db.collection('settings');
  await settings.updateOne({ key: 'businessRegistryCheck' }, { $set: { value: true } }, { upsert: true });
  await new Promise(r => setTimeout(r, 100));
  const fake = await brandApi('POST', '/auth/business-verification', { siret: '732 829 320 00074', website: 'https://exemple.fr' });
  if (fake.data.registryChecked && !/injoignable|registre HTTP/.test(fake.data.business.note || '')) { // registre indisponible ou limité (429) : contrôle formel seulement
    expect(fake.status === 200 && fake.data.business.status === 'rejected' && /introuvable/.test(fake.data.business.note), 'Un SIRET bien formé mais inexistant au registre doit être refusé', fake);
  }
  const ok = await brandApi('POST', '/auth/business-verification', { siret: '356 000 000 00048', website: 'https://exemple.fr' });
  expect(ok.status === 200 && ok.data.business.status === 'verified' && ok.data.business.method === 'auto', 'La vérification automatique devrait réussir (SIRET réel, site, email pro)', ok);
  const registryOk = ok.data.registry?.legalName === 'LA POSTE' || /injoignable|registre HTTP/.test(ok.data.business.note || '');
  expect(registryOk, 'Le registre devrait renvoyer la raison sociale', ok);
  // Désactivation depuis l'admin : le SIRET fictif passe alors le contrôle formel
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  const list = await brandApi('GET', '/admin/settings');
  expect(list.status === 200 && list.data.settings.some(x => x.key === 'businessRegistryCheck'), 'Réglage registre absent', list);
  // Sauvegardes : répertoire (réglage texte), sauvegarde manuelle, liste
  const os = await import('os'); const fsm = await import('fs'); const pathm = await import('path');
  const bdir = pathm.join(os.tmpdir(), `nc-e2e-backups-${RUN}`);
  const setDir = await brandApi('PUT', '/admin/settings/backupDir', { value: bdir });
  expect(setDir.status === 200 && setDir.data.value === bdir, 'Réglage texte (répertoire de sauvegarde) refusé', setDir);
  const bk = await brandApi('POST', '/admin/backups/run');
  expect(bk.status === 200 && bk.data.backup?.name && bk.data.backup.collections?.users >= 1, 'Sauvegarde manuelle échouée', bk);
  const bl = await brandApi('GET', '/admin/backups');
  expect(bl.status === 200 && bl.data.dir === bdir && bl.data.backups.some(x => x.name === `${bk.data.backup.name}.tar.gz`), 'La sauvegarde doit apparaître dans la liste', bl);
  expect(fsm.existsSync(pathm.join(bdir, `${bk.data.backup.name}.tar.gz`)), 'Archive absente du disque', bl);
  const noConfirm = await brandApi('POST', `/admin/backups/${bk.data.backup.name}.tar.gz/restore`, {});
  expect(noConfirm.status === 400, 'La restauration exige la confirmation RESTAURER', noConfirm);
  const rs = await brandApi('POST', `/admin/backups/${bk.data.backup.name}.tar.gz/restore`, { confirm: 'RESTAURER' });
  expect(rs.status === 200 && rs.data.restored?.users >= 1, 'Restauration depuis l\'admin échouée', rs);
  fsm.rmSync(bdir, { recursive: true, force: true });
  await brandApi('PUT', '/admin/settings/backupDir', { value: '' });
  expect(list.data.settings.some(x => x.key === 'platformFeePercent' && x.group === 'Commission') && list.data.settings.some(x => x.key === 'proFeePercent'), 'Commissions standard et Pro attendues dans les réglages admin (groupe Commission)', list);
  const noMail = await brandApi('PUT', '/admin/settings/verificationEmails', { value: false });
  expect(noMail.status === 200, 'Réglage emails de confirmation échoué', noMail);
  await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  const resend = await brandApi('POST', '/auth/send-verification');
  expect(resend.status === 200 && (resend.data.verified === true || resend.data.disabled === true), 'Réglage désactivé : aucun lien Firebase demandé', resend);
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  await brandApi('PUT', '/admin/settings/verificationEmails', { value: true });
  const off = await brandApi('PUT', '/admin/settings/businessRegistryCheck', { value: false });
  expect(off.status === 200, 'Désactivation du registre échouée', off);
  await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  const formal = await brandApi('POST', '/auth/business-verification', { siret: '732 829 320 00074', website: 'https://exemple.fr' });
  expect(formal.status === 200 && formal.data.business.status === 'verified' && formal.data.registryChecked === false, 'Registre désactivé : contrôle formel seulement', formal);
  await settings.updateOne({ key: 'businessRegistryCheck' }, { $set: { value: true } });
  // Entreprise hors France : numéro au registre local → contrôle manuel systématique, visible dans la file admin
  const noId = await brandApi('POST', '/auth/business-verification', { country: 'CH', website: 'https://exemple.ch' });
  expect(noId.status === 400, 'Sans aucun identifiant la demande doit être refusée', noId);
  const swiss = await brandApi('POST', '/auth/business-verification', { country: 'CH', registrationNumber: 'CHE-123.456.789', website: 'https://exemple.ch' });
  expect(swiss.status === 200 && swiss.data.business.status === 'pending' && /hors France \(CH\)/.test(swiss.data.business.note), 'Une entreprise suisse doit passer en contrôle manuel', swiss);
  const stored = await users.findOne({ email: brandEmail }, { projection: { 'profile.company': 1, 'verification.business': 1 } });
  expect(stored?.profile?.company?.country === 'CH' && stored.profile.company.registrationNumber === 'CHE-123.456.789' && stored.verification.business.status === 'pending', 'Pays et numéro d\'immatriculation doivent être enregistrés pour la file de contrôle manuel (admin)', stored);
  // Retour à une entreprise française vérifiée pour la suite du test
  const backFr = await brandApi('POST', '/auth/business-verification', { siret: '356 000 000 00048', website: 'https://exemple.fr' });
  expect(backFr.status === 200 && backFr.data.business.status === 'verified', 'Retour à la vérification française échoué', backFr);
  return `registre : ${ok.data.registry?.legalName || 'injoignable, contrôle formel'} ; désactivation admin OK ; entreprise suisse → contrôle manuel`;
});

await step('Inscription créateur (bio vide acceptée)', async () => {
  const res = await creatorApi('POST', '/auth/register/creator', {
    acceptTerms: true, email: creatorEmail, name: 'Créateur Test E2E', bio: '', niches: ['beauty', 'lifestyle'], minPrice: 100, country: 'be', language: 'fr',
  });
  expect(res.status === 201, 'Inscription créateur échouée', res);
  expect(res.data.user.profile.country === 'BE' && res.data.user.preferences.language === 'fr', 'Pays et langue devraient être enregistrés à l\'inscription', res);
  creatorUser = res.data.user;
  expect(creatorUser.status === 'pending', 'Le créateur devrait être en attente de validation', res);
  expect((creatorUser.applyBlockers || []).some(b => /administratives/i.test(b)), 'Les informations administratives devraient bloquer les devis', res);
  const li = await setLegalInfo(creatorApi, 'creator');
  return `id ${creatorUser.id}, statut ${creatorUser.status}, informations administratives ${li.data.registry ? `vérifiées au registre (${li.data.registry.legalName})` : 'enregistrées (contrôle registre désactivé)'}`;
});

await step('Profil : lecture (GET /auth/profile)', async () => {
  const res = await creatorApi('GET', '/auth/profile');
  expect(res.status === 200 && res.data.user.id, 'Profil non lisible', res);
  expect(Array.isArray(res.data.user.applyBlockers), 'applyBlockers manquant', res);
  return `complétion ${res.data.user.profileCompletion}%`;
});

await step('Profil : modification (PATCH /auth/profile)', async () => {
  const res = await creatorApi('PATCH', '/auth/profile', { profile: { bio: 'Bio mise à jour', pricing: { minPrice: 120 } } });
  expect(res.status === 200, 'Modification profil échouée', res);
  expect(res.data.user.profile.bio === 'Bio mise à jour', 'La bio n\'a pas été enregistrée', res);
  expect(res.data.user.profile.pricing.minPrice === 120, 'Le tarif n\'a pas été enregistré', res);
  return 'bio + tarif enregistrés';
});

await step('Campagne : création (brouillon)', async () => {
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const res = await brandApi('POST', '/campaigns', {
    title: 'Vidéo UGC test de bout en bout',
    description: 'Description suffisamment longue pour passer la validation de cinquante caractères minimum.',
    videoType: 'testimonial', duration: 30, deliverables: 2, requirements: ['Montrer le produit'],
    budget: 300, niches: ['beauty'], applicationDeadline: deadline,
  });
  expect(res.status === 201, 'Création campagne échouée', res);
  campaign = res.data.campaign;
  expect(campaign.status === 'draft', 'Statut attendu draft', res);
  return `id ${campaign._id}, ${campaign.budget.perVideo}€/vidéo`;
});

await step('Campagne : détail brouillon visible par la marque', async () => {
  const res = await brandApi('GET', `/campaigns/${campaign._id}`);
  expect(res.status === 200, 'Détail campagne inaccessible', res);
  return 'OK';
});

await step('Campagne : modification du brouillon (puis refus une fois publiée)', async () => {
  const res = await brandApi('PATCH', `/campaigns/${campaign._id}`, { title: 'Vidéo UGC test de bout en bout (modifiée)', budget: 400, deliverables: 2, niches: ['beauty', 'lifestyle'], creatorsWanted: 1 });
  expect(res.status === 200 && res.data.campaign.title.endsWith('(modifiée)') && res.data.campaign.budget.perVideo === 200, 'Modification du brouillon échouée', res);
  const clear = await brandApi('PATCH', `/campaigns/${campaign._id}`, { budget: null });
  expect(clear.status === 200 && !clear.data.campaign.budget?.total, 'Le budget devrait pouvoir être retiré', clear);
  const back = await brandApi('PATCH', `/campaigns/${campaign._id}`, { budget: 300, title: 'Vidéo UGC test de bout en bout' });
  expect(back.status === 200 && back.data.campaign.budget.perVideo === 150, 'Retour au budget initial échoué', back);
  const bad = await brandApi('PATCH', `/campaigns/${campaign._id}`, { title: 'court' });
  expect(bad.status === 400, 'Un titre trop court doit être refusé', bad);
  return 'titre, budget, niches modifiés ; validation active';
});

await step('Campagne : publication refusée tant que l\'entreprise n\'est pas vérifiée', async () => {
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { 'verification.business.status': 'pending' } });
  const res = await brandApi('POST', `/campaigns/${campaign._id}/publish`);
  await users.updateOne({ email: brandEmail }, { $set: { 'verification.business.status': 'verified' } });
  expect(res.status === 403 && res.data.code === 'BUSINESS_NOT_VERIFIED', 'La publication doit être bloquée sans vérification', res);
  return res.data.error;
});

await step('Campagne : publication', async () => {
  const res = await brandApi('POST', `/campaigns/${campaign._id}/publish`);
  expect(res.status === 200 && res.data.campaign.status === 'active', 'Publication échouée', res);
  const locked = await brandApi('PATCH', `/campaigns/${campaign._id}`, { title: 'Tentative après publication' });
  expect(locked.status === 400, 'Une campagne publiée ne doit plus être modifiable', locked);
  return `${res.data.notifiedCreators} créateur(s) notifié(s) ; modification verrouillée`;
});

await step('Site public : campagnes ouvertes listées sans connexion (pages indexables)', async () => {
  const list = await fetch(`${API}/campaigns/public`).then(r => r.json());
  const mine = (list.campaigns || []).find(c => String(c.id) === String(campaign._id));
  expect(mine && mine.brand?.name && mine.deliverables === 2 && !('applications' in mine && Array.isArray(mine.applications)), 'La campagne publiée doit apparaître dans la liste publique avec le nom de la marque', { status: 200, data: list });
  const one = await fetch(`${API}/campaigns/public/${campaign._id}`).then(r => r.json());
  expect(one.campaign?.open === true && one.campaign.title === campaign.title && one.campaign.brand.name, 'Détail public de la campagne incorrect', { status: 200, data: one });
  const missing = await fetch(`${API}/campaigns/public/000000000000000000000000`);
  expect(missing.status === 404, 'Une campagne inconnue doit renvoyer 404', { status: missing.status });
  return `${list.campaigns.length} campagne(s) publique(s), détail OK`;
});

await step('Candidature refusée tant que le créateur n\'est pas validé', async () => {
  const res = await creatorApi('POST', `/campaigns/${campaign._id}/apply`, { proposal: '', price: 250, estimatedDeliveryDays: 5 });
  expect(res.status === 403, 'Devrait être refusé (403)', res);
  return res.data.error;
});

await step('Admin : validation du créateur', async () => {
  // Promotion temporaire de la marque en admin pour valider le créateur
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  adminApi = brandApi;
  const pending = await adminApi('GET', '/admin/creators/pending');
  expect(pending.status === 200, 'Liste des créateurs en attente inaccessible', pending);
  const res = await adminApi('POST', `/admin/creators/${creatorUser.id}/approve`);
  expect(res.status === 200 && res.data.user.status === 'active', 'Validation créateur échouée', res);
  const stats = await adminApi('GET', '/admin/stats');
  expect(stats.status === 200, 'Stats admin inaccessibles', stats);
  await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  return `créateur actif, ${stats.data.users.creators} créateur(s) au total`;
});

await step('Créateur : réseaux sociaux et réalisations externes', async () => {
  const res = await creatorApi('PATCH', '/auth/profile', {
    socials: [
      { network: 'tiktok', url: 'https://www.tiktok.com/@e2e', handle: '@e2e', followers: 12000, avgViews: 3000 },
      { network: 'instagram', url: 'https://www.instagram.com/e2e', handle: '@e2e', followers: 8000 },
      { network: 'tiktok', url: 'pas-une-url', followers: 1 },
    ],
    realisations: [{ url: 'https://www.instagram.com/reel/xyz', title: 'Unboxing crème', brandName: 'MarqueX', platform: 'instagram' }],
  });
  expect(res.status === 200, 'Mise à jour réseaux échouée', res);
  expect(res.data.user.profile.socials.length === 2 && res.data.user.profile.stats.totalFollowers === 20000, 'Réseaux / abonnés incorrects', res);
  expect(res.data.user.profile.realisations.length === 1, 'Réalisation externe non enregistrée', res);
  return '2 réseaux (20 000 abonnés), 1 réalisation';
});

await step('Marque : invite le créateur (contourne l\'avant-première)', async () => {
  const before = await creatorApi('GET', `/campaigns/${campaign._id}`);
  expect(before.status === 403, 'Avant invitation, le créateur ne devrait pas voir la campagne', before);
  const res = await brandApi('POST', `/campaigns/${campaign._id}/invite/${creatorUser.id}`, { message: 'Votre style nous plaît !' });
  expect(res.status === 200, 'Invitation échouée', res);
  const dup = await brandApi('POST', `/campaigns/${campaign._id}/invite/${creatorUser.id}`, {});
  expect(dup.status === 400, 'Double invitation devrait être refusée', dup);
  const after = await creatorApi('GET', `/campaigns/${campaign._id}`);
  expect(after.status === 200 && after.data.campaign.invited === true, 'Le créateur invité devrait accéder à la campagne', after);
  const feed = await creatorApi('GET', '/campaigns');
  expect(feed.data.campaigns[0]?._id === campaign._id && feed.data.campaigns[0].invited, 'L\'invitation devrait être en tête du feed', feed);
  return 'invité, campagne accessible et en tête du feed';
});

let earlyCampaign;
await step('Avant-première : un créateur non ambassadeur ne voit pas encore une nouvelle campagne', async () => {
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const c = await brandApi('POST', '/campaigns', {
    title: 'Campagne avant-première test', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.',
    videoType: 'demo', duration: 30, deliverables: 1, budget: 100, niches: ['beauty'], applicationDeadline: deadline,
  });
  await brandApi('POST', `/campaigns/${c.data.campaign._id}/publish`);
  earlyCampaign = c.data.campaign;
  const res = await creatorApi('GET', '/campaigns');
  const visible = res.data.campaigns.some(x => x._id === earlyCampaign._id);
  expect(!visible, 'La campagne vient d\'être publiée : elle devrait être réservée aux Ambassadeurs pendant 24 h', res);
  const detail = await creatorApi('GET', `/campaigns/${earlyCampaign._id}`);
  expect(detail.status === 403 && /avant-première/i.test(detail.data.error), 'Le détail devrait expliquer l\'avant-première', detail);
  return 'campagne masquée, message explicatif';
});

await step('Limites nouvelle marque : 2 campagnes ouvertes max, puis coordonnées masquées dans les messages', async () => {
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const c = await brandApi('POST', '/campaigns', { title: 'Troisième campagne limite', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.', videoType: 'demo', duration: 30, deliverables: 1, budget: 100, niches: ['beauty'], applicationDeadline: deadline });
  const pub = await brandApi('POST', `/campaigns/${c.data.campaign._id}/publish`);
  expect(pub.status === 403 && pub.data.code === 'LIMIT_OPEN_CAMPAIGNS', 'La 3e campagne ouverte doit être refusée pour une nouvelle marque', pub);
  await mongoose.connection.db.collection('campaigns').deleteOne({ _id: new mongoose.Types.ObjectId(c.data.campaign._id) });
  const msg = await brandApi('POST', `/messages/campaign/${campaign._id}/creator/${creatorUser.id}`, { text: 'Écrivez-moi sur contact@marque.fr ou au 06 12 34 56 78, ou WhatsApp @marque' });
  expect(msg.status === 201 && msg.data.masked === true && !/contact@|06 12/.test(msg.data.sent.text), 'Les coordonnées devraient être masquées avant sélection', msg);
  await creatorApi('GET', `/messages/campaign/${campaign._id}`); // marque comme lu
  return `3e campagne refusée ; message masqué : « ${msg.data.sent.text.slice(0, 70)}… »`;
});

await step('Ambassadeur : vidéo soumise puis validée par l\'admin', async () => {
  const bad = await creatorApi('POST', '/auth/ambassador', { videoUrl: 'pas une url' });
  expect(bad.status === 400, 'Une URL invalide devrait être refusée', bad);
  const res = await creatorApi('POST', '/auth/ambassador', { videoUrl: 'https://www.tiktok.com/@moi/video/needcreator' });
  expect(res.status === 200 && res.data.ambassador.status === 'pending', 'Soumission échouée', res);
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  const pending = await brandApi('GET', '/admin/ambassadors/pending');
  expect(pending.status === 200 && pending.data.creators.some(c => c._id === creatorUser.id), 'Vidéo absente de la liste admin', pending);
  const todo = await brandApi('GET', '/admin/stats');
  expect(todo.status === 200 && todo.data.todo?.pendingAmbassadors >= 1 && typeof todo.data.todo.openDisputes === 'number', 'Compteurs « à traiter » (vidéos Ambassadeur en attente) attendus dans les stats admin', todo);
  // Commission Ambassadeur neutralisée (= standard) pour garder les montants du flux principal ; la réduction (8 %) est testée sur la campagne par lien
  const neutral = await brandApi('PUT', '/admin/settings/ambassadorFeePercent', { value: 10 });
  expect(neutral.status === 200, 'Réglage commission Ambassadeur (neutralisation) échoué', neutral);
  const ok = await brandApi('POST', `/admin/ambassadors/${creatorUser.id}/approve`);
  await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  expect(ok.status === 200 && ok.data.ambassador.status === 'approved', 'Validation échouée', ok);
  const profile = await creatorApi('GET', '/auth/profile');
  expect(profile.data.user.badges.includes('ambassador') && profile.data.user.level === 'new', 'Badges incorrects', profile);
  const feed = await creatorApi('GET', '/campaigns');
  const found = feed.data.campaigns.find(c => c._id === earlyCampaign._id);
  expect(found && found.earlyAccess === true, 'L\'ambassadeur devrait voir la campagne en avant-première', feed);
  return `badges : ${profile.data.user.badges.join(', ')} — campagne visible en avant-première`;
});

await step('Portfolio : upload de 3 vidéos (R2)', async () => {
  for (let i = 1; i <= 3; i++) {
    const form = new FormData();
    form.append('video', fakeVideo(`test-${i}.mp4`));
    form.append('title', `Vidéo test ${i}`);
    form.append('videoType', 'testimonial');
    const res = await creatorApi('POST', '/portfolio/upload', form, { form: true });
    expect(res.status === 201, `Upload vidéo ${i} échoué`, res);
    expect(res.data.video.videoUrl?.startsWith('http'), 'URL vidéo invalide', res);
  }
  const profile = await creatorApi('GET', '/auth/profile');
  expect(profile.data.user.profile.portfolio.length >= 3, 'Portfolio incomplet', profile);
  expect(profile.data.user.canApply === true, 'Le créateur devrait pouvoir candidater : ' + profile.data.user.applyBlockers.join(' '), profile);
  return '3 vidéos, candidature autorisée';
});

await step('Services (métiers) et portfolio multi-formats : préparation de l\'élargissement', async () => {
  const cfg = await fetch(`${API}/config/public`).then(r => r.json());
  expect(Array.isArray(cfg.services) && cfg.services.some(s => s.key === 'product_photo' && s.kind === 'image'), 'La liste des services doit être publique', { status: 200, data: cfg });
  expect(typeof cfg.publicCreatorsMinCount === 'number' && typeof cfg.publicCreatorsCount === 'number', 'Seuil et nombre de créateurs inscrits publics attendus dans la configuration publique', { status: 200, data: cfg });
  const me = await creatorApi('GET', '/auth/profile');
  expect(!me.data.user.profile.services?.length || me.data.user.profile.services.includes('ugc'), 'Sans réglage, un créateur propose la vidéo UGC', me);
  const bad = await creatorApi('PATCH', '/auth/profile', { profile: { services: ['inconnu'] } });
  expect(bad.status === 400, 'Un service inconnu doit être refusé', bad);
  const photoOnly = await creatorApi('PATCH', '/auth/profile', { profile: { services: ['product_photo'] } });
  expect(photoOnly.status === 200 && photoOnly.data.user.profile.services.join() === 'product_photo', 'Service photo non enregistré', photoOnly);
  // Photographe sans image : le portfolio vidéo ne suffit pas ; la campagne vidéo UGC n'est plus proposée ni ouverte
  const blocked = await creatorApi('GET', '/auth/profile');
  expect(blocked.data.user.canApply === false && /image/.test(blocked.data.user.applyBlockers.join(' ')), 'Un photographe doit avoir des images en portfolio', blocked);
  const feed = await creatorApi('GET', '/campaigns');
  expect(!feed.data.campaigns.some(c => c._id === campaign._id), 'Une campagne vidéo UGC ne doit pas être proposée à un photographe', feed);
  for (let i = 1; i <= 3; i++) {
    const form = new FormData();
    form.append('video', fakeImage(`photo-${i}.png`));
    form.append('title', `Photo test ${i}`);
    const up = await creatorApi('POST', '/portfolio/upload', form, { form: true });
    expect(up.status === 201 && up.data.video.kind === 'image', `Upload image ${i} échoué`, up);
  }
  const withImages = await creatorApi('GET', '/auth/profile');
  expect(withImages.data.user.canApply === true && withImages.data.user.profile.portfolio.filter(v => v.kind === 'image').length === 3, 'Trois images doivent débloquer la candidature du photographe', withImages);
  const mismatch = await creatorApi('POST', `/campaigns/${campaign._id}/apply`, { proposal: 'Photo ?', price: 250, estimatedDeliveryDays: 5 });
  expect(mismatch.status === 403 && mismatch.data.code === 'SERVICE_MISMATCH', 'Candidature refusée quand le service du lot n\'est pas proposé', mismatch);
  // Retour au profil vidéo UGC (+ photo) pour la suite du test ; les images restent au portfolio
  const back = await creatorApi('PATCH', '/auth/profile', { profile: { services: ['ugc', 'product_photo'] } });
  expect(back.status === 200 && back.data.user.canApply === true, 'Retour au service UGC échoué', back);
  // Campagne à deux lots (vidéo UGC + photo produit) : le photographe peut candidater sur le lot photo
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const two = await brandApi('POST', '/campaigns', { title: 'Lancement vidéo et photos', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.', videoType: 'demo', duration: 30, deliverables: 1, budget: 300, niches: ['beauty'], applicationDeadline: deadline, lots: [{ key: 'main', service: 'ugc', title: 'Vidéo de lancement' }, { key: 'photo', service: 'product_photo', title: 'Packshots', deliverables: 5 }] });
  expect(two.status === 201 && two.data.campaign.lots.length === 2 && two.data.campaign.lots[1].kind === 'image' && two.data.campaign.lots[1].deliverables === 5, 'Campagne à deux lots non créée', two);
  await mongoose.connection.db.collection('campaigns').deleteOne({ _id: new mongoose.Types.ObjectId(two.data.campaign._id) });
  const main = await brandApi('GET', `/campaigns/${campaign._id}`);
  expect(main.data.campaign.lots?.length === 1 && main.data.campaign.lots[0].key === 'main' && main.data.campaign.lots[0].service === 'ugc', 'Une campagne existante doit avoir un lot « main » vidéo UGC', main);
  return 'services publics, photographe bloqué puis débloqué par 3 images, lot vidéo refusé, campagne à 2 lots, lot main par défaut';
});

await step('Portfolio : lecture publique (GET /portfolio/creator/:id)', async () => {
  const res = await fetch(`${API}/portfolio/creator/${creatorUser.id}`);
  const data = await res.json();
  expect(res.status === 200 && data.creator.profile.portfolio.filter(v => (v.kind || 'video') === 'video').length === 3, 'Portfolio public illisible (3 vidéos attendues)', { status: res.status, data });
  const video = await fetch(data.creator.profile.portfolio[0].videoUrl, { headers: { Range: 'bytes=0-64' } });
  expect(video.ok, `La vidéo n'est pas lisible depuis le navigateur (HTTP ${video.status})`);
  return 'vidéos lisibles via lien signé';
});

await step('Campagnes : feed créateur (matching niches)', async () => {
  const res = await creatorApi('GET', '/campaigns');
  expect(res.status === 200, 'Feed inaccessible', res);
  const found = res.data.campaigns.find(c => c._id === campaign._id);
  expect(found, 'La campagne publiée devrait apparaître dans le feed du créateur', res);
  expect(found.matchesMyNiches === true, 'La campagne devrait être marquée comme correspondant aux niches', res);
  const first = res.data.campaigns[0];
  expect(first.matchesMyNiches !== false || !res.data.campaigns.some(c => c.matchesMyNiches), 'Les campagnes de mes niches devraient être en premier', res);
  const search = await creatorApi('GET', '/campaigns?search=bout%20en%20bout');
  expect(search.data.campaigns.some(c => c._id === campaign._id), 'La recherche par mot-clé ne trouve pas la campagne', search);
  return `${res.data.campaigns.length} campagne(s) visible(s)`;
});

await step('Candidature du créateur', async () => {
  const res = await creatorApi('POST', `/campaigns/${campaign._id}/apply`, { proposal: 'Je suis motivé !', price: 250, estimatedDeliveryDays: 5 });
  expect(res.status === 201, 'Candidature échouée', res);
  const dup = await creatorApi('POST', `/campaigns/${campaign._id}/apply`, { proposal: '', price: 250, estimatedDeliveryDays: 5 });
  expect(dup.status === 400, 'Une double candidature devrait être refusée', dup);
  const mine = await creatorApi('GET', '/campaigns?filter=applied');
  expect(mine.data.campaigns.some(c => c._id === campaign._id && c.myApplication?.status === 'pending'), '"Mes candidatures" ne liste pas la candidature', mine);
  return `match ${res.data.application.matchScore}%`;
});

await step('Créateur : modifie son devis (droits, conditions), version 2', async () => {
  const tooMany = await creatorApi('PATCH', `/campaigns/${campaign._id}/quote`, { proposal: 'Je suis motivé !', price: 260, estimatedDeliveryDays: 6, revisions: 9 });
  expect(tooMany.status === 400 && tooMany.data.code === 'REVISIONS_ABOVE_CAP', 'Un devis au-dessus du plafond de révisions (réglage admin) doit être refusé', tooMany);
  const res = await creatorApi('PATCH', `/campaigns/${campaign._id}/quote`, {
    proposal: 'Je suis motivé !', price: 260, estimatedDeliveryDays: 6,
    rights: { duration: '2y', supports: ['social_organic', 'paid_ads'], territories: 'Europe', exclusivity: true, exclusivityMonths: 3 },
    deliveryTypes: ['file', 'link'], platforms: ['tiktok'], revisions: 2, terms: 'Produit à fournir par la marque.',
  });
  expect(res.status === 200 && res.data.application.price === 260, 'Modification du devis échouée', res);
  expect(res.data.application.quote.version === 2 && res.data.application.quote.history.length === 1, 'Versionnage du devis incorrect', res);
  expect(res.data.application.quote.rights.duration === '2y', 'Droits non enregistrés', res);
  return 'devis v2 : 260€, droits 2 ans, exclusivité 3 mois';
});

await step('Messagerie : négociation du devis entre la marque et le créateur', async () => {
  const forbidden = await brandApi('POST', `/campaigns/${campaign._id}/creator/000000000000000000000000`.replace('/campaigns/', '/messages/campaign/'), { text: 'x' });
  expect(forbidden.status === 403 || forbidden.status === 404, 'Une discussion sans lien avec la campagne doit être refusée', forbidden);
  const m1 = await brandApi('POST', `/messages/campaign/${campaign._id}/creator/${creatorUser.id}`, { text: 'Bonjour, pouvez-vous descendre à 240€ ?' });
  expect(m1.status === 201, 'Envoi marque échoué', m1);
  const list = await creatorApi('GET', '/messages');
  expect(list.status === 200 && list.data.totalUnread === 1, 'Le créateur devrait avoir 1 message non lu', list);
  const conv = await creatorApi('GET', `/messages/campaign/${campaign._id}`);
  expect(conv.status === 200 && conv.data.conversation.messages.length >= 1, 'Lecture de la conversation échouée', conv);
  const after = await creatorApi('GET', '/messages/unread');
  expect(after.data.totalUnread === 0, 'La lecture devrait remettre le compteur à zéro', after);
  const m2 = await creatorApi('POST', `/messages/campaign/${campaign._id}`, { text: 'OK pour 250€ avec 2 ans de droits.' });
  expect(m2.status === 201, 'Réponse créateur échouée', m2);
  const brandList = await brandApi('GET', '/messages');
  expect(brandList.data.totalUnread === 1 && brandList.data.conversations[0].lastMessagePreview.startsWith('OK pour'), 'La marque devrait voir la réponse', brandList);
  const empty = await creatorApi('POST', `/messages/campaign/${campaign._id}`, { text: '   ' });
  expect(empty.status === 400, 'Un message vide doit être refusé', empty);
  return '2 messages échangés, compteurs non lus corrects';
});

await step('Contre-proposition : marque → créateur (refus, puis acceptation = devis mis à jour)', async () => {
  const same = await brandApi('POST', `/campaigns/${campaign._id}/applications/${creatorUser.id}/counter`, { price: 260, estimatedDeliveryDays: 6, revisions: 2 });
  expect(same.status === 400, 'Une contre-proposition identique au devis doit être refusée', same);
  const tooMany = await brandApi('POST', `/campaigns/${campaign._id}/applications/${creatorUser.id}/counter`, { price: 240, revisions: 9 });
  expect(tooMany.status === 400 && tooMany.data.code === 'REVISIONS_ABOVE_CAP', 'Révisions au-dessus du plafond refusées', tooMany);
  const c1 = await brandApi('POST', `/campaigns/${campaign._id}/applications/${creatorUser.id}/counter`, { price: 230, estimatedDeliveryDays: 5, message: 'Budget serré ce mois-ci' });
  expect(c1.status === 200 && c1.data.application.counterOffer.status === 'pending' && c1.data.application.price === 260, 'Contre-proposition non enregistrée ou devis modifié trop tôt', c1);
  const seen = await creatorApi('GET', `/campaigns/${campaign._id}`);
  expect(seen.data.campaign.myApplication?.counterOffer?.price === 230, 'Le créateur devrait voir la contre-proposition', seen);
  const bell = await creatorApi('GET', '/notifications');
  expect(bell.status === 200 && bell.data.notifications.some(n => /Contre-proposition/.test(n.title)), 'Notification de contre-proposition absente', bell);
  const no = await creatorApi('POST', `/campaigns/${campaign._id}/counter/respond`, { accept: false });
  expect(no.status === 200 && no.data.application.counterOffer.status === 'declined' && no.data.application.price === 260, 'Le refus doit laisser le devis intact', no);
  const again = await creatorApi('POST', `/campaigns/${campaign._id}/counter/respond`, { accept: true });
  expect(again.status === 400, 'Pas de réponse possible sans contre-proposition en attente', again);
  const c2 = await brandApi('POST', `/campaigns/${campaign._id}/applications/${creatorUser.id}/counter`, { price: 250, estimatedDeliveryDays: 5, revisions: 1 });
  expect(c2.status === 200, 'Seconde contre-proposition échouée', c2);
  const yes = await creatorApi('POST', `/campaigns/${campaign._id}/counter/respond`, { accept: true });
  expect(yes.status === 200 && yes.data.application.price === 250 && yes.data.application.estimatedDeliveryDays === 5 && yes.data.application.quote.revisions === 1, 'L\'acceptation doit mettre le devis à jour', yes);
  expect(yes.data.application.quote.version === 3 && yes.data.application.quote.history.length === 2, 'Le devis accepté doit être versionné', yes);
  expect(yes.data.application.quote.rights.duration === '2y', 'Les droits du devis ne doivent pas changer', yes);
  const brandView = await brandApi('GET', `/campaigns/${campaign._id}`);
  expect(brandView.data.campaign.applications[0].counterOffer.status === 'accepted', 'Statut accepté invisible côté marque', brandView);
  const unknown = await brandApi('POST', `/campaigns/${campaign._id}/applications/000000000000000000000000/counter`, { price: 100 });
  expect(unknown.status === 404, 'Candidature inconnue → 404', unknown);
  // Nouvelle contre-proposition, puis le créateur renvoie un devis : la contre-proposition est remplacée (et le devis revient à 260 € pour la suite du test)
  const c3 = await brandApi('POST', `/campaigns/${campaign._id}/applications/${creatorUser.id}/counter`, { price: 240 });
  expect(c3.status === 200, 'Troisième contre-proposition échouée', c3);
  const back = await creatorApi('PATCH', `/campaigns/${campaign._id}/quote`, {
    proposal: 'Je suis motivé !', price: 260, estimatedDeliveryDays: 6,
    rights: { duration: '2y', supports: ['social_organic', 'paid_ads'], territories: 'Europe', exclusivity: true, exclusivityMonths: 3 },
    deliveryTypes: ['file', 'link'], platforms: ['tiktok'], revisions: 2, terms: 'Produit à fournir par la marque.',
  });
  expect(back.status === 200 && back.data.application.price === 260 && back.data.application.counterOffer.status === 'superseded', 'Un nouveau devis doit remplacer la contre-proposition en attente', back);
  return 'refus, acceptation (260€ → 250€, 1 révision, v3), puis nouveau devis 260€ qui remplace une 3e contre-proposition';
});

await step('Marque : voit la candidature (score de matching)', async () => {
  const res = await brandApi('GET', `/campaigns/${campaign._id}`);
  expect(res.status === 200 && res.data.campaign.applications?.length === 1, 'Candidature invisible côté marque', res);
  const app = res.data.campaign.applications[0];
  expect(app.lotKey === 'main', 'La candidature doit porter le lot « main »', res);
  expect(app.creatorId?.profile?.name, 'Profil du candidat non peuplé', res);
  expect(app.quote?.terms === 'Produit à fournir par la marque.', 'Le devis devrait être visible par la marque', res);
  return `${app.creatorId.profile.name} — ${app.price}€ — match ${app.matchScore}%`;
});

await step('Marque : sélection du créateur (+ livraison + paiement Stripe test)', async () => {
  const res = await brandApi('POST', `/campaigns/${campaign._id}/select/${creatorUser.id}`);
  expect(res.status === 200, 'Sélection échouée', res);
  expect(res.data.delivery?.lotKey === 'main', 'La livraison doit porter le lot « main »', res);
  expect(res.data.campaign.status === 'in_progress', 'Statut attendu in_progress', res);
  expect(res.data.delivery, 'La livraison aurait dû être créée automatiquement', res);
  delivery = res.data.delivery;
  expect(!res.data.warning, 'Avertissement paiement : ' + res.data.warning, res);
  expect(res.data.paymentRequired === true && res.data.clientSecret, 'L\'écran de paiement devrait être demandé', res);
  expect(delivery.payment.status === 'pending', 'Le paiement devrait être en attente de la carte', res);
  expect(delivery.payment.amount === 260, 'Le montant doit être celui du devis accepté (260€)', res);
  const camp = await brandApi('GET', `/campaigns/${campaign._id}`);
  expect(camp.data.campaign.applications[0].quote.acceptedAt, 'Le devis devrait être marqué accepté', camp);
  return `livraison ${delivery._id}, ${delivery.payment.amount}€ à confirmer par carte`;
});

await step('Contrat de mission généré à l\'acceptation du devis (PDF, parties, droits)', async () => {
  const c = await brandApi('GET', `/deliveries/${delivery._id}/contract`);
  expect(c.status === 200 && /^NC-\d{4}-[A-F0-9]{6}$/.test(c.data.contract.number), 'Numéro de contrat invalide', c);
  expect(c.data.contract.url?.startsWith('http') && c.data.contract.url.includes('.pdf'), 'Lien PDF du contrat manquant', c);
  const pdf = await fetch(c.data.contract.url);
  const head = Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString();
  expect(pdf.ok && head === '%PDF-', `Le contrat ne se télécharge pas (HTTP ${pdf.status}, en-tête ${head})`, { status: pdf.status, data: null });
  const parties = c.data.contract.parties;
  expect(parties.brand.signatoryName === 'Jean Test' && parties.creator.name === 'Camille Test' && parties.creator.siret === '35600000000048', 'Parties du contrat incorrectes', c);
  expect(c.data.contract.rights?.duration && !c.data.contract.rightsEndAt, 'Les droits ne doivent pas courir avant la validation', c);
  expect(c.data.contract.mission?.brief?.description && Array.isArray(c.data.contract.mission.brief.requirements), 'Le brief devrait être annexé au contrat', c);
  const asCreator = await creatorApi('GET', `/deliveries/${delivery._id}/contract`);
  expect(asCreator.status === 200, 'Le créateur doit accéder au contrat', asCreator);
  // Garde-fou : sans signataire, une marque ne peut pas accepter de devis
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $unset: { legalInfo: '' } });
  const blocked = await brandApi('POST', `/campaigns/${campaign._id}/select/${creatorUser.id}`);
  expect(blocked.status === 403 && blocked.data.code === 'LEGAL_INFO_REQUIRED', 'La sélection devrait être refusée sans signataire', blocked);
  await setLegalInfo(brandApi, 'brand');
  return `${c.data.contract.number} (${Buffer.byteLength(head)} o lus, PDF valide)`;
});

await step('Marque : approbation refusée tant que la carte n\'est pas saisie', async () => {
  const res = await brandApi('POST', `/deliveries/${delivery._id}/approve`);
  expect(res.status === 400, 'Devrait refuser sans paiement confirmé', res);
  return res.data.error;
});

await step('Marque : saisie de carte (simulée) + confirmation du paiement', async () => {
  const pi = await brandApi('GET', `/deliveries/${delivery._id}/payment-intent`);
  expect(pi.status === 200 && pi.data.clientSecret, 'Client secret indisponible', pi);
  // Simule ce que fait l'écran Stripe dans le navigateur avec une carte de test
  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  await stripe.paymentIntents.confirm(delivery.payment.stripePaymentIntentId, { payment_method: 'pm_card_visa' });
  const res = await brandApi('POST', `/deliveries/${delivery._id}/confirm-payment`, {});
  expect(res.status === 200 && res.data.paymentStatus === 'held', 'Confirmation échouée', res);
  return `${delivery.payment.amount}€ bloqués (commission ${delivery.payment.platformFee}€)`;
});

await step('Créateur : livraison par lien + règle du nombre de vidéos (2 attendues)', async () => {
  const add = await creatorApi('POST', `/deliveries/${delivery._id}/links`, { links: [{ url: 'https://www.tiktok.com/@test/video/1', title: 'Vidéo TikTok' }] });
  expect(add.status === 200 && add.data.links.length === 1 && add.data.links[0].platform === 'tiktok', 'Ajout de lien échoué', add);
  const tooMany = await creatorApi('POST', `/deliveries/${delivery._id}/links`, { links: [{ url: 'https://youtu.be/a' }, { url: 'https://youtu.be/b' }] });
  expect(tooMany.status === 400, 'Dépasser le nombre de vidéos attendu devrait être refusé', tooMany);
  const rm = await creatorApi('DELETE', `/deliveries/${delivery._id}/items/${add.data.links[0]._id}`);
  expect(rm.status === 200 && rm.data.delivery.links.length === 0, 'Suppression du lien échouée', rm);
  return 'lien ajouté, dépassement refusé, suppression OK';
});

await step('Créateur : voit sa mission dans "Mes livraisons"', async () => {
  const res = await creatorApi('GET', '/deliveries');
  expect(res.status === 200 && res.data.deliveries.some(d => d._id === delivery._id), 'Livraison invisible côté créateur', res);
  const detail = await creatorApi('GET', `/deliveries/${delivery._id}`);
  expect(detail.status === 200 && detail.data.delivery.campaignId?.brief, 'Le brief complet devrait être accessible', detail);
  return 'brief accessible';
});

await step('Créateur : soumission refusée sans fichier', async () => {
  const res = await creatorApi('POST', `/deliveries/${delivery._id}/submit`, { notes: '' });
  expect(res.status === 400, 'Devrait refuser sans fichier', res);
  return res.data.error;
});

await step('Créateur : upload des livrables', async () => {
  const form = new FormData();
  form.append('files', fakeVideo('livrable-1.mp4'));
  form.append('files', fakeVideo('livrable-2.mp4'));
  const res = await creatorApi('POST', `/deliveries/${delivery._id}/upload`, form, { form: true });
  expect(res.status === 200 && res.data.files.length === 2, 'Upload livrables échoué', res);
  expect(res.data.files[0].type === 'video', 'Type de fichier non détecté', res);
  return '2 fichiers';
});

await step('Créateur : soumission de la livraison (timer 7 jours)', async () => {
  const res = await creatorApi('POST', `/deliveries/${delivery._id}/submit`, { notes: 'Voici les vidéos' });
  expect(res.status === 200 && res.data.delivery.status === 'submitted', 'Soumission échouée', res);
  expect(res.data.delivery.autoApprovalDate, 'Date d\'auto-approbation absente', res);
  return `auto-approbation le ${res.data.delivery.autoApprovalDate.slice(0, 10)}`;
});

await step('Marque : demande de révision (feedback obligatoire)', async () => {
  const short = await brandApi('POST', `/deliveries/${delivery._id}/revision`, { feedback: 'trop court' });
  expect(short.status === 400, 'Un feedback trop court devrait être refusé', short);
  const res = await brandApi('POST', `/deliveries/${delivery._id}/revision`, { feedback: 'Merci de refaire la première vidéo avec un meilleur éclairage.' });
  expect(res.status === 200 && res.data.delivery.status === 'revision_requested', 'Demande de révision échouée', res);
  return 'révision 1/2 demandée';
});

await step('Réglages publics : GET /config/public sans authentification', async () => {
  const res = await fetch(`${API}/config/public`);
  const data = await res.json();
  expect(res.status === 200 && data.maxRevisions === 2 && data.autoApprovalDays >= 1 && data.minQuotePrice >= 1, 'Les réglages publics devraient être exposés (maxRevisions, autoApprovalDays, minQuotePrice)', { status: res.status, data });
  return `révisions ${data.maxRevisions}, validation auto ${data.autoApprovalDays} j, devis min ${data.minQuotePrice} €`;
});

await step('Admin : réglages numériques (relances, révisions) + relance « révision sans réponse »', async () => {
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  try {
    const list = await brandApi('GET', '/admin/settings');
    const maxRev = list.data.settings.find(s => s.key === 'maxRevisions');
    expect(list.status === 200 && maxRev && maxRev.type === 'number' && maxRev.value === 2 && maxRev.group, 'Le réglage maxRevisions devrait être exposé comme nombre', list);
    const bad = await brandApi('PUT', '/admin/settings/maxRevisions', { value: 99 });
    expect(bad.status === 400, 'Une valeur hors bornes devrait être refusée', bad);
    const ok = await brandApi('PUT', '/admin/settings/reminderRevisionPendingDays', { value: '1' });
    expect(ok.status === 200 && ok.data.value === 1, 'Le réglage devrait être enregistré comme nombre', ok);
    const d = await brandApi('GET', `/deliveries/${delivery._id}`);
    expect(d.status === 200 && d.data.delivery.maxRevisions === 2 && d.data.delivery.canRequestRevision === false, 'La livraison devrait exposer maxRevisions et canRequestRevision (false en révision)', d);
    // Révision demandée il y a 2 jours → relance au créateur ; refus automatique désactivé (0) → la mission reste ouverte
    const deliveries = mongoose.connection.db.collection('deliveries');
    await deliveries.updateOne({ _id: new mongoose.Types.ObjectId(delivery._id) }, { $set: { 'revisions.0.requestedAt': new Date(Date.now() - 2 * 86400000) } });
    const jobs = await brandApi('POST', '/admin/jobs/run');
    expect(jobs.status === 200 && jobs.data.followUps && jobs.data.followUps.revision >= 1 && jobs.data.followUps.autoRejected === 0, 'La relance « révision sans réponse » devrait être envoyée, sans refus automatique', jobs);
    const again = await brandApi('POST', '/admin/jobs/run');
    expect(again.data.followUps.revision === 0, 'La relance ne doit partir qu\'une fois', again);
    const still = await creatorApi('GET', `/deliveries/${delivery._id}`);
    expect(still.data.delivery.status === 'revision_requested' && still.data.delivery.reminders?.revisionAt, 'La mission devrait rester en révision, relance datée', still);
    await brandApi('PUT', '/admin/settings/reminderRevisionPendingDays', { value: 3 });
    return 'réglages validés et bornés, relance envoyée une seule fois';
  } finally {
    await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  }
});

await step('Créateur : nouvelle version + re-soumission', async () => {
  const form = new FormData();
  form.append('files', fakeVideo('livrable-1-v2.mp4'));
  const up = await creatorApi('POST', `/deliveries/${delivery._id}/upload`, form, { form: true });
  expect(up.status === 200, 'Upload révision échoué', up);
  const res = await creatorApi('POST', `/deliveries/${delivery._id}/submit`, {});
  expect(res.status === 200 && res.data.delivery.status === 'submitted', 'Re-soumission échouée', res);
  expect(res.data.delivery.revisions[0].resolvedAt, 'La révision devrait être marquée résolue', res);
  expect(res.data.delivery.files.filter(f => f.superseded).length === 2 && res.data.delivery.files.filter(f => !f.superseded).length === 1, 'Les anciennes versions devraient être marquées remplacées', res);
  return 'révision résolue, anciennes versions conservées comme historique';
});

await step('Notifications : cloche du créateur (liste, non lues, marquage lu)', async () => {
  const list = await creatorApi('GET', '/notifications');
  expect(list.status === 200 && Array.isArray(list.data.notifications) && list.data.unread >= 1 && list.data.notifications.some(n => n.type === 'revision'), 'Le créateur devrait avoir des notifications non lues (révision demandée)', list);
  const read = await creatorApi('POST', '/notifications/read', {});
  expect(read.status === 200 && read.data.updated >= 1, 'Le marquage lu devrait mettre à jour des notifications', read);
  const after = await creatorApi('GET', '/notifications');
  expect(after.data.unread === 0, 'Plus aucune notification non lue attendue', after);
  return `${list.data.notifications.length} notification(s), ${read.data.updated} marquée(s) lue(s)`;
});

await step('Litige : refus définitif par la marque (révisions épuisées), réponse du créateur, arbitrage admin', async () => {
  const users = mongoose.connection.db.collection('users');
  const tooEarly = await brandApi('POST', `/deliveries/${delivery._id}/dispute`, { reason: 'Les vidéos ne correspondent pas au brief : produit absent.' });
  expect(tooEarly.status === 400 && tooEarly.data.code === 'REVISIONS_REMAINING', 'Le refus définitif doit être refusé tant que des révisions restent', tooEarly);
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  try {
    await brandApi('PUT', '/admin/settings/maxRevisions', { value: 1 }); // plafond 1 → la révision déjà faite épuise le devis
    const det = await brandApi('GET', `/deliveries/${delivery._id}`);
    expect(det.data.delivery.maxRevisions === 1 && det.data.delivery.canDispute === true && det.data.delivery.canRequestRevision === false, 'Le refus définitif devrait être possible', det);
  } finally {
    await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  }
  const open = await brandApi('POST', `/deliveries/${delivery._id}/dispute`, { reason: 'Les vidéos ne correspondent pas au brief : le produit n\'apparaît pas à l\'écran.' });
  expect(open.status === 200 && open.data.delivery.status === 'disputed' && open.data.delivery.dispute.status === 'open' && !open.data.delivery.autoApprovalDate, 'Ouverture du litige échouée (validation automatique suspendue attendue)', open);
  const resp = await creatorApi('POST', `/deliveries/${delivery._id}/dispute/respond`, { response: 'Le produit est visible à 0:12 et 0:40, conformément au brief.' });
  expect(resp.status === 200 && resp.data.delivery.dispute.creatorResponse, 'Réponse du créateur non enregistrée', resp);
  const again = await creatorApi('POST', `/deliveries/${delivery._id}/dispute/respond`, { response: 'Deuxième réponse interdite.' });
  expect(again.status === 400, 'Une seule réponse par litige', again);
  const notif = await brandApi('GET', '/notifications');
  expect(notif.data.notifications.some(n => n.type === 'dispute'), 'La marque devrait être notifiée de la réponse', notif);
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  try {
    const jobs = await brandApi('POST', '/admin/jobs/run');
    expect(jobs.data.autoApprovals === 0, 'Aucune validation automatique pendant un litige', jobs);
    const list = await brandApi('GET', '/admin/disputes');
    expect(list.status === 200 && list.data.disputes.some(d => d._id === delivery._id) && list.data.defaultCreatorPercent >= 0, 'Le litige devrait être listé pour l\'admin', list);
    const bad = await brandApi('POST', `/admin/disputes/${delivery._id}/resolve`, { outcome: 'split', note: 'Sans pourcentage' });
    expect(bad.status === 400, 'Un partage sans pourcentage doit être refusé', bad);
    const res = await brandApi('POST', `/admin/disputes/${delivery._id}/resolve`, { outcome: 'approve', note: 'Le produit est bien visible, la livraison respecte le brief.' });
    expect(res.status === 200 && res.data.delivery.status === 'approved' && res.data.delivery.dispute.status === 'resolved' && res.data.delivery.dispute.outcome === 'approve', 'Arbitrage « paiement intégral » échoué', res);
    await brandApi('PUT', '/admin/settings/maxRevisions', { value: 2 });
  } finally {
    await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  }
  return 'litige ouvert, réponse unique, validation auto suspendue, tranché en paiement intégral';
});

await step('Marque : approbation (encaissement Stripe)', async () => {
  const before = await brandApi('GET', `/deliveries/${delivery._id}`);
  const res = before.data.delivery.status === 'approved' ? { status: 200, data: { delivery: before.data.delivery, warning: 'déjà approuvée par arbitrage' } } : await brandApi('POST', `/deliveries/${delivery._id}/approve`);
  expect(res.status === 200 && res.data.delivery.status === 'approved', 'Approbation échouée', res);
  const camp = await brandApi('GET', `/campaigns/${campaign._id}`);
  expect(camp.data.campaign.status === 'completed', 'La campagne devrait être terminée', camp);
  const profile = await creatorApi('GET', '/auth/profile');
  expect(profile.data.user.profile.stats.completedJobs >= 1, 'completedJobs devrait être incrémenté', profile);
  return `paiement ${res.data.delivery.payment.status}${res.data.warning ? ' — ' + res.data.warning : ''}`;
});

await step('Reconduire avec ce créateur : campagne privée pré-remplie, remise fidélité financée par NeedCreator', async () => {
  const notYet = await brandApi('POST', `/campaigns/${campaign._id}/renew/000000000000000000000000`);
  expect(notYet.status === 400, 'Reconduction refusée sans mission validée avec ce créateur', notYet);
  const r = await brandApi('POST', `/campaigns/${campaign._id}/renew/${creatorUser.id}`);
  expect(r.status === 201 && r.data.campaign.status === 'draft' && r.data.campaign.visibility === 'private' && r.data.campaign.renewal?.lastQuote?.price === 260, 'Reconduction : brouillon privé avec dernier devis attendu', r);
  expect(r.data.discountPercent === 3 && r.data.campaign.brandDiscountPercent === 3 && r.data.campaign.invitations?.length === 1, 'Remise fidélité (3 %) et invitation du créateur attendues', r);
  const rid = r.data.campaign._id;
  const hidden = await creatorApi('GET', `/campaigns/${rid}`);
  expect(hidden.status === 403, 'Un brouillon de reconduction reste invisible au créateur', hidden);
  const pub = await brandApi('POST', `/campaigns/${rid}/publish`);
  expect(pub.status === 200 && pub.data.notifiedCreators === 0, 'Publication privée : aucune notification de masse', pub);
  const bell = await creatorApi('GET', '/notifications');
  expect(bell.data.notifications.some(n => /nouvelle mission/.test(n.title)), 'Le créateur doit être prévenu de la reconduction à la publication', bell);
  const seen = await creatorApi('GET', `/campaigns/${rid}`);
  expect(seen.status === 200 && seen.data.campaign.invited === true && seen.data.campaign.renewalQuote?.price === 260 && seen.data.campaign.renewalQuote.rights?.duration === '2y', 'Le créateur doit voir son dernier devis pré-rempli', seen);
  const ap = await creatorApi('POST', `/campaigns/${rid}/apply`, { proposal: 'Avec plaisir', price: 260, estimatedDeliveryDays: 6, rights: seen.data.campaign.renewalQuote.rights, deliveryTypes: ['file'], revisions: 2 });
  expect(ap.status === 201, 'Candidature sur la reconduction échouée', ap);
  const sel = await brandApi('POST', `/campaigns/${rid}/select/${creatorUser.id}`);
  expect(sel.status === 200 && sel.data.delivery.payment.discountPercent === 3 && sel.data.delivery.payment.amount === 252.2 && sel.data.delivery.payment.creatorAmount === 234, 'Remise fidélité : marque 252,20 €, créateur 234 € (inchangé)', sel);
  return 'brouillon privé → publié → devis pré-rempli → sélection : marque 252,20 € au lieu de 260, créateur 234 €';
});

await step('Contenus & droits : missions synchronisées, contenu extérieur, utilisations, relance, import, export, rappels', async () => {
  const list = await brandApi('GET', '/contents');
  expect(list.status === 200 && list.data.summary.total >= 1, 'Le registre doit contenir les contenus de la mission validée', list);
  const fromMission = list.data.contents.find(c => c.source === 'needcreator');
  expect(fromMission && fromMission.creator?.name && fromMission.rights?.supports?.includes('paid_ads') && fromMission.rights?.territories === 'Europe' && fromMission.documents?.some(d => /Contrat/.test(d.label)), 'Contenu NeedCreator : droits du contrat et contrat en document attendus', list);
  const locked = await brandApi('PATCH', `/contents/${fromMission._id}`, { title: 'Titre modifié', price: 1 });
  expect(locked.status === 200 && locked.data.content.title === 'Titre modifié' && locked.data.content.price !== 1, 'Sur un contenu NeedCreator, le titre est modifiable mais pas le prix', locked);
  const noDel = await brandApi('DELETE', `/contents/${fromMission._id}`);
  expect(noDel.status === 400, 'Un contenu NeedCreator ne se retire pas du registre', noDel);
  const endAt = new Date(Date.now() + 20 * 86400000).toISOString();
  const ext = await brandApi('POST', '/contents', { title: 'Vidéo agence printemps', kind: 'video', url: 'https://drive.example.com/v1', creator: { name: 'Léa Externe', email: `e2e-ext-creator-${RUN}@needcreator-test.com`, platform: 'Agence Soleil' }, contractType: 'licence', rights: { startAt: new Date().toISOString(), endAt, supports: ['social_organic', 'paid_ads'], territories: 'France', exclusivity: false }, price: 400, documents: [{ label: 'Contrat', url: 'https://drive.example.com/contrat.pdf' }] });
  expect(ext.status === 201 && ext.data.content.status === 'expiring' && ext.data.content.daysLeft <= 20, 'Contenu extérieur : statut « expire sous 30 j » attendu', ext);
  const noTitle = await brandApi('POST', '/contents', { kind: 'video' });
  expect(noTitle.status === 400, 'Le titre est obligatoire', noTitle);
  const use = await brandApi('POST', `/contents/${ext.data.content._id}/usages`, { channel: 'product_page', url: 'https://boutique.example.com/p/1' });
  expect(use.status === 200 && use.data.content.usages.length === 1, 'Utilisation non ajoutée', use);
  const badUse = await brandApi('POST', `/contents/${ext.data.content._id}/usages`, { channel: 'metaverse' });
  expect(badUse.status === 400, 'Canal inconnu refusé', badUse);
  const renew = await brandApi('POST', `/contents/${ext.data.content._id}/renew`, { message: 'Un an de plus ?' });
  expect(renew.status === 200 && renew.data.content.renewal?.requestedAt, 'Relance du créateur extérieur : date de demande attendue', renew);
  const renewNc = await brandApi('POST', `/contents/${fromMission._id}/renew`);
  expect(renewNc.status === 200 && /deliveries\//.test(renewNc.data.href), 'Contenu NeedCreator : renvoi vers la prolongation de la mission', renewNc);
  const csv = ['Titre;Créateur;Email;Type de contrat;Début;Fin;Supports;Territoire;Prix;Lien;Produit', 'Photo packshot;Marc Photo;marc@example.com;cession;2026-01-10;2027-01-10;site web, publicité;Europe;250;https://drive.example.com/p;Gamme été', ';sans titre;;;;;;;;;'].join('\n');
  const fd = new FormData(); fd.append('file', new File([csv], 'contenus.csv', { type: 'text/csv' }));
  const imp = await brandApi('POST', '/contents/import', fd, { form: true });
  expect(imp.status === 200 && imp.data.created === 1 && imp.data.skipped === 1, 'Import CSV : 1 créé, 1 ignoré', imp);
  const after = await brandApi('GET', '/contents');
  const imported = after.data.contents.find(c => c.title === 'Photo packshot');
  expect(imported && imported.rights.supports.includes('website') && imported.rights.supports.includes('paid_ads') && imported.price === 250 && imported.status === 'active', 'Contenu importé incomplet : ' + JSON.stringify({ rights: imported?.rights, price: imported?.price, status: imported?.status }), { status: 200, data: {} });
  const exp = await fetch(`${API}/contents/export`, { headers: { Authorization: `Bearer ${brand.idToken}` } });
  const body = await exp.text();
  expect(exp.status === 200 && /Vidéo agence printemps/.test(body) && /Photo packshot/.test(body), 'Export CSV incomplet', { status: exp.status, data: body.slice(0, 200) });
  // Rappel d'expiration (30 jours) par les tâches planifiées, puis pas de doublon
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  const jobs = await brandApi('POST', '/admin/jobs/run');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  expect(jobs.status === 200 && jobs.data.contentReminders >= 1, 'Le rappel d\'expiration du contenu extérieur devrait partir', jobs);
  const reminded = await brandApi('GET', '/contents');
  expect(reminded.data.contents.find(c => c._id === ext.data.content._id)?.renewal?.reminded30At, 'reminded30At attendu', reminded);
  const filtered = await brandApi('GET', '/contents?status=expiring');
  expect(filtered.data.contents.every(c => c.status === 'expiring') && filtered.data.contents.length >= 1, 'Filtre par statut', filtered);
  const del = await brandApi('DELETE', `/contents/${ext.data.content._id}`);
  expect(del.status === 200, 'Suppression d\'un contenu extérieur', del);
  await mongoose.connection.db.collection('contents').deleteMany({ brandId: new mongoose.Types.ObjectId(brandUser.id) });
  return `${list.data.summary.total} contenu(s) synchronisé(s), extérieur + usages + relance + import + export + rappel OK`;
});

await step('Devis pour un client hors plateforme : PDF, envoi, page publique, refus, acceptation avec paiement via NeedCreator, payé en direct', async () => {
  const users = mongoose.connection.db.collection('users');
  const base = { client: { companyName: 'Boutique Externe', contactName: 'Claire Externe', email: `e2e-client-${RUN}@needcreator-test.com` }, title: 'Deux vidéos témoignage sérum', description: 'Convenu par téléphone : deux vidéos verticales, produit envoyé.', videoType: 'testimonial', deliverables: 2, duration: 30, platforms: ['tiktok'], price: 300, estimatedDeliveryDays: 10, revisions: 1, rights: { duration: '1y', supports: ['social_organic', 'paid_ads'], territories: 'France', exclusivity: false }, terms: 'Produit à fournir.' };
  const tooCheap = await creatorApi('POST', '/external-quotes', { ...base, price: 1 });
  expect(tooCheap.status === 400 || tooCheap.status === 201, 'Prix sous le minimum refusé (ou accepté si minimum = 1 en dev)', tooCheap);
  if (tooCheap.status === 201) await creatorApi('DELETE', `/external-quotes/${tooCheap.data.quote._id}`);
  const q1 = await creatorApi('POST', '/external-quotes', base);
  expect(q1.status === 201 && q1.data.quote.status === 'draft' && q1.data.quote.pdf?.quoteUrl && q1.data.quote.pdf?.contractUrl && /^DV-/.test(q1.data.quote.pdf.number) && /\/q\//.test(q1.data.quote.link), 'Devis et projet de contrat PDF attendus', q1);
  const pdfHead = await fetch(q1.data.quote.pdf.quoteUrl, { headers: { Range: 'bytes=0-4' } });
  expect(pdfHead.status === 200 || pdfHead.status === 206, 'Le PDF du devis doit être téléchargeable', { status: pdfHead.status });
  const list = await creatorApi('GET', '/external-quotes');
  expect(list.status === 200 && list.data.quotes.some(q => q._id === q1.data.quote._id), 'Le devis doit être listé', list);
  // Modification du brouillon : PDF régénérés, même numéro et même lien
  const edited = await creatorApi('PATCH', `/external-quotes/${q1.data.quote._id}`, { ...base, price: 320, deliverables: 3 });
  expect(edited.status === 200 && edited.data.quote.quote.price === 320 && edited.data.quote.mission.deliverables === 3 && edited.data.quote.pdf.number === q1.data.quote.pdf.number && edited.data.quote.token === q1.data.quote.token, 'Modification du brouillon échouée', edited);
  const badEdit = await creatorApi('PATCH', `/external-quotes/${q1.data.quote._id}`, { ...base, price: 0 });
  expect(badEdit.status === 400, 'Prix invalide refusé à la modification', badEdit);
  const sent = await creatorApi('POST', `/external-quotes/${q1.data.quote._id}/send`, { message: 'Comme convenu.' });
  expect(sent.status === 200 && sent.data.quote.status === 'sent', 'Envoi du devis échoué', sent);
  const token = q1.data.quote.token;
  const pub = await fetch(`${API}/external-quotes/public/${token}`).then(r => r.json());
  expect(pub.quote?.status === 'sent' && pub.quote.creator?.name && pub.quote.quote.price === 320 && !pub.quote.creatorId && !JSON.stringify(pub).includes('legalInfo'), 'Vue publique du devis sans données sensibles', { status: 200, data: pub });
  // Refus par le client
  const q2 = await creatorApi('POST', '/external-quotes', { ...base, title: 'Devis à décliner' });
  const dec = await fetch(`${API}/external-quotes/public/${q2.data.quote.token}/decline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Budget épuisé' }) });
  expect(dec.status === 200, 'Refus public échoué', { status: dec.status });
  const q2after = await creatorApi('GET', '/external-quotes');
  expect(q2after.data.quotes.find(q => q._id === q2.data.quote._id)?.status === 'declined', 'Le devis décliné doit l\'être', q2after);
  // Acceptation par un nouveau client : inscription marque avec le jeton → mission créée, paiement demandé
  const clientEmail = base.client.email;
  const fu = await firebaseUser(clientEmail);
  const clientApi = client(fu.idToken);
  const reg = await clientApi('POST', '/auth/register/brand', { acceptTerms: true, email: clientEmail, companyName: 'Boutique Externe', country: 'FR', language: 'fr', quoteToken: token });
  expect(reg.status === 201 && reg.data.quoteDeliveryId, 'L\'inscription avec le jeton du devis doit créer la mission', reg);
  extraCleanup.push({ userId: reg.data.user.id, uid: fu.uid });
  const d = await clientApi('GET', `/deliveries/${reg.data.quoteDeliveryId}`);
  expect(d.status === 200 && d.data.delivery.payment.amount === 320 && d.data.delivery.payment.platformFeePercent === 10 && d.data.delivery.payment.creatorAmount === 288 && d.data.delivery.contract?.url, 'Mission issue du devis : 320 € bloqués, commission 10 %, contrat généré', d);
  const camp = await clientApi('GET', `/campaigns/${d.data.delivery.campaignId._id || d.data.delivery.campaignId}`);
  expect(camp.status === 200 && camp.data.campaign.visibility === 'private' && camp.data.campaign.externalQuoteId, 'Campagne privée liée au devis attendue', camp);
  const q1after = await creatorApi('GET', '/external-quotes');
  const acc = q1after.data.quotes.find(q => q._id === q1.data.quote._id);
  expect(acc.status === 'accepted_needcreator' && String(acc.deliveryId) === String(reg.data.quoteDeliveryId), 'Le devis doit être marqué accepté via NeedCreator', q1after);
  const again = await fetch(`${API}/external-quotes/public/${token}/decline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  expect(again.status === 400, 'Un devis accepté ne se décline plus', { status: again.status });
  // Acceptation par une marque déjà inscrite (connectée)
  const q3 = await creatorApi('POST', '/external-quotes', { ...base, title: 'Devis pour une marque existante', price: 200 });
  const accExisting = await brandApi('POST', `/external-quotes/public/${q3.data.quote.token}/accept`);
  expect(accExisting.status === 200 && accExisting.data.deliveryId, 'Acceptation par une marque connectée échouée', accExisting);
  const lockedEdit = await creatorApi('PATCH', `/external-quotes/${q3.data.quote._id}`, { ...base });
  expect(lockedEdit.status === 400, 'Un devis accepté ne se modifie plus', lockedEdit);
  // Payé en direct : pas de mission, pas de commission
  const q4 = await creatorApi('POST', '/external-quotes', { ...base, title: 'Devis payé en direct', price: 150 });
  const direct = await creatorApi('POST', `/external-quotes/${q4.data.quote._id}/direct`);
  expect(direct.status === 200 && direct.data.quote.status === 'accepted_direct' && !direct.data.quote.deliveryId, 'Marquage payé en direct échoué', direct);
  const noDel = await creatorApi('DELETE', `/external-quotes/${q1.data.quote._id}`);
  expect(noDel.status === 400, 'Un devis converti en mission ne se supprime pas', noDel);
  // Nettoyage : mission et campagne du client, devis
  const db = mongoose.connection.db;
  const clientId = new mongoose.Types.ObjectId(reg.data.user.id);
  const cc = await db.collection('campaigns').find({ brandId: clientId }).project({ _id: 1 }).toArray();
  await db.collection('deliveries').deleteMany({ campaignId: { $in: cc.map(c => c._id) } });
  await db.collection('campaigns').deleteMany({ brandId: clientId });
  await db.collection('deliveries').deleteMany({ _id: new mongoose.Types.ObjectId(accExisting.data.deliveryId) });
  await db.collection('campaigns').deleteMany({ externalQuoteId: { $exists: true }, brandId: new mongoose.Types.ObjectId(brandUser.id) });
  await db.collection('externalquotes').deleteMany({ creatorId: new mongoose.Types.ObjectId(creatorUser.id) });
  return 'devis PDF + contrat, envoi, page publique, refus, modification du brouillon, acceptation nouveau client (320 € bloqués, 10 %), marque existante, payé en direct';
});

await step('Créateur : registre des droits et exclusivités (sync mission, contenu externe, renouvellement, rappels)', async () => {
  const db = mongoose.connection.db;
  const creatorId = new mongoose.Types.ObjectId(creatorUser.id);
  await db.collection('creatorcontents').deleteMany({ creatorId });
  // Un devis extérieur payé en direct pour vérifier la synchro « quote »
  const qd = await creatorApi('POST', '/external-quotes', { client: { companyName: 'Boutique Registre', email: `e2e-reg-${RUN}@needcreator-test.com` }, title: 'Vidéo payée en direct', price: 120, rights: { duration: '6m', supports: ['website'], exclusivity: true, exclusivityMonths: 2 } });
  expect(qd.status === 201, 'Devis extérieur (registre) non créé', qd);
  await creatorApi('POST', `/external-quotes/${qd.data.quote._id}/direct`);
  const reg = await creatorApi('GET', '/creator-contents');
  expect(reg.status === 200, 'Registre créateur indisponible', reg);
  const main = reg.data.contents.find(c => c.source === 'needcreator' && String(c.deliveryId) === String(delivery._id));
  expect(main, 'La mission validée doit être synchronisée dans le registre', reg.data);
  expect(main.rights.exclusivity && main.rights.exclusivityMonths === 3 && main.rights.exclusivityEndAt && main.client.platform === 'NeedCreator', 'Droits du contrat (exclusivité 3 mois) attendus', main);
  expect(main.status === 'active' && main.daysLeft > 600 && main.exclusivityStatus === 'active', `Statut attendu actif 2 ans, reçu ${main.status}/${main.daysLeft}/${main.exclusivityStatus}`, main);
  const fromQuote = reg.data.contents.find(c => c.source === 'quote');
  expect(fromQuote && fromQuote.rights.endAt && fromQuote.client.name === 'Boutique Registre', 'Le devis payé en direct doit être synchronisé (6 mois)', reg.data);
  // Contenu externe qui expire dans 10 jours, exclusivité déjà terminée
  const endAt = new Date(Date.now() + 10 * 86400000).toISOString();
  const start = new Date(Date.now() - 200 * 86400000).toISOString();
  const ext = await creatorApi('POST', '/creator-contents', { title: 'Vidéo agence hors plateforme', client: { name: 'Agence Lune', email: `e2e-reg-client-${RUN}@needcreator-test.com`, platform: 'Agence' }, contractType: 'licence', price: 250, rights: { startAt: start, endAt, supports: ['social_organic'], territories: 'France', exclusivity: true, exclusivityMonths: 3, exclusivityScope: 'cosmétiques' }, documents: [{ label: 'Contrat signé', url: 'https://drive.example.com/c.pdf' }] });
  expect(ext.status === 201 && ext.data.content.status === 'expiring' && ext.data.content.exclusivityStatus === 'ended', 'Contenu externe : attendu expiring + exclusivité terminée', ext);
  const noTitle = await creatorApi('POST', '/creator-contents', { title: '' });
  expect(noTitle.status === 400, 'Le titre est obligatoire', noTitle);
  const lockedEdit = await creatorApi('PATCH', `/creator-contents/${main._id}`, { notes: 'Note perso', rights: { endAt: null } });
  expect(lockedEdit.status === 200 && lockedEdit.data.content.notes === 'Note perso' && lockedEdit.data.content.rights.endAt, 'Les droits d\'une mission NeedCreator ne se modifient pas, les notes oui', lockedEdit);
  const noDel = await creatorApi('DELETE', `/creator-contents/${main._id}`);
  expect(noDel.status === 400, 'Un contenu de mission ne se retire pas', noDel);
  // Rappels : droits externes à 7 jours + fin d'exclusivité, une seule fois
  await db.collection('users').updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  const jobs = await adminApi('POST', '/admin/jobs/run');
  expect(jobs.data.creatorRightsReminders >= 2, `2 rappels créateur attendus (droits + exclusivité), reçu ${jobs.data.creatorRightsReminders}`, jobs.data);
  const jobs2 = await adminApi('POST', '/admin/jobs/run');
  expect((jobs2.data.creatorRightsReminders || 0) === 0, 'Les rappels ne doivent pas être renvoyés', jobs2.data);
  await db.collection('users').updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  const notifs = await creatorApi('GET', '/notifications');
  expect(notifs.data.notifications.some(n => /Exclusivité terminée/.test(n.title)) && notifs.data.notifications.some(n => /fin dans 10 jours/.test(n.title)), 'Notifications de rappel attendues', notifs.data.notifications.map(n => n.title));
  // Renouvellement : mission NeedCreator → renvoi vers la mission ; externe → devis NeedCreator pré-rempli
  const rnMain = await creatorApi('POST', `/creator-contents/${main._id}/renew`);
  expect(rnMain.status === 200 && /deliveries/.test(rnMain.data.href), 'Renouvellement mission : lien vers la mission', rnMain);
  const rnExt = await creatorApi('POST', `/creator-contents/${ext.data.content._id}/renew`, { duration: '1y', price: 100 });
  expect(rnExt.status === 201 && rnExt.data.quote?.link, 'Renouvellement externe : devis attendu', rnExt);
  const quotes = await creatorApi('GET', '/external-quotes');
  const rq = quotes.data.quotes.find(q => q._id === rnExt.data.quote.id);
  expect(rq && /Renouvellement des droits/.test(rq.mission.title) && rq.client.companyName === 'Agence Lune' && rq.quote.price === 100 && rq.quote.rights.duration === '1y', 'Devis de renouvellement mal pré-rempli', rq);
  const del = await creatorApi('DELETE', `/creator-contents/${ext.data.content._id}`);
  expect(del.status === 200, 'Retrait du contenu externe échoué', del);
  await db.collection('externalquotes').deleteMany({ creatorId });
  await db.collection('creatorcontents').deleteMany({ creatorId });
  return 'mission synchronisée (2 ans, exclusivité 3 mois), devis direct synchronisé, contenu externe, rappels 7 j + exclusivité (une fois), renouvellement → devis';
});

await step('Créateur : suivi de prospection (relances, devis lié) et calculateur de tarif public', async () => {
  const db = mongoose.connection.db;
  const creatorId = new mongoose.Types.ObjectId(creatorUser.id);
  const bad = await creatorApi('POST', '/prospects', { company: '' });
  expect(bad.status === 400, 'Le nom de la marque est obligatoire', bad);
  const p1 = await creatorApi('POST', '/prospects', { company: 'Marque Soleil', contactName: 'Anna', email: `e2e-prospect-${RUN}@needcreator-test.com`, source: 'Instagram', note: 'Vue en story, produit solaire', nextFollowUpAt: new Date(Date.now() - 3600000).toISOString() });
  expect(p1.status === 201 && p1.data.prospect.status === 'to_contact' && p1.data.prospect.notes.length === 1, 'Prospect non créé', p1);
  const p2 = await creatorApi('POST', '/prospects', { company: 'Marque Lune', status: 'contacted' });
  const upd = await creatorApi('PATCH', `/prospects/${p2.data.prospect._id}`, { status: 'replied', note: 'Intéressée par 2 vidéos' });
  expect(upd.status === 200 && upd.data.prospect.status === 'replied' && upd.data.prospect.lastContactAt && upd.data.prospect.notes.length === 1, 'Mise à jour du prospect échouée', upd);
  // Relance à date → notification (une fois)
  await db.collection('users').updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  const jobs = await adminApi('POST', '/admin/jobs/run');
  expect(jobs.data.prospectReminders >= 1, `Relance de prospection attendue, reçu ${jobs.data.prospectReminders}`, jobs.data);
  const jobs2 = await adminApi('POST', '/admin/jobs/run');
  expect((jobs2.data.prospectReminders || 0) === 0, 'La relance ne doit partir qu\'une fois', jobs2.data);
  await db.collection('users').updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  const notifs = await creatorApi('GET', '/notifications');
  expect(notifs.data.notifications.some(n => /Relance prévue aujourd'hui : Marque Soleil/.test(n.title)), 'Notification de relance attendue', notifs.data.notifications.map(n => n.title));
  // Devis créé depuis le prospect → statut « devis envoyé », puis « gagné » quand il est payé en direct
  const q = await creatorApi('POST', '/external-quotes', { prospectId: p1.data.prospect._id, client: { companyName: 'Marque Soleil', email: p1.data.prospect.email }, title: 'Vidéo solaire', price: 90, rights: { duration: '1y' } });
  expect(q.status === 201, 'Devis depuis un prospect non créé', q);
  let list = await creatorApi('GET', '/prospects');
  let pr = list.data.prospects.find(p => p._id === p1.data.prospect._id);
  expect(pr.status === 'quote_sent' && String(pr.externalQuoteId) === String(q.data.quote._id) && pr.notes.length === 2, 'Le prospect doit être en « devis envoyé » avec le devis lié', pr);
  await creatorApi('POST', `/external-quotes/${q.data.quote._id}/direct`);
  list = await creatorApi('GET', '/prospects');
  pr = list.data.prospects.find(p => p._id === p1.data.prospect._id);
  expect(pr.status === 'won' && list.data.summary.won === 1 && list.data.summary.total === 2, 'Le prospect doit passer en « gagné »', list.data.summary);
  const del = await creatorApi('DELETE', `/prospects/${p2.data.prospect._id}`);
  expect(del.status === 200, 'Suppression du prospect échouée', del);
  // Calculateur public
  const calc = await fetch(`${API}/campaigns/rate-calculator?videoType=demo&rights=2y&supports=social_organic,paid_ads&exclusivity=true&exclusivityMonths=6&deliverables=3&duration=45`).then(r => r.json());
  expect(calc.perVideo && calc.perVideo.low <= calc.perVideo.mid && calc.perVideo.mid <= calc.perVideo.high && calc.total.mid === calc.perVideo.mid * 3 && calc.factors.length >= 4, 'Calculateur : fourchette et facteurs attendus', { status: 200, data: calc });
  const plain = await fetch(`${API}/campaigns/rate-calculator?videoType=demo`).then(r => r.json());
  expect(calc.perVideo.mid > plain.perVideo.mid, 'Droits étendus + publicité + exclusivité doivent augmenter le tarif', { status: 200, data: { calc: calc.perVideo, plain: plain.perVideo } });
  await db.collection('prospects').deleteMany({ creatorId });
  await db.collection('externalquotes').deleteMany({ creatorId });
  await db.collection('externalincomes').deleteMany({ creatorId });
  return `prospects : relance notifiée une fois, devis lié → devis envoyé → gagné ; calculateur : ${plain.perVideo.mid} € → ${calc.perVideo.mid} €/vidéo (${calc.base.source})`;
});

await step('Créateur : disponibilité, kit média, académie, virements, missions recommandées', async () => {
  // Disponibilité déclarée → visible sur le profil public, pénalise le matching
  const until = new Date(Date.now() + 10 * 86400000).toISOString();
  const av = await creatorApi('PATCH', '/auth/profile', { profile: { availability: { unavailableUntil: until, note: 'Tournage à l\'étranger' } } });
  expect(av.status === 200 && av.data.user.profile.availability?.note === 'Tournage à l\'étranger', 'Disponibilité non enregistrée', av);
  const pub = await fetch(`${API}/portfolio/creator/${creatorUser.id}`).then(r => r.json());
  expect(pub.creator && pub.creator.unavailableUntil && pub.creator.availabilityNote === 'Tournage à l\'étranger' && typeof pub.creator.activeMissions === 'number', 'Le profil public devrait afficher la disponibilité et la charge', { status: 200, data: pub.creator });
  const back = await creatorApi('PATCH', '/auth/profile', { profile: { availability: { unavailableUntil: null, note: '' } } });
  expect(back.status === 200 && !back.data.user.profile.availability?.unavailableUntil, 'Retour à disponible échoué', back);
  // Kit média : lien court + QR + adresse publique
  const kit = await creatorApi('GET', '/auth/media-kit');
  expect(kit.status === 200 && /\/c\/[a-z0-9-]+$/.test(kit.data.url) && kit.data.qr.startsWith('data:image/png;base64,') && kit.data.shareText.includes(kit.data.url), 'Kit média incomplet', kit);
  const bySlug = await fetch(`${API}/creators/slug/${kit.data.slug}`).then(r => r.json());
  expect(String(bySlug.id) === creatorUser.id && bySlug.name, 'Le slug devrait résoudre vers le créateur', { status: 200, data: bySlug });
  // Académie : guides publics sans réponses ; quiz raté puis réussi ; badge Formé après `required` guides
  const ac = await fetch(`${API}/academy`).then(r => r.json());
  expect(ac.guides?.length >= 5 && ac.guides.every(g => g.quiz.every(q => q.answer === undefined)), 'Les guides ne doivent pas exposer les réponses', { status: 200, data: { n: ac.guides?.length } });
  const { GUIDES } = await import('../config/academy.js');
  const wrong = await creatorApi('POST', `/auth/academy/${GUIDES[0].slug}/quiz`, { answers: GUIDES[0].quiz.map(q => (q.answer + 1) % q.options.length) });
  expect(wrong.status === 200 && wrong.data.passed === false && wrong.data.score === 0, 'Un quiz raté ne doit pas valider le guide', wrong);
  let last;
  for (const g of GUIDES.slice(0, ac.required)) {
    last = await creatorApi('POST', `/auth/academy/${g.slug}/quiz`, { answers: g.quiz.map(q => q.answer) });
    expect(last.status === 200 && last.data.passed === true && last.data.score === 100, `Quiz « ${g.title} » devrait être réussi`, last);
  }
  expect(last.data.trained === true && last.data.badges.includes('trained'), 'Le badge Formé devrait être attribué', last);
  const prof = await creatorApi('GET', '/auth/profile');
  expect(prof.data.user.badges.includes('trained') && prof.data.user.profile.academy.filter(a => a.passed).length === ac.required, 'Le profil devrait porter le badge Formé', prof);
  // Badges partageables et widget « créateur vérifié » dans le kit média ; fiche publique par slug enrichie
  const kit2 = await creatorApi('GET', '/auth/media-kit');
  expect(kit2.data.badges.some(b => b.kind === 'trained' && /badge\/trained\?format=story/.test(b.images.story) && b.text.includes(kit2.data.url)) && kit2.data.badges.some(b => b.kind === 'ambassador'), 'Badges partageables Formé et Ambassadeur attendus dans le kit média', kit2);
  expect(kit2.data.widget.available === true && /\/widget$/.test(kit2.data.widget.imageUrl) && /<img /.test(kit2.data.widget.html), 'Widget créateur vérifié attendu', kit2);
  const pubSlug = await fetch(`${API}/creators/slug/${kit2.data.slug}`).then(r => r.json());
  expect(pubSlug.verified === true && pubSlug.badges.includes('trained') && pubSlug.badges.includes('ambassador') && pubSlug.level && pubSlug.slug === kit2.data.slug, 'La fiche publique par slug doit exposer badges, niveau et vérification', { status: 200, data: pubSlug });
  // Calendrier des virements + seuils micro
  const po = await creatorApi('GET', '/auth/payouts');
  expect(po.status === 200 && typeof po.data.connected === 'boolean' && po.data.thresholds && po.data.thresholds.vat > 0 && typeof po.data.ytd === 'number', 'Calendrier des virements / seuils attendus', po);
  // Revenus extérieurs : saisie manuelle + devis payés en direct comptés automatiquement, seuils sur le total
  const dq = await creatorApi('POST', '/external-quotes', { client: { companyName: 'Client Direct' }, title: 'Vidéo payée en direct (revenus)', price: 80, rights: { duration: '1y' } });
  await creatorApi('POST', `/external-quotes/${dq.data.quote._id}/direct`);
  const badInc = await creatorApi('POST', '/external-incomes', { label: '', amountHT: 0 });
  expect(badInc.status === 400 && /Il manque/.test(badInc.data.error), 'Revenu extérieur invalide refusé', badInc);
  const inc = await creatorApi('POST', '/external-incomes', { label: 'Vidéo pour une agence', client: 'Agence Lune', amountHT: 250.5, date: new Date().toISOString() });
  expect(inc.status === 201 && inc.data.income.amountHT === 250.5, 'Revenu extérieur non enregistré', inc);
  const incs = await creatorApi('GET', '/external-incomes');
  expect(incs.status === 200 && incs.data.incomes.some(i => i.source === 'quote' && i.amountHT === 80) && incs.data.total === 330.5, `Total revenus extérieurs attendu 330.5, reçu ${incs.data.total}`, incs);
  const po2 = await creatorApi('GET', '/auth/payouts');
  expect(po2.data.ytdExternal === 330.5 && po2.data.ytdTotal === Math.round((po2.data.ytd + 330.5) * 100) / 100, 'Les seuils doivent intégrer les revenus extérieurs', po2);
  const delInc = await creatorApi('DELETE', `/external-incomes/${inc.data.income._id}`);
  expect(delInc.status === 200, 'Retrait du revenu extérieur échoué', delInc);
  await mongoose.connection.db.collection('externalincomes').deleteMany({ creatorId: new mongoose.Types.ObjectId(creatorUser.id) });
  await mongoose.connection.db.collection('externalquotes').deleteMany({ _id: new mongoose.Types.ObjectId(dq.data.quote._id) });
  // Missions recommandées
  const reco = await creatorApi('GET', '/campaigns?filter=recommended&limit=3');
  expect(reco.status === 200 && Array.isArray(reco.data.campaigns), 'Missions recommandées attendues', reco);
  return `kit ${kit.data.url}, badge Formé, virements ${po.data.stripeError ? 'indisponibles (' + po.data.stripeError.slice(0, 40) + ')' : 'OK'}, revenus extérieurs 330,50 € intégrés aux seuils`;
});

await step('Filigrane : aperçu de portfolio marqué pour les marques, original pour le créateur', async () => {
  const { makeSampleVideo } = await import('../src/services/video.js');
  const sample = await makeSampleVideo(2);
  const form = new FormData();
  form.append('video', new File([fs.readFileSync(sample)], 'vraie-portfolio.mp4', { type: 'video/mp4' }));
  form.append('title', 'Vidéo réelle'); form.append('videoType', 'demo');
  const up = await creatorApi('POST', '/portfolio/upload', form, { form: true });
  expect(up.status === 201, 'Upload portfolio (vraie vidéo) échoué', up);
  const original = up.data.video.videoUrl;
  let item = null;
  for (let i = 0; i < 40; i++) {
    const prof = await creatorApi('GET', '/auth/profile');
    item = (prof.data.user.profile.portfolio || []).find(v => v.title === 'Vidéo réelle');
    if (item?.previewUrl || item?.watermarkError) break;
    await sleep(1000);
  }
  expect(item && item.previewUrl && /\/previews\//.test(item.previewUrl) && !item.watermarkError, `L'aperçu filigrané devrait être généré (${item?.watermarkError || 'non généré'}) ; champs : ${Object.keys(item || {}).join(',')}`, { status: 200, data: item });
  const pub = await fetch(`${API}/portfolio/creator/${creatorUser.id}`).then(r => r.json());
  const pubItem = (pub.creator.profile.portfolio || []).find(v => v.title === 'Vidéo réelle');
  expect(pubItem && /\/previews\//.test(pubItem.videoUrl) && pubItem.protected === true && pubItem.previewUrl === undefined, 'Le visiteur doit voir l\'aperçu filigrané, sans l\'URL originale', { status: 200, data: pubItem });
  const own = await creatorApi('GET', `/portfolio/creator/${creatorUser.id}`);
  const ownItem = (own.data.creator.profile.portfolio || []).find(v => v.title === 'Vidéo réelle');
  expect(ownItem && !/\/previews\//.test(ownItem.videoUrl) && !ownItem.protected, 'Le créateur doit voir son original', own);
  const del = await creatorApi('DELETE', `/portfolio/${item._id}`);
  expect(del.status === 200, 'Suppression de la vidéo test échouée', del);
  return 'aperçu filigrané servi aux marques, original conservé';
});

await step('Marque : annuaire des créateurs (filtres) et collaborateurs', async () => {
  const all = await brandApi('GET', '/creators?niches=beauty&network=tiktok&minFollowers=10000&sort=followers');
  expect(all.status === 200 && all.data.creators.some(c => c.id === creatorUser.id), 'Le créateur devrait ressortir avec ces filtres', all);
  const me = all.data.creators.find(c => c.id === creatorUser.id);
  expect(me.collaborated === true && me.badges.includes('ambassador') && me.socials.length === 2, 'Fiche créateur incomplète dans la recherche', all);
  const none = await brandApi('GET', '/creators?minFollowers=1000000');
  expect(!none.data.creators.some(c => c.id === creatorUser.id), 'Le filtre abonnés devrait exclure le créateur', none);
  const collab = await brandApi('GET', '/creators?collaborated=true');
  expect(collab.data.creators.length >= 1 && collab.data.creators.every(c => c.collaborated), 'La liste des collaborateurs est incorrecte', collab);
  const forbidden = await creatorApi('GET', '/creators');
  expect(forbidden.status === 403, 'Un créateur ne doit pas accéder à l\'annuaire', forbidden);
  const stats = await creatorApi('GET', `/campaigns/${campaign._id}`);
  expect(stats.data.campaign.brandId.profile.stats.avgValidationDays != null, 'La réactivité de la marque devrait être calculée', stats);
  return `réactivité marque : validation ${stats.data.campaign.brandId.profile.stats.avgValidationDays} j, réponse ${stats.data.campaign.brandId.profile.stats.avgResponseDays} j`;
});

await step('Liens publics/privés : accord des deux parties', async () => {
  // Nouvelle campagne "devis libre" (sans budget), livrée par lien uniquement
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const c = await brandApi('POST', '/campaigns', {
    title: 'Campagne devis libre par lien', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.',
    videoType: 'unboxing', duration: 30, deliverables: 1, niches: ['beauty'], applicationDeadline: deadline, deliveryTypes: ['link'], platforms: ['instagram'],
  });
  expect(c.status === 201 && !c.data.campaign.budget?.total, 'Campagne sans budget refusée', c);
  await brandApi('POST', `/campaigns/${c.data.campaign._id}/publish`);
  const ap = await creatorApi('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 150, estimatedDeliveryDays: 4 });
  expect(ap.status === 201, 'Candidature sur campagne sans budget échouée', ap);
  // Commission réduite Ambassadeur (réglage admin, 8 %) appliquée à la sélection d'un créateur Ambassadeur
  const usersCol = mongoose.connection.db.collection('users');
  await usersCol.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  const fee = await brandApi('PUT', '/admin/settings/ambassadorFeePercent', { value: 8 });
  expect(fee.status === 200, 'Réglage commission Ambassadeur échoué', fee);
  await usersCol.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  const sel = await brandApi('POST', `/campaigns/${c.data.campaign._id}/select/${creatorUser.id}`);
  expect(sel.status === 200 && sel.data.delivery.payment.amount === 150, 'Sélection / montant du devis incorrect', sel);
  expect(sel.data.delivery.payment.platformFeePercent === 8 && sel.data.delivery.payment.creatorAmount === 138, 'La commission Ambassadeur (8 %) doit s\'appliquer : 138 € pour le créateur', sel);
  await usersCol.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  await brandApi('PUT', '/admin/settings/ambassadorFeePercent', { value: 10 });
  await usersCol.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  const { default: Stripe } = await import('stripe');
  await new Stripe(process.env.STRIPE_SECRET_KEY).paymentIntents.confirm(sel.data.delivery.payment.stripePaymentIntentId, { payment_method: 'pm_card_visa' });
  await brandApi('POST', `/deliveries/${sel.data.delivery._id}/confirm-payment`, {});
  const d = sel.data.delivery._id;
  const f = new FormData(); f.append('files', fakeVideo('x.mp4'));
  const up = await creatorApi('POST', `/deliveries/${d}/upload`, f, { form: true });
  expect(up.status === 400, 'Un fichier devrait être refusé sur une campagne "lien uniquement"', up);
  const add = await creatorApi('POST', `/deliveries/${d}/links`, { links: [{ url: 'https://www.instagram.com/reel/abc' }] });
  expect(add.status === 200, 'Ajout du lien échoué', add);
  const linkId = add.data.links[0]._id;
  await creatorApi('POST', `/deliveries/${d}/submit`, {});
  const ok = await brandApi('POST', `/deliveries/${d}/approve`);
  expect(ok.status === 200, 'Approbation échouée', ok);
  const fromDeliveries = (list) => list.filter(r => r.source === 'delivery');
  let pub = await fetch(`${API}/portfolio/creator/${creatorUser.id}`).then(r => r.json());
  expect(fromDeliveries(pub.realisations).length === 1 && fromDeliveries(pub.realisations)[0].isPublic, 'Le lien devrait être public par défaut sur le profil', { status: 200, data: pub });
  const priv = await brandApi('PATCH', `/deliveries/${d}/links/${linkId}/visibility`, { public: false });
  expect(priv.status === 200 && priv.data.isPublic === false, 'La marque devrait pouvoir rendre le lien privé', priv);
  pub = await fetch(`${API}/portfolio/creator/${creatorUser.id}`).then(r => r.json());
  expect(fromDeliveries(pub.realisations).length === 0, 'Un lien privé ne doit pas apparaître publiquement', { status: 200, data: pub });
  const asBrand = await brandApi('GET', `/portfolio/creator/${creatorUser.id}`);
  expect(fromDeliveries(asBrand.data.realisations).length === 1 && fromDeliveries(asBrand.data.realisations)[0].isPublic === false, 'La marque concernée doit voir le lien privé', asBrand);
  return 'commission Ambassadeur 8 % appliquée (138 €) ; lien public par défaut, privé dès qu\'une partie refuse, visible par la marque concernée';
});

await step('Campagne multi-créateurs (2 postes) + paiement groupé', async () => {
  // Second créateur, activé directement en base
  const creator2Email = `e2e-creator2-${RUN}@needcreator-test.com`;
  c2 = await firebaseUser(creator2Email);
  c2Api = client(c2.idToken);
  const reg = await c2Api('POST', '/auth/register/creator', { acceptTerms: true, email: creator2Email, name: 'Créateur 2', bio: '', niches: ['beauty'], minPrice: 80 });
  expect(reg.status === 201, 'Inscription créateur 2 échouée', reg);
  extraCleanup.push({ userId: reg.data.user.id, uid: c2.uid });
  await setLegalInfo(c2Api, 'creator');
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: creator2Email }, { $set: { status: 'active', 'verification.portfolio': true, 'profile.ambassador.status': 'approved' } });
  for (let i = 1; i <= 3; i++) { const f = new FormData(); f.append('video', fakeVideo(`c2-${i}.mp4`)); f.append('title', `C2 ${i}`); f.append('videoType', 'demo'); await c2Api('POST', '/portfolio/upload', f, { form: true }); }

  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const c = await brandApi('POST', '/campaigns', {
    title: 'Campagne multi-créateurs test', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.',
    videoType: 'demo', duration: 30, deliverables: 1, niches: ['beauty'], applicationDeadline: deadline, creatorsWanted: 2,
  });
  expect(c.status === 201 && c.data.campaign.matching.creatorsWanted === 2, 'Création multi-créateurs échouée', c);
  const cid = c.data.campaign._id;
  await brandApi('POST', `/campaigns/${cid}/publish`);
  const a1 = await creatorApi('POST', `/campaigns/${cid}/apply`, { price: 100, estimatedDeliveryDays: 3 });
  const a2 = await c2Api('POST', `/campaigns/${cid}/apply`, { price: 90, estimatedDeliveryDays: 4 });
  expect(a1.status === 201 && a2.status === 201, 'Candidatures échouées', a2);

  const s1 = await brandApi('POST', `/campaigns/${cid}/select/${creatorUser.id}`);
  expect(s1.status === 200 && s1.data.remainingSlots === 1 && s1.data.campaign.status === 'active', 'Après 1 sélection, la campagne doit rester ouverte', s1);
  const still = await c2Api('GET', `/campaigns/${cid}`);
  expect(still.status === 200 && still.data.campaign.status === 'active', 'Le 2e créateur doit encore voir la campagne ouverte', still);
  const s2 = await brandApi('POST', `/campaigns/${cid}/select/${reg.data.user.id}`);
  expect(s2.status === 200 && s2.data.remainingSlots === 0 && s2.data.campaign.status === 'in_progress', 'Après 2 sélections, la campagne passe en production', s2);
  const s3 = await brandApi('POST', `/campaigns/${cid}/select/${creatorUser.id}`);
  expect(s3.status === 400, 'Une 3e sélection doit être refusée', s3);

  const detail = await brandApi('GET', `/campaigns/${cid}`);
  expect(detail.data.campaign.deliveries.length === 2 && detail.data.campaign.pendingPayments.length === 2, 'Deux livraisons et deux paiements en attente attendus', detail);

  // Paiement groupé : carte enregistrée (SetupIntent) puis confirmation de tous les paiements
  const setup = await brandApi('POST', `/campaigns/${cid}/payment-setup`);
  expect(setup.status === 200 && setup.data.count === 2 && setup.data.total === 190, 'SetupIntent groupé incorrect', setup);
  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const siId = setup.data.clientSecret.split('_secret')[0];
  const si = await stripe.setupIntents.confirm(siId, { payment_method: 'pm_card_visa' });
  const pay = await brandApi('POST', `/campaigns/${cid}/pay-all`, { paymentMethodId: si.payment_method });
  expect(pay.status === 200 && pay.data.paid === 2, 'Paiement groupé échoué', pay);
  const after = await brandApi('GET', `/campaigns/${cid}`);
  expect(after.data.campaign.pendingPayments.length === 0 && after.data.campaign.deliveries.every(d => d.payment.status === 'held'), 'Tous les paiements devraient être bloqués', after);

  // Livraison + approbation des deux → campagne terminée seulement à la fin
  for (const [api, d] of [[creatorApi, after.data.campaign.deliveries.find(x => x.creatorId._id === creatorUser.id)], [c2Api, after.data.campaign.deliveries.find(x => x.creatorId._id === reg.data.user.id)]]) {
    const f = new FormData(); f.append('files', fakeVideo('m.mp4'));
    await api('POST', `/deliveries/${d._id}/upload`, f, { form: true });
    await api('POST', `/deliveries/${d._id}/submit`, {});
  }
  const ok1 = await brandApi('POST', `/deliveries/${after.data.campaign.deliveries[0]._id}/approve`);
  expect(ok1.status === 200, 'Approbation 1 échouée', ok1);
  const mid = await brandApi('GET', `/campaigns/${cid}`);
  expect(mid.data.campaign.status === 'in_progress', 'La campagne ne doit pas être terminée tant qu\'une livraison reste', mid);
  const ok2 = await brandApi('POST', `/deliveries/${after.data.campaign.deliveries[1]._id}/approve`);
  expect(ok2.status === 200, 'Approbation 2 échouée', ok2);
  const end = await brandApi('GET', `/campaigns/${cid}`);
  expect(end.data.campaign.status === 'completed', 'La campagne devrait être terminée', end);
  // Avis par créateur
  const r1 = await brandApi('POST', `/reviews/campaign/${cid}?creatorId=${creatorUser.id}`, { rating: 5, communication: 5, quality: 5, timeliness: 5, professionalism: 5 });
  const r2 = await brandApi('POST', `/reviews/campaign/${cid}?creatorId=${reg.data.user.id}`, { rating: 4, communication: 4, quality: 4, timeliness: 4, professionalism: 4 });
  expect(r1.status === 201 && r2.status === 201, 'La marque doit pouvoir noter chaque créateur', r2);
  return '2 créateurs sélectionnés, 190€ payés en une fois, campagne terminée après les 2 approbations';
});

await step('Créateurs non retenus : notification à la sélection, réglable dans l\'admin', async () => {
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const mk = async (title) => {
    const c = await brandApi('POST', '/campaigns', { title, description: 'Description suffisamment longue pour passer la validation de cinquante caractères.', videoType: 'demo', duration: 30, deliverables: 1, budget: 120, niches: ['beauty'], applicationDeadline: deadline });
    await brandApi('POST', `/campaigns/${c.data.campaign._id}/publish`);
    await creatorApi('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 100, estimatedDeliveryDays: 3 });
    await c2Api('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 90, estimatedDeliveryDays: 4 });
    return c.data.campaign._id;
  };
  const cid = await mk('Un seul poste, deux devis');
  const sel = await brandApi('POST', `/campaigns/${cid}/select/${creatorUser.id}`);
  expect(sel.status === 200, 'Sélection échouée', sel);
  const bell = await c2Api('GET', '/notifications');
  expect(bell.data.notifications.some(n => /Devis non retenu/.test(n.title)), 'Le créateur non retenu doit être prévenu', bell);
  // Réglage désactivé : plus de notification
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  const off = await brandApi('PUT', '/admin/settings/notifyNotSelected', { value: false });
  expect(off.status === 200, 'Désactivation du réglage échouée', off);
  await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  const cid2 = await mk('Un seul poste, deux devis, silencieux');
  await brandApi('POST', `/campaigns/${cid2}/select/${creatorUser.id}`);
  const bell2 = await c2Api('GET', '/notifications');
  expect(bell2.data.notifications.filter(n => /Devis non retenu/.test(n.title)).length === 1, 'Réglage désactivé : aucune nouvelle notification', bell2);
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  await brandApi('PUT', '/admin/settings/notifyNotSelected', { value: true });
  await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  const deliveries = mongoose.connection.db.collection('deliveries');
  for (const id of [cid, cid2]) { await deliveries.deleteMany({ campaignId: new mongoose.Types.ObjectId(id) }); await mongoose.connection.db.collection('campaigns').deleteOne({ _id: new mongoose.Types.ObjectId(id) }); }
  return 'notification envoyée au non retenu, désactivable dans l\'admin';
});

await step('Envoi de produit : adresse, expédition, réception, délai de production', async () => {
  const addr = await creatorApi('PATCH', '/auth/profile', { profile: { address: { name: 'Créateur Test', line1: '12 rue des Lilas', postalCode: '75011', city: 'Paris', country: 'France', phone: '0600000000' } } });
  expect(addr.status === 200 && addr.data.user.profile.address.city === 'Paris', 'Adresse non enregistrée', addr);
  const pub = await fetch(`${API}/portfolio/creator/${creatorUser.id}`).then(r => r.json());
  expect(!pub.creator.profile.address, 'L\'adresse ne doit pas être publique', { status: 200, data: pub.creator.profile.address });

  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const c = await brandApi('POST', '/campaigns', {
    title: 'Campagne avec envoi de produit', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.',
    videoType: 'unboxing', duration: 30, deliverables: 1, budget: 100, niches: ['beauty'], applicationDeadline: deadline, productShipping: true, productDescription: 'Sérum 30 ml',
  });
  expect(c.status === 201 && c.data.campaign.brief.productShipping === true, 'Campagne avec envoi non créée', c);
  await brandApi('POST', `/campaigns/${c.data.campaign._id}/publish`);
  await creatorApi('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 100, estimatedDeliveryDays: 5 });
  const sel = await brandApi('POST', `/campaigns/${c.data.campaign._id}/select/${creatorUser.id}`);
  const d = sel.data.delivery;
  expect(d.shipping.required && d.shipping.status === 'pending' && d.shipping.address.city === 'Paris' && !d.productionDeadline, 'La livraison doit attendre l\'envoi avec l\'adresse du créateur', sel);

  const early = await creatorApi('PATCH', `/deliveries/${d._id}/shipping`, { action: 'received' });
  expect(early.status === 400, 'Réception impossible avant expédition', early);
  const notBrand = await creatorApi('PATCH', `/deliveries/${d._id}/shipping`, { action: 'shipped' });
  expect(notBrand.status === 403, 'Seule la marque expédie', notBrand);
  // La marque peut renoncer à l'envoi puis le redemander (« Envoyer un produit finalement »), réservé à la marque
  const off = await brandApi('PATCH', `/deliveries/${d._id}/shipping`, { action: 'not_required' });
  expect(off.status === 200 && off.data.shipping.required === false && off.data.shipping.status === 'none', 'Renoncer à l\'envoi échoué', off);
  const onCreator = await creatorApi('PATCH', `/deliveries/${d._id}/shipping`, { action: 'required' });
  expect(onCreator.status === 403, 'Seule la marque peut décider d\'un envoi', onCreator);
  const on = await brandApi('PATCH', `/deliveries/${d._id}/shipping`, { action: 'required' });
  expect(on.status === 200 && on.data.shipping.required === true && on.data.shipping.status === 'pending', 'Envoi redemandé : statut « à expédier » attendu', on);
  const ship = await brandApi('PATCH', `/deliveries/${d._id}/shipping`, { action: 'shipped', carrier: 'Colissimo', trackingNumber: '6A123', trackingUrl: 'https://www.laposte.fr/suivi/6A123' });
  expect(ship.status === 200 && ship.data.shipping.status === 'shipped', 'Expédition échouée', ship);
  const recv = await creatorApi('PATCH', `/deliveries/${d._id}/shipping`, { action: 'received' });
  expect(recv.status === 200 && recv.data.shipping.status === 'received' && recv.data.productionDeadline, 'Réception échouée', recv);
  const days = Math.round((new Date(recv.data.productionDeadline) - Date.now()) / 86400000);
  expect(days === 5, `Le délai de production doit être de 5 jours après réception (obtenu ${days})`, recv);
  return `expédié Colissimo 6A123, reçu, livraison attendue dans ${days} jours`;
});

await step('Créateurs référencés : import admin (xlsx/csv), annuaire public, invitation par une marque, retrait, rattachement à l\'inscription', async () => {
  const users = mongoose.connection.db.collection('users');
  const extEmail = `e2e-invited-${RUN}@needcreator-test.com`;
  const csv = ['Username,Name,Country,Email,Instagram,YouTube,Followers,Posts,Likes,Niche',
    `e2e_ext_${RUN},Ext Test,FRANCE,${extEmail},https://www.instagram.com/e2e_ext,,"16,903",422,"67,354",Technology`,
    `e2e_ext_${RUN},Ext Test doublon,FR,${extEmail},,,10,1,1,Technology`,
    `e2e_us_${RUN},US Test,US,us-${RUN}@needcreator-test.com,,,2.725.122,10,10,Technology`,
    `e2e_be_${RUN},BE Test,BE,be-${RUN}@needcreator-test.com,,https://www.youtube.com/channel/x,1.500.000,10,10,Technology`].join('\n');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  try {
    const f = new FormData(); f.append('file', new File([csv], 'liste-test.csv', { type: 'text/csv' })); f.append('scope', 'europe');
    const imp = await brandApi('POST', '/external-creators/admin/import', f, { form: true });
    expect(imp.status === 200 && imp.data.stats.created === 2 && imp.data.stats.skippedCountry === 1 && imp.data.stats.duplicatesInFile === 1, 'Import attendu : 2 créés (FR, BE), 1 hors périmètre (US), 1 doublon', imp);
    const again = await brandApi('POST', '/external-creators/admin/import', (() => { const g = new FormData(); g.append('file', new File([csv], 'liste-test.csv', { type: 'text/csv' })); g.append('scope', 'europe'); return g; })(), { form: true });
    expect(again.status === 200 && again.data.stats.created === 0 && again.data.stats.updated === 2, 'Réimport : aucune création, 2 mises à jour', again);
    const stats = await brandApi('GET', '/external-creators/admin/stats');
    expect(stats.status === 200 && stats.data.total >= 2, 'Statistiques admin attendues', stats);
    const exp = await fetch(`${API}/external-creators/admin/export?country=FR,BE&minFollowers=1`, { headers: { Authorization: `Bearer ${brand.idToken}` } });
    const csvOut = await exp.text();
    expect(exp.status === 200 && csvOut.replace(/^\uFEFF/, '').startsWith('email;prenom;pseudo') && csvOut.includes(extEmail) && csvOut.includes(`be-${RUN}@needcreator-test.com`), 'Export CSV attendu avec les créateurs FR et BE', { status: exp.status, data: csvOut.slice(0, 200) });
    const unsub = new FormData(); unsub.append('file', new File([`be-${RUN}@needcreator-test.com\n`], 'desabonnes.csv', { type: 'text/csv' }));
    const un = await brandApi('POST', '/external-creators/admin/unsubscribes', unsub, { form: true });
    expect(un.status === 200 && un.data.updated === 1, 'Import des désabonnés attendu : 1 retiré', un);
    const exp2 = await fetch(`${API}/external-creators/admin/export?country=FR,BE`, { headers: { Authorization: `Bearer ${brand.idToken}` } }).then(r => r.text());
    expect(!exp2.includes(`be-${RUN}@needcreator-test.com`), 'Un désabonné ne doit plus être exporté', { status: 200, data: exp2.slice(0, 200) });
  } finally {
    await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  }
  const pub = await fetch(`${API}/external-creators?country=FR&q=e2e_ext_${RUN}`).then(r => r.json());
  const ext = pub.creators.find(c => c.username === `e2e_ext_${RUN}`);
  expect(ext && ext.followers === 16903 && ext.instagram && !('email' in ext), 'Annuaire public : abonnés normalisés, pas d\'email', { status: 200, data: pub });
  const inv = await brandApi('POST', `/external-creators/${ext.id}/invite`, { message: 'Rejoignez-nous !' });
  expect([200, 502].includes(inv.status), 'Invitation (200) ou SMTP indisponible (502)', inv);
  if (inv.status === 200) {
    const twice = await brandApi('POST', `/external-creators/${ext.id}/invite`, {});
    expect(twice.status === 429, 'Une seconde invitation immédiate doit être refusée (délai de 14 jours)', twice);
  }
  const wrong = await fetch(`${API}/external-creators/${ext.slug}/optout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'autre@exemple.fr' }) });
  expect(wrong.status === 200, 'Retrait : réponse générique attendue', { status: wrong.status, data: null });
  const still = await fetch(`${API}/external-creators/${ext.slug}`).then(r => r.status);
  expect(still === 200, 'Un mauvais email ne doit pas retirer le profil', { status: still, data: null });
  // Inscription du créateur avec le même email → profil rattaché, réseaux pré-remplis, disparaît de l'annuaire
  const fu = await firebaseUser(extEmail);
  const xApi = client(fu.idToken);
  const reg = await xApi('POST', '/auth/register/creator', { acceptTerms: true, email: extEmail, name: 'Ext Test', bio: '', niches: ['tech'], minPrice: 80 });
  expect(reg.status === 201, 'Inscription du créateur référencé échouée', reg);
  extraCleanup.push({ userId: reg.data.user.id, uid: fu.uid });
  await new Promise(r => setTimeout(r, 1500));
  const me = await xApi('GET', '/auth/profile');
  expect((me.data.user.profile.socials || []).some(s => s.network === 'instagram' && s.followers === 16903), 'Les réseaux du profil référencé devraient être pré-remplis', me);
  const gone = await fetch(`${API}/external-creators/${ext.slug}`).then(r => r.status);
  expect(gone === 404, 'Un créateur inscrit ne doit plus apparaître dans l\'annuaire externe', { status: gone, data: null });
  // Le profil BE, désabonné via l'import mailing, n'est plus visible publiquement
  const beGone = await fetch(`${API}/external-creators/e2e_be_${RUN}`).then(r => r.status);
  expect(beGone === 404, 'Un désabonné (retiré) ne doit plus être visible', { status: beGone, data: null });
  await mongoose.connection.db.collection('externalcreators').deleteMany({ username: { $in: [`e2e_ext_${RUN}`, `e2e_be_${RUN}`, `e2e_us_${RUN}`] } });
  return 'import dédoublonné et borné à l\'Europe, annuaire sans email, invitation limitée, retrait, rattachement à l\'inscription';
});

await step('Factures : émises à la validation (créateur → marque par mandat, commission NeedCreator)', async () => {
  let brandInv, creatorInv;
  for (let i = 0; i < 20; i++) { brandInv = await brandApi('GET', '/invoices'); if (brandInv.data.invoices?.some(x => String(x.deliveryId) === delivery._id)) break; await sleep(500); }
  const mission = brandInv.data.invoices.find(x => String(x.deliveryId) === delivery._id && x.kind === 'creator_to_brand');
  expect(brandInv.status === 200 && mission && /^CR-[A-Z0-9]{6}-\d{4}-\d{4}$/.test(mission.number) && mission.mandate === true && mission.totals.vatRate === 0 && mission.totals.ht === 260 && mission.totals.ttc === 260 && /293 B/.test(mission.vatNote || ''), 'Facture créateur → marque attendue (franchise : 260 € sans TVA, mention 293 B)', brandInv);
  expect(!brandInv.data.invoices.some(x => x.kind === 'commission'), 'La marque ne doit pas voir les factures de commission', brandInv);
  creatorInv = await creatorApi('GET', '/invoices');
  const com = creatorInv.data.invoices.find(x => String(x.deliveryId) === delivery._id && x.kind === 'commission');
  expect(com && /^NC-F-\d{4}-\d{6}$/.test(com.number) && com.totals.ttc === 26 && com.totals.vatRate === 20 && Math.abs(com.totals.ht - 21.67) < 0.02, 'Facture de commission attendue (26 € TTC = 21,67 HT + TVA)', creatorInv);
  const pdf = await creatorApi('GET', `/invoices/${mission._id}`);
  expect(pdf.status === 200 && /^https?:\/\//.test(pdf.data.invoice.pdfUrl), 'Lien PDF de la facture attendu', pdf);
  const forbidden = await c2Api('GET', `/invoices/${mission._id}`);
  expect(forbidden.status === 403, 'Un autre créateur ne doit pas accéder à la facture', forbidden);
  const det = await brandApi('GET', `/deliveries/${delivery._id}`);
  expect(det.data.delivery.invoices?.length === 1 && det.data.delivery.invoices[0].kind === 'creator_to_brand', 'La mission devrait lister la facture côté marque', det);
  // Relevé mensuel (PDF à la volée) et avoir admin sur la facture de commission
  const month = new Date().toISOString().slice(0, 7);
  const st = await fetch(`${API}/invoices/statement?month=${month}`, { headers: { Authorization: `Bearer ${creator.idToken}` } });
  const stBuf = Buffer.from(await st.arrayBuffer());
  expect(st.status === 200 && (st.headers.get('content-type') || '').includes('application/pdf') && stBuf.slice(0, 4).toString() === '%PDF', 'Le relevé mensuel du créateur devrait être un PDF', { status: st.status, data: { type: st.headers.get('content-type'), size: stBuf.length } });
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  try {
    const all = await brandApi('GET', '/admin/invoices');
    expect(all.status === 200 && all.data.invoices.some(x => x._id === com._id), 'L\'admin devrait lister la facture de commission', all);
    const credit = await brandApi('POST', `/admin/invoices/${com._id}/credit`, { reason: 'Test avoir' });
    expect(credit.status === 200 && credit.data.credit.kind === 'credit_note' && /^NC-A-\d{4}-\d{6}$/.test(credit.data.credit.number) && credit.data.credit.totals.ttc === -26, 'Avoir NeedCreator attendu (−26 € TTC)', credit);
    const twice = await brandApi('POST', `/admin/invoices/${com._id}/credit`, { reason: 'Test avoir' });
    expect(twice.status === 400, 'Un second avoir sur la même facture doit être refusé', twice);
  } finally {
    await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  }
  const mine = await creatorApi('GET', '/invoices');
  expect(mine.data.invoices.some(x => x.kind === 'credit_note') && mine.data.invoices.find(x => x._id === com._id)?.creditedBy, 'Le créateur devrait voir l\'avoir et la commission annulée', mine);
  return `${mission.number} (260 €), ${com.number} (26 € TTC), relevé ${month} et avoir OK`;
});

await step('TVA : créateur assujetti → devis HT, marque paie TTC, créateur reçoit 90 % HT + TVA', async () => {
  const vat = await c2Api('PUT', '/auth/legal-info', { firstName: 'Léa', lastName: 'Test', status: 'company', companyName: 'Léa Studio', siret: '35600000000048', address: { line1: '2 rue de la Paix', postalCode: '75002', city: 'Paris', country: 'France' }, vatRegistered: true, vatNumber: 'FR40303265045', billingMandate: true });
  expect(vat.status === 200 && vat.data.legalInfo.vatRegistered === true && vat.data.legalInfo.vatNumber === 'FR40303265045', 'Statut TVA du créateur 2 non enregistré', vat);
  const badVat = await c2Api('PUT', '/auth/legal-info', { firstName: 'Léa', lastName: 'Test', status: 'company', siret: '35600000000048', address: { line1: '2 rue de la Paix', postalCode: '75002', city: 'Paris', country: 'France' }, vatRegistered: true, vatNumber: 'XX1', billingMandate: true });
  expect(badVat.status === 400, 'Un numéro de TVA invalide doit être refusé', badVat);
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const c = await brandApi('POST', '/campaigns', { title: 'Campagne TVA', description: 'Description suffisamment longue pour passer la validation de cinquante caractères minimum.', videoType: 'demo', duration: 30, deliverables: 1, budget: 100, niches: ['beauty'], applicationDeadline: deadline });
  await brandApi('POST', `/campaigns/${c.data.campaign._id}/publish`);
  const ap = await c2Api('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 100, estimatedDeliveryDays: 3 });
  expect(ap.status === 201 && ap.data.application.quote.vatRate === 20, 'Le devis devrait porter le taux de TVA du créateur', ap);
  const c2Id = (await c2Api('GET', '/auth/profile')).data.user.id;
  const sel = await brandApi('POST', `/campaigns/${c.data.campaign._id}/select/${c2Id}`);
  const p = sel.data.delivery?.payment || {};
  expect(sel.status === 200 && p.quotePrice === 100 && p.vatRate === 20 && p.amountHT === 100 && p.vatAmount === 20 && p.amount === 120 && p.creatorAmount === 108 && p.platformFee === 12 && p.platformFeeHT === 10 && p.platformFeeVat === 2, 'Montants TVA attendus : marque 120 TTC, créateur 108, commission 12 TTC (10 HT)', sel);
  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const pi = await stripe.paymentIntents.retrieve(p.stripePaymentIntentId);
  expect(pi.amount === 12000, `L'autorisation Stripe devrait être de 120 € (reçu ${pi.amount / 100})`, { status: 200, data: { amount: pi.amount } });
  await stripe.paymentIntents.cancel(p.stripePaymentIntentId).catch(() => {});
  await mongoose.connection.db.collection('deliveries').deleteMany({ campaignId: new mongoose.Types.ObjectId(c.data.campaign._id) });
  await mongoose.connection.db.collection('campaigns').deleteOne({ _id: new mongoose.Types.ObjectId(c.data.campaign._id) });
  // Retour en franchise pour les étapes suivantes (montants sans TVA)
  const back = await c2Api('PUT', '/auth/legal-info', { firstName: 'Léa', lastName: 'Test', status: 'micro', siret: '35600000000048', address: { line1: '2 rue de la Paix', postalCode: '75002', city: 'Paris', country: 'France' }, vatRegistered: false, billingMandate: true });
  expect(back.status === 200 && back.data.legalInfo.vatRegistered === false, 'Retour en franchise échoué', back);
  return 'devis 100 HT → 120 TTC payés, 108 au créateur, commission 10 HT + 2 TVA';
});

await step('Garantie de remplacement : créateur en retard → mission confiée à un autre devis, paiement libéré', async () => {
  const c2Id = (await c2Api('GET', '/auth/profile')).data.user.id;
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const c = await brandApi('POST', '/campaigns', { title: 'Campagne remplacement', description: 'Description suffisamment longue pour passer la validation de cinquante caractères minimum.', videoType: 'demo', duration: 30, deliverables: 1, budget: 120, niches: ['beauty'], applicationDeadline: deadline });
  await brandApi('POST', `/campaigns/${c.data.campaign._id}/publish`);
  const a1 = await creatorApi('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 120, estimatedDeliveryDays: 3 });
  const a2 = await c2Api('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 110, estimatedDeliveryDays: 4, proposal: 'Disponible immédiatement' });
  expect(a1.status === 201 && a2.status === 201, 'Candidatures échouées', a2);
  const sel = await brandApi('POST', `/campaigns/${c.data.campaign._id}/select/${creatorUser.id}`);
  expect(sel.status === 200, 'Sélection échouée', sel);
  const d = sel.data.delivery._id;
  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  await stripe.paymentIntents.confirm(sel.data.delivery.payment.stripePaymentIntentId, { payment_method: 'pm_card_visa' });
  await brandApi('POST', `/deliveries/${d}/confirm-payment`, {});
  const early = await brandApi('POST', `/deliveries/${d}/replacement/select/${c2Id}`);
  expect(early.status === 400, 'Le remplacement doit être refusé sans retard', early);
  // Simule 3 jours de retard puis lance les tâches planifiées (rappel + offre de remplacement)
  const deliveries = mongoose.connection.db.collection('deliveries');
  await deliveries.updateOne({ _id: new mongoose.Types.ObjectId(d) }, { $set: { productionDeadline: new Date(Date.now() - 3 * 86400000) } });
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  const jobs = await brandApi('POST', '/admin/jobs/run');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  expect(jobs.status === 200 && jobs.data.lateFlags >= 1, 'La tâche planifiée devrait signaler le retard', jobs);
  const det = await brandApi('GET', `/deliveries/${d}`);
  expect(det.data.delivery.isLate === true && det.data.delivery.replacementAvailable === true && det.data.delivery.replacement.status === 'offered', 'Retard / offre de remplacement non détectés', det);
  const cands = await brandApi('GET', `/deliveries/${d}/replacement/candidates`);
  expect(cands.status === 200 && cands.data.allowed && cands.data.candidates.length === 1 && cands.data.candidates[0].creatorId === c2Id && cands.data.candidates[0].price === 110, 'Le créateur 2 devrait être le candidat au remplacement', cands);
  const rep = await brandApi('POST', `/deliveries/${d}/replacement/select/${c2Id}`);
  expect(rep.status === 200 && rep.data.delivery && String(rep.data.delivery.creatorId) === c2Id && rep.data.delivery.payment.amount === 110 && rep.data.paymentRequired === true, 'Nouvelle mission pour le remplaçant attendue', rep);
  const old = await brandApi('GET', `/deliveries/${d}`);
  expect(old.data.delivery.status === 'rejected' && old.data.delivery.replacement.status === 'replaced' && old.data.delivery.payment.status === 'refunded', 'L\'ancienne mission devrait être close et son paiement libéré', old);
  const pi = await stripe.paymentIntents.retrieve(sel.data.delivery.payment.stripePaymentIntentId);
  expect(pi.status === 'canceled', `L'autorisation Stripe devrait être annulée (statut ${pi.status})`, { status: 200, data: { status: pi.status } });
  const camp = await brandApi('GET', `/campaigns/${c.data.campaign._id}`);
  const selectedIds = (camp.data.campaign.selectedCreators || []).map(x => String(x._id || x));
  expect(selectedIds.includes(c2Id) && !selectedIds.includes(creatorUser.id), 'La campagne devrait avoir le remplaçant comme sélectionné', camp);
  const lateStat = await users.findOne({ _id: new mongoose.Types.ObjectId(creatorUser.id) }, { projection: { 'profile.stats.lateDeliveries': 1 } });
  expect(lateStat?.profile?.stats?.lateDeliveries >= 1, 'Le retard devrait être compté sur le créateur', { status: 200, data: lateStat });
  await deliveries.deleteMany({ campaignId: new mongoose.Types.ObjectId(c.data.campaign._id) });
  await mongoose.connection.db.collection('campaigns').deleteOne({ _id: new mongoose.Types.ObjectId(c.data.campaign._id) });
  return `retard signalé, autorisation ${pi.status}, mission confiée au créateur 2 (110 €)`;
});

await step('Garantie de remplacement sans autre devis : retrait de la mission, campagne rouverte, blocage après N retraits', async () => {
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const c = await brandApi('POST', '/campaigns', { title: 'Campagne retrait', description: 'Description suffisamment longue pour passer la validation de cinquante caractères minimum.', videoType: 'demo', duration: 30, deliverables: 1, budget: 100, niches: ['beauty'], applicationDeadline: deadline });
  await brandApi('POST', `/campaigns/${c.data.campaign._id}/publish`);
  const a1 = await creatorApi('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 100, estimatedDeliveryDays: 3 });
  expect(a1.status === 201, 'Candidature échouée', a1);
  const sel = await brandApi('POST', `/campaigns/${c.data.campaign._id}/select/${creatorUser.id}`);
  expect(sel.status === 200, 'Sélection échouée', sel);
  const d = sel.data.delivery._id;
  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  await stripe.paymentIntents.confirm(sel.data.delivery.payment.stripePaymentIntentId, { payment_method: 'pm_card_visa' });
  await brandApi('POST', `/deliveries/${d}/confirm-payment`, {});
  const early = await brandApi('POST', `/deliveries/${d}/replacement/withdraw`);
  expect(early.status === 400, 'Le retrait doit être refusé sans retard', early);
  const deliveries = mongoose.connection.db.collection('deliveries');
  await deliveries.updateOne({ _id: new mongoose.Types.ObjectId(d) }, { $set: { productionDeadline: new Date(Date.now() - 3 * 86400000) } });
  const cands = await brandApi('GET', `/deliveries/${d}/replacement/candidates`);
  expect(cands.status === 200 && cands.data.allowed && cands.data.candidates.length === 0, 'Aucun autre devis attendu', cands);
  const wd = await brandApi('POST', `/deliveries/${d}/replacement/withdraw`);
  expect(wd.status === 200 && String(wd.data.campaignId) === c.data.campaign._id, 'Retrait échoué', wd);
  const old = await brandApi('GET', `/deliveries/${d}`);
  expect(old.data.delivery.status === 'rejected' && old.data.delivery.payment.status === 'refunded', 'La mission devrait être close et le paiement libéré', old);
  const pi = await stripe.paymentIntents.retrieve(sel.data.delivery.payment.stripePaymentIntentId);
  expect(pi.status === 'canceled', `L'autorisation Stripe devrait être annulée (statut ${pi.status})`, { status: 200, data: { status: pi.status } });
  const camp = await brandApi('GET', `/campaigns/${c.data.campaign._id}`);
  expect(camp.data.campaign.status === 'active' && !(camp.data.campaign.selectedCreators || []).length, 'La campagne devrait être rouverte sans créateur sélectionné', camp);
  // Blocage : avec un plafond de 1 retrait, le créateur (2 retraits) ne peut plus candidater ; remis à 3 ensuite
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  try { await brandApi('PUT', '/admin/settings/maxLateWithdrawals', { value: 1 }); } finally { await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } }); }
  const prof = await creatorApi('GET', '/auth/profile');
  expect(prof.data.user.canApply === false && prof.data.user.applyBlockers.some(b => /suspendues/.test(b)), 'Le créateur devrait être bloqué après trop de retraits', prof);
  const blocked = await creatorApi('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 100, estimatedDeliveryDays: 3 });
  expect(blocked.status === 403, 'La candidature devrait être refusée', blocked);
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  try { await brandApi('PUT', '/admin/settings/maxLateWithdrawals', { value: 3 }); } finally { await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } }); }
  const prof2 = await creatorApi('GET', '/auth/profile');
  expect(prof2.data.user.canApply === true, 'Le créateur devrait pouvoir candidater à nouveau', prof2);
  await deliveries.deleteMany({ campaignId: new mongoose.Types.ObjectId(c.data.campaign._id) });
  await mongoose.connection.db.collection('campaigns').deleteOne({ _id: new mongoose.Types.ObjectId(c.data.campaign._id) });
  return `mission retirée, autorisation ${pi.status}, campagne rouverte, blocage au-delà du plafond vérifié`;
});

await step('Marque : modèles de campagne, campagne privée sur invitation', async () => {
  const tpl = await brandApi('GET', '/campaigns/templates');
  expect(tpl.status === 200 && tpl.data.templates.length >= 5 && tpl.data.templates.every(t => t.title && t.description && t.niches?.length), 'Bibliothèque de modèles attendue', tpl);
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const c = await brandApi('POST', '/campaigns', { title: 'Lancement confidentiel', description: 'Description suffisamment longue pour passer la validation de cinquante caractères minimum.', videoType: 'demo', duration: 30, deliverables: 1, budget: 150, niches: ['beauty'], applicationDeadline: deadline, visibility: 'private' });
  expect(c.status === 201 && c.data.campaign.visibility === 'private', 'Campagne privée non créée', c);
  const pub = await brandApi('POST', `/campaigns/${c.data.campaign._id}/publish`);
  expect(pub.status === 200, 'Publication échouée', pub);
  const feed = await creatorApi('GET', '/campaigns?filter=available&limit=50');
  expect(feed.status === 200 && !feed.data.campaigns.some(x => x._id === c.data.campaign._id), 'Une campagne privée ne doit pas apparaître dans le fil', feed);
  const detail = await creatorApi('GET', `/campaigns/${c.data.campaign._id}`);
  expect(detail.status === 403, 'Une campagne privée ne doit pas être consultable sans invitation', detail);
  const apply = await creatorApi('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 150, estimatedDeliveryDays: 4 });
  expect(apply.status === 403, 'Candidature refusée sans invitation', apply);
  const inv = await brandApi('POST', `/campaigns/${c.data.campaign._id}/invite/${creatorUser.id}`, { message: 'Lancement confidentiel, on compte sur vous.' });
  expect(inv.status === 200, 'Invitation échouée', inv);
  const feed2 = await creatorApi('GET', '/campaigns?filter=available&limit=50');
  expect(feed2.data.campaigns.some(x => x._id === c.data.campaign._id), 'Après invitation, la campagne apparaît dans le fil du créateur invité', feed2);
  const detail2 = await creatorApi('GET', `/campaigns/${c.data.campaign._id}`);
  expect(detail2.status === 200 && detail2.data.campaign.visibility === 'private', 'Le créateur invité doit voir la campagne', detail2);
  const apply2 = await creatorApi('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 150, estimatedDeliveryDays: 4 });
  expect(apply2.status === 201, 'Le créateur invité doit pouvoir candidater', apply2);
  const other = await c2Api('GET', `/campaigns/${c.data.campaign._id}`);
  expect(other.status === 403, 'Un créateur non invité ne voit pas la campagne privée', other);
  await mongoose.connection.db.collection('campaigns').deleteOne({ _id: new mongoose.Types.ObjectId(c.data.campaign._id) });
  return `${tpl.data.templates.length} modèles ; campagne privée invisible puis ouverte au créateur invité`;
});

await step('Marque : équipe (invitation, membre agissant au nom de l\'entreprise, retrait)', async () => {
  const memberEmail = `e2e-member-${RUN}@needcreator-test.com`;
  const bad = await brandApi('POST', '/auth/team/invite', { email: brandEmail });
  expect(bad.status === 400, 'Inviter sa propre adresse doit être refusé', bad);
  const inv = await brandApi('POST', '/auth/team/invite', { email: memberEmail, name: 'Léo' });
  expect(inv.status === 200 && /team=/.test(inv.data.link), 'Invitation équipe échouée', inv);
  const token = inv.data.link.split('team=')[1];
  const info = await fetch(`${API}/auth/team/invitations/${token}`).then(r => r.json());
  expect(info.email === memberEmail && info.companyName, 'Infos d\'invitation attendues', { status: 200, data: info });
  const m = await firebaseUser(memberEmail);
  const mApi = client(m.idToken);
  const wrongMail = await mApi('POST', '/auth/register/brand', { acceptTerms: true, email: memberEmail, companyName: 'X', teamToken: 'mauvais' });
  expect(wrongMail.status === 400, 'Un jeton d\'invitation invalide doit être refusé', wrongMail);
  const reg = await mApi('POST', '/auth/register/brand', { acceptTerms: true, email: memberEmail, companyName: 'Peu importe', teamToken: token });
  expect(reg.status === 201, 'Inscription du membre échouée', reg);
  extraCleanup.push({ userId: reg.data.user.id, uid: m.uid });
  const prof = await mApi('GET', '/auth/profile');
  expect(prof.status === 200 && prof.data.user.id === brandUser.id && prof.data.user.actor?.email === memberEmail, 'Le membre doit agir au nom du compte propriétaire (profil = propriétaire, acteur = membre)', prof);
  const team = await brandApi('GET', '/auth/team');
  expect(team.status === 200 && team.data.members.some(x => x.email === memberEmail) && team.data.invitations.length === 0, 'Le propriétaire doit voir le membre', team);
  const forbidden = await mApi('GET', '/auth/team');
  expect(forbidden.status === 403, 'Un membre ne gère pas l\'équipe', forbidden);
  const legal = await mApi('PUT', '/auth/legal-info', { signatoryName: 'Pirate' });
  expect(legal.status === 403, 'Un membre ne modifie pas les informations administratives', legal);
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const c = await mApi('POST', '/campaigns', { title: 'Campagne créée par un membre', description: 'Description suffisamment longue pour passer la validation de cinquante caractères minimum.', videoType: 'demo', duration: 30, deliverables: 1, budget: 100, niches: ['beauty'], applicationDeadline: deadline });
  expect(c.status === 201 && String(c.data.campaign.brandId) === brandUser.id, 'La campagne du membre appartient à l\'entreprise', c);
  const ownerSees = await brandApi('GET', `/campaigns/${c.data.campaign._id}`);
  expect(ownerSees.status === 200, 'Le propriétaire voit la campagne créée par le membre', ownerSees);
  const rm = await brandApi('DELETE', `/auth/team/members/${reg.data.user.id}`);
  expect(rm.status === 200, 'Retrait du membre échoué', rm);
  const after = await mApi('GET', '/auth/profile');
  expect(after.data.user.id === reg.data.user.id && !after.data.user.actor, 'Après retrait, le membre redevient un compte indépendant', after);
  await mongoose.connection.db.collection('campaigns').deleteOne({ _id: new mongoose.Types.ObjectId(c.data.campaign._id) });
  return 'invitation, inscription rattachée, actions au nom de l\'entreprise, droits limités, retrait';
});

await step('Parrainage : codes, remise de 5 % pour la marque parrainée, bonus créateur', async () => {
  const myRef = await creatorApi('GET', '/auth/referral');
  expect(myRef.status === 200 && /^[A-Z]{2,3}-[A-Z0-9]{6}$/.test(myRef.data.code) && myRef.data.link.includes('ref='), 'Code de parrainage créateur invalide', myRef);
  const brandRef = await brandApi('GET', '/auth/referral');
  expect(brandRef.status === 200 && brandRef.data.code, 'Code de parrainage marque invalide', brandRef);

  // Créateur filleul (parrainé par notre créateur)
  const c3Email = `e2e-creator3-${RUN}@needcreator-test.com`;
  const c3 = await firebaseUser(c3Email);
  const c3Api = client(c3.idToken);
  const reg3 = await c3Api('POST', '/auth/register/creator', { acceptTerms: true, email: c3Email, name: 'Filleul', bio: '', niches: ['beauty'], minPrice: 60, referralCode: myRef.data.code });
  expect(reg3.status === 201, 'Inscription filleul échouée', reg3);
  extraCleanup.push({ userId: reg3.data.user.id, uid: c3.uid });
  await setLegalInfo(c3Api, 'creator');
  const refAfter = await creatorApi('GET', '/auth/referral');
  expect(refAfter.data.referred.some(r => r.id === reg3.data.user.id), 'Le filleul devrait apparaître', refAfter);

  // Marque filleule (parrainée par notre marque) : commission 5% sur sa 1re campagne, marraine +1 campagne remisée
  const b2Email = `e2e-brand2-${RUN}@needcreator-test.com`;
  const b2 = await firebaseUser(b2Email);
  const b2Api = client(b2.idToken);
  const regB2 = await b2Api('POST', '/auth/register/brand', { acceptTerms: true, email: b2Email, companyName: 'Marque Filleule', website: 'https://exemple.org', industry: 'beauty', referralCode: brandRef.data.code });
  expect(regB2.status === 201 && regB2.data.user.referral.discountedCampaignsLeft === 1, 'La marque filleule devrait avoir 1 campagne remisée', regB2);
  extraCleanup.push({ userId: regB2.data.user.id, uid: b2.uid });
  await setLegalInfo(b2Api, 'brand');
  const sponsor = await brandApi('GET', '/auth/profile');
  expect(sponsor.data.user.referral.discountedCampaignsLeft >= 1, 'La marque marraine devrait avoir une campagne remisée', sponsor);

  const ver = await b2Api('POST', '/auth/business-verification', { siret: '35600000000048', website: 'https://exemple.org' });
  expect(ver.status === 200 && ver.data.business.status === 'verified', 'Vérification de la marque filleule échouée', ver);
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const c = await b2Api('POST', '/campaigns', {
    title: 'Campagne marque parrainée', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.',
    videoType: 'demo', duration: 30, deliverables: 1, budget: 100, niches: ['beauty'], applicationDeadline: deadline,
  });
  expect(c.status === 201 && c.data.campaign.brandDiscountPercent === 5 && c.data.campaign.platformFeePercent === 10, 'La campagne parrainée devrait porter une remise marque de 5 % (commission inchangée)', c);
  const b2After = await b2Api('GET', '/auth/profile');
  expect(b2After.data.user.referral.discountedCampaignsLeft === 0, 'La remise devrait être consommée', b2After);

  // Le filleul (activé) livre sa première mission → bonus 10€ au parrain
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: c3Email }, { $set: { status: 'active', 'verification.portfolio': true, 'profile.ambassador.status': 'approved' } });
  for (let i = 1; i <= 3; i++) { const f = new FormData(); f.append('video', fakeVideo(`c3-${i}.mp4`)); f.append('title', `C3 ${i}`); f.append('videoType', 'demo'); await c3Api('POST', '/portfolio/upload', f, { form: true }); }
  await b2Api('POST', `/campaigns/${c.data.campaign._id}/publish`);
  const ap = await c3Api('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 100, estimatedDeliveryDays: 3 });
  expect(ap.status === 201, 'Candidature filleul échouée', ap);
  const sel = await b2Api('POST', `/campaigns/${c.data.campaign._id}/select/${reg3.data.user.id}`);
  { const p = sel.data.delivery.payment; expect(sel.status === 200 && p.quotePrice === 100 && p.discountPercent === 5 && p.amount === 95 && p.creatorAmount === 90 && p.platformFee === 5, 'Remise parrainage : la marque paie 95 % du devis (95 €), le créateur reçoit 90 % (90 €)', sel); }
  const { default: Stripe } = await import('stripe');
  await new Stripe(process.env.STRIPE_SECRET_KEY).paymentIntents.confirm(sel.data.delivery.payment.stripePaymentIntentId, { payment_method: 'pm_card_visa' });
  await b2Api('POST', `/deliveries/${sel.data.delivery._id}/confirm-payment`, {});
  const f = new FormData(); f.append('files', fakeVideo('r.mp4'));
  await c3Api('POST', `/deliveries/${sel.data.delivery._id}/upload`, f, { form: true });
  await c3Api('POST', `/deliveries/${sel.data.delivery._id}/submit`, {});
  const ok = await b2Api('POST', `/deliveries/${sel.data.delivery._id}/approve`);
  expect(ok.status === 200, 'Approbation échouée', ok);
  const earnings = await creatorApi('GET', '/auth/earnings');
  expect(earnings.status === 200 && earnings.data.bonuses.length === 1 && earnings.data.bonuses[0].amount === 10, 'Le parrain devrait avoir un bonus de 10€', earnings);
  const csv = await fetch(`${API}/auth/earnings?format=csv`, { headers: { Authorization: `Bearer ${creator.idToken}` } });
  const text = await csv.text();
  expect(csv.ok && text.includes('Bonus parrainage') && text.includes('Net créateur'), 'Export CSV incorrect', { status: csv.status, data: text.slice(0, 200) });
  // Nettoyage de la campagne filleule
  await mongoose.connection.db.collection('campaigns').deleteMany({ brandId: new mongoose.Types.ObjectId(regB2.data.user.id) });
  return `bonus ${earnings.data.bonuses[0].amount}€ (${earnings.data.bonuses[0].status}), remise filleule 5 %, CSV OK`;
});

await step('Performances des vidéos livrées (saisie manuelle) + agrégats campagne', async () => {
  const d = await brandApi('GET', `/deliveries/${delivery._id}`);
  const item = d.data.delivery.files.find(f => !f.superseded);
  const res = await creatorApi('PATCH', `/deliveries/${delivery._id}/performance`, { itemId: item._id, platform: 'tiktok', url: 'https://www.tiktok.com/@e2e/video/9', views: 12000, likes: 800, comments: 40, shares: 15 });
  expect(res.status === 200 && res.data.performance.length === 1, 'Saisie des performances échouée', res);
  const upd = await brandApi('PATCH', `/deliveries/${delivery._id}/performance`, { itemId: item._id, platform: 'tiktok', views: 15000, likes: 900, comments: 50, shares: 20 });
  expect(upd.status === 200 && upd.data.performance.length === 1 && upd.data.performance[0].views === 15000, 'La mise à jour devrait remplacer, pas dupliquer', upd);
  const camp = await brandApi('GET', `/campaigns/${campaign._id}`);
  const perf = camp.data.campaign.performance;
  expect(perf.totals.views === 15000 && perf.byCreator.length === 1 && perf.costPerThousandViews > 0, 'Agrégats de campagne incorrects', camp);
  const pub = await fetch(`${API}/portfolio/creator/${creatorUser.id}`).then(r => r.json());
  expect(pub.creator.profile.stats.deliveredViews >= 15000, 'Les vues cumulées devraient apparaître sur le profil', { status: 200, data: pub.creator.profile.stats });
  return `15 000 vues, ${perf.costPerThousandViews} € pour 1000 vues`;
});

await step('Brief IA : statut et génération (ou message clair si non configuré)', async () => {
  const st = await brandApi('GET', '/campaigns/ai-brief/status');
  expect(st.status === 200 && typeof st.data.configured === 'boolean', 'Statut IA indisponible', st);
  expect(st.data.quota?.pro === true, 'En essai Pro, le quota devrait être illimité', st);
  // Quota du plan gratuit : on simule un essai expiré
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { 'subscription.trialEndsAt': new Date(Date.now() - 1000), 'usage.aiBriefCount': 3, 'usage.aiBriefMonth': new Date().toISOString().slice(0, 7) } });
  const free = await brandApi('GET', '/campaigns/ai-brief/status');
  expect(free.data.quota?.pro === false && free.data.quota.remaining === 0, 'Le quota gratuit devrait être épuisé', free);
  const blocked = await brandApi('POST', '/campaigns/ai-brief', { productDescription: 'Sérum visage à la vitamine C, bio, fabriqué en France.' });
  expect(blocked.status === 402 && blocked.data.code === 'AI_QUOTA_EXCEEDED', 'Au-delà du quota, un 402 est attendu', blocked);
  await users.updateOne({ email: brandEmail }, { $set: { 'subscription.trialEndsAt': new Date(Date.now() + 86400000), 'usage.aiBriefCount': 0 } });
  // Résolution de configuration par fournisseur (sans appel réseau)
  const { aiConfig } = await import('../src/services/ai.js');
  const saved = { P: process.env.AI_PROVIDER, M: process.env.AI_MODEL, K: process.env.AI_API_KEY, U: process.env.AI_BASE_URL };
  Object.assign(process.env, { AI_PROVIDER: 'groq', AI_MODEL: '', AI_API_KEY: 'gsk_test', AI_BASE_URL: '' });
  expect(aiConfig().configured && aiConfig().model === 'llama-3.3-70b-versatile', 'Groq devrait être configuré avec un modèle par défaut', { status: 200, data: aiConfig() });
  Object.assign(process.env, { AI_PROVIDER: 'novita', AI_MODEL: 'meta-llama/llama-3.1-70b-instruct', AI_API_KEY: 'nv_test' });
  expect(aiConfig().configured && aiConfig().baseURL === 'https://api.novita.ai/v3/openai', 'Novita devrait utiliser l\'URL compatible OpenAI', { status: 200, data: aiConfig() });
  Object.assign(process.env, { AI_PROVIDER: 'openai-compatible', AI_BASE_URL: '' });
  expect(aiConfig().configured === false, 'openai-compatible sans AI_BASE_URL ne doit pas être considéré configuré', { status: 200, data: aiConfig() });
  process.env.AI_PROVIDER = saved.P || ''; process.env.AI_MODEL = saved.M || ''; process.env.AI_API_KEY = saved.K || ''; process.env.AI_BASE_URL = saved.U || '';
  const bad = await brandApi('POST', '/campaigns/ai-brief', { productDescription: 'court' });
  expect(bad.status === 400, 'Une description trop courte doit être refusée', bad);
  const res = await brandApi('POST', '/campaigns/ai-brief', { productDescription: 'Sérum visage à la vitamine C, bio, fabriqué en France, 29 euros. Cible : femmes 25-40 ans.', videoType: 'testimonial', platforms: ['tiktok'], niches: ['beauty'], goal: 'Publicité Meta' });
  if (!st.data.configured) {
    expect(res.status === 503 && /_API_KEY|AI_MODEL|AI_BASE_URL/.test(res.data.error), 'Sans clé, un message clair (503) est attendu', res);
    return `non configuré (${st.data.provider}) : message clair renvoyé`;
  }
  expect(res.status === 200 && res.data.brief.title.length >= 10 && res.data.brief.requirements.length >= 3, 'Brief IA invalide', res);
  return `brief généré par ${res.data.provider}/${res.data.model} : « ${res.data.brief.title} »`;
});

await step('Formulaire « Nous contacter » : validation, piège à robots, adresse de réception réglable dans l\'admin', async () => {
  const db = mongoose.connection.db;
  const pub = client(null);
  const short = await pub('POST', '/contact', { name: 'Test', email: 'visiteur@exemple.fr', subject: 'Question', message: 'trop court' });
  expect(short.status === 400, 'Un message trop court doit être refusé', short);
  const badMail = await pub('POST', '/contact', { name: 'Test', email: 'pas-un-email', subject: 'Question', message: 'Bonjour, je voudrais des informations sur vos tarifs pour les marques.' });
  expect(badMail.status === 400, 'Un email invalide doit être refusé', badMail);
  const before = await db.collection('contactmessages').countDocuments({});
  const bot = await pub('POST', '/contact', { name: 'Robot', email: 'robot@exemple.fr', subject: 'Offre SEO', message: 'Nous améliorons votre référencement pour pas cher, contactez-nous vite.', website: 'https://spam.example' });
  expect(bot.status === 201 && await db.collection('contactmessages').countDocuments({}) === before, 'Le piège à robots répond 201 sans rien enregistrer ni envoyer', bot);
  // Adresse de réception : réglage admin (adresse de test : le serveur d'envoi peut la refuser, le message reste tracé)
  await db.collection('users').updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  try {
    const target = `e2e-contact-${RUN}@needcreator-test.com`;
    const setRes = await brandApi('PUT', '/admin/settings/contactEmail', { value: target });
    expect(setRes.status === 200, 'Réglage de l\'adresse de contact échoué', setRes);
    const ok = await pub('POST', '/contact', { name: 'Camille Martin', email: `visiteur-${RUN}@needcreator-test.com`, role: 'brand', subject: `Question tarifs ${RUN}`, message: 'Bonjour, je voudrais des informations sur vos tarifs pour les marques. Merci.' });
    expect([201, 502].includes(ok.status), 'Envoi du message : 201 attendu (ou 502 si le serveur d\'envoi refuse l\'adresse de test)', ok);
    const doc = await db.collection('contactmessages').findOne({ subject: `Question tarifs ${RUN}` });
    expect(doc && doc.sentTo === target && doc.role === 'brand' && doc.name === 'Camille Martin', 'Le message doit être tracé avec l\'adresse de réception du réglage', { status: 200, data: doc });
    await db.collection('contactmessages').deleteMany({ subject: `Question tarifs ${RUN}` });
    return `validation, piège à robots, réception sur l'adresse du réglage (${ok.status === 201 ? 'email envoyé' : 'adresse de test refusée par le serveur d\'envoi, message tracé'})`;
  } finally {
    await db.collection('settings').deleteOne({ key: 'contactEmail' });
    await db.collection('users').updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  }
});

await step('Aperçu intégré des publications (livraisons par lien, prospection) : adresses reconnues, repli sans agrément', async () => {
  const { parseSocialUrl } = await import('../src/services/embeds.js');
  expect(parseSocialUrl('https://www.instagram.com/reel/DdWYcVvIEba/?igsh=abc')?.url === 'https://www.instagram.com/reel/DdWYcVvIEba/' && parseSocialUrl('https://www.instagram.com/un.profil/') === null && parseSocialUrl('https://www.tiktok.com/@a.b/video/6718335390845095173')?.provider === 'tiktok' && parseSocialUrl('https://youtu.be/dQw4w9WgXcQ')?.id === 'dQw4w9WgXcQ' && parseSocialUrl('https://exemple.com/p/abc') === null, 'Lecture des adresses de publication incorrecte', { status: 200, data: parseSocialUrl('https://www.instagram.com/reel/DdWYcVvIEba/') });
  const anon = await client(null)('GET', '/embeds?url=' + encodeURIComponent('https://www.instagram.com/reel/DdWYcVvIEba/'));
  expect(anon.status === 401, 'L\'aperçu est réservé aux utilisateurs connectés', anon);
  const bad = await brandApi('GET', '/embeds?url=' + encodeURIComponent('https://exemple.com/article'));
  expect(bad.status === 422, 'Une adresse non reconnue doit être refusée', bad);
  const ig = await brandApi('GET', '/embeds?url=' + encodeURIComponent('https://www.instagram.com/reel/DdWYcVvIEba/?utm=x'));
  expect(ig.status === 200 && ig.data.embed.provider === 'instagram' && ig.data.embed.url === 'https://www.instagram.com/reel/DdWYcVvIEba/' && ['oembed', 'fallback'].includes(ig.data.embed.source) && !/<script/i.test(ig.data.embed.html || ''), 'Aperçu Instagram attendu (oEmbed si accordé, repli sinon), sans script', ig);
  const yt = await brandApi('GET', '/embeds?url=' + encodeURIComponent('https://youtube.com/shorts/dQw4w9WgXcQ'));
  expect(yt.status === 200 && yt.data.embed.provider === 'youtube' && yt.data.embed.id === 'dQw4w9WgXcQ', 'Aperçu YouTube attendu', yt);
  return `Instagram : ${ig.data.embed.source}${ig.data.embed.reason ? ` (${ig.data.embed.reason})` : ''}${ig.data.embed.authorName ? `, auteur @${ig.data.embed.authorName}` : ''} ; YouTube : ${yt.data.embed.source}`;
});

await step('Brief depuis une URL produit : page publique, reprise par une marque connectée et à l\'inscription', async () => {
  const db = mongoose.connection.db;
  const st = await brandApi('GET', '/campaigns/ai-brief/status');
  // Page produit factice servie en local (le serveur de test tourne avec ALLOW_LOCAL_FETCH=1)
  const page = `<!doctype html><html><head><title>Gourde isotherme Nomade 750 ml – Boutique Test</title>
<meta property="og:description" content="Gourde inox double paroi, garde 24 h au froid, 12 h au chaud. Sans BPA, fabriquée en Europe.">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'Gourde isotherme Nomade 750 ml', brand: { '@type': 'Brand', name: 'Boutique Test' }, description: 'Gourde inox double paroi, garde 24 h au froid et 12 h au chaud. Sans BPA, bouchon sport, fabriquée en Europe. Idéale randonnée, sport et bureau.', image: 'https://exemple.test/gourde.jpg', offers: { '@type': 'Offer', price: '29.90', priceCurrency: 'EUR' } })}</script>
</head><body><h1>Gourde isotherme Nomade 750 ml</h1><p>Gourde inox double paroi, garde 24 h au froid et 12 h au chaud. Sans BPA, bouchon sport, fabriquée en Europe. Idéale randonnée, sport et bureau. Livraison offerte dès 40 €.</p></body></html>`;
  const srv = http.createServer((req, res) => { if (req.url === '/blocked') { res.writeHead(403); return res.end('no'); } res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const pubApi = client(null);
  try {
    const bad = await pubApi('POST', '/product-briefs', { url: 'pas une adresse' });
    expect(bad.status === 400, 'Une adresse invalide doit être refusée (400)', bad);
    const res = await pubApi('POST', '/product-briefs', { url: `${base}/products/gourde` });
    if (!st.data.configured) {
      expect(res.status === 503, 'Sans IA, un 503 clair est attendu', res);
      return 'IA non configurée : message clair renvoyé';
    }
    expect(res.status === 201 && res.data.brief.id && res.data.brief.product.name === 'Gourde isotherme Nomade 750 ml' && res.data.brief.product.price === 29.9, 'Fiche produit non lue depuis le JSON-LD', res);
    const b = res.data.brief;
    expect(b.analysis.angles.length === 3 && b.analysis.angles.every(a => a.hook.length >= 5) && b.brief.title.length >= 10 && b.brief.requirements.length >= 3 && b.budget.mid >= 50, 'Analyse ou brief incomplets', res);
    const blocked = await pubApi('POST', '/product-briefs', { url: `${base}/blocked` });
    expect(blocked.status === 422 && /bloque/.test(blocked.data.error) && blocked.data.code === 'UNREADABLE', 'Un site qui bloque doit renvoyer un message clair et le code UNREADABLE', blocked);
    const short = await pubApi('POST', '/product-briefs', { url: `${base}/blocked`, description: 'trop court' });
    expect(short.status === 400, 'Une description manuelle trop courte doit être refusée', short);
    const manual = await pubApi('POST', '/product-briefs', { url: `${base}/blocked`, name: 'Savon surgras karité', brand: 'Marque Test', price: 9.9, description: 'Savon surgras enrichi en beurre de karité, peaux sèches et sensibles, parfum doux, fabriqué en Provence, 250 g.' });
    expect(manual.status === 201 && manual.data.brief.product.name === 'Savon surgras karité' && manual.data.brief.product.price === 9.9 && manual.data.brief.analysis.angles.length === 3, 'Repli manuel : brief attendu depuis la description saisie', manual);
    await db.collection('productbriefs').deleteOne({ _id: new mongoose.Types.ObjectId(manual.data.brief.id) });
    const get = await pubApi('GET', `/product-briefs/${b.id}`);
    expect(get.status === 200 && get.data.brief.claimed === false && get.data.brief.brief.title === b.brief.title, 'Lecture publique du brief attendue', get);
    // Marque connectée : campagne brouillon
    const claim = await brandApi('POST', `/product-briefs/${b.id}/claim`);
    expect(claim.status === 200 && claim.data.campaignId, 'Reprise du brief par une marque connectée échouée', claim);
    const camp = await brandApi('GET', `/campaigns/${claim.data.campaignId}`);
    expect(camp.status === 200 && camp.data.campaign.status === 'draft' && camp.data.campaign.title === b.brief.title && camp.data.campaign.brief.requirements.length >= 3 && camp.data.campaign.budget?.total === b.budget.mid && /gourde/i.test(camp.data.campaign.brief.productDescription), 'Campagne brouillon incomplète', camp);
    const again = await brandApi('POST', `/product-briefs/${b.id}/claim`);
    expect(again.status === 200 && String(again.data.campaignId) === String(claim.data.campaignId), 'Une seconde reprise renvoie la même campagne', again);
    await db.collection('campaigns').deleteOne({ _id: new mongoose.Types.ObjectId(claim.data.campaignId) });
    // Nouvelle marque inscrite avec le lien du brief : campagne brouillon prête à la réponse d'inscription
    const res2 = await pubApi('POST', '/product-briefs', { url: `${base}/products/gourde?v=2` });
    expect(res2.status === 201, 'Second brief attendu', res2);
    const email = `e2e-brief-${RUN}@needcreator-test.com`;
    const fu = await firebaseUser(email);
    const reg = await client(fu.idToken)('POST', '/auth/register/brand', { acceptTerms: true, email, companyName: 'Boutique Test', country: 'FR', language: 'fr', briefId: res2.data.brief.id });
    expect(reg.status === 201 && reg.data.briefCampaignId, 'Inscription avec brief : campagne brouillon attendue dans la réponse', reg);
    const pb2 = await pubApi('GET', `/product-briefs/${res2.data.brief.id}`);
    expect(pb2.data.brief.claimed === true && String(pb2.data.brief.campaignId) === String(reg.data.briefCampaignId), 'Le brief doit être marqué repris', pb2);
    await db.collection('campaigns').deleteMany({ brandId: new mongoose.Types.ObjectId(reg.data.user.id) });
    await db.collection('notifications').deleteMany({ userId: new mongoose.Types.ObjectId(reg.data.user.id) });
    await db.collection('users').deleteOne({ _id: new mongoose.Types.ObjectId(reg.data.user.id) });
    await admin.auth().deleteUser(fu.uid).catch(() => {});
    await db.collection('productbriefs').deleteMany({ _id: { $in: [b.id, res2.data.brief.id].map(id => new mongoose.Types.ObjectId(id)) } });
    return `« ${b.brief.title.slice(0, 50)} », ${b.analysis.angles.length} angles, budget ${b.budget.mid} €, campagne brouillon (marque connectée et à l'inscription)`;
  } finally { srv.close(); }
});

await step('Pack prêt à diffuser : commande, paiement, formats 9:16 + 1:1, vignette', async () => {
  const { makeSampleVideo } = await import('../src/services/video.js');
  const sample = await makeSampleVideo(2);
  const fs = await import('fs');
  const realVideo = new File([fs.readFileSync(sample)], 'vraie-video.mp4', { type: 'video/mp4' });
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const c = await brandApi('POST', '/campaigns', {
    title: 'Campagne pack prêt à diffuser', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.',
    videoType: 'demo', duration: 30, deliverables: 1, budget: 100, niches: ['beauty'], applicationDeadline: deadline, deliveryTypes: ['file'],
  });
  await brandApi('POST', `/campaigns/${c.data.campaign._id}/publish`);
  await creatorApi('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 100, estimatedDeliveryDays: 3 });
  const sel = await brandApi('POST', `/campaigns/${c.data.campaign._id}/select/${creatorUser.id}`);
  const d = sel.data.delivery._id;
  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  await stripe.paymentIntents.confirm(sel.data.delivery.payment.stripePaymentIntentId, { payment_method: 'pm_card_visa' });
  await brandApi('POST', `/deliveries/${d}/confirm-payment`, {});
  const f = new FormData(); f.append('files', realVideo);
  const up = await creatorApi('POST', `/deliveries/${d}/upload`, f, { form: true });
  expect(up.status === 200, 'Upload de la vraie vidéo échoué', up);
  await creatorApi('POST', `/deliveries/${d}/submit`, {});
  // Score de conformité calculé en arrière-plan à la soumission
  let comp = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 2000));
    comp = (await brandApi('GET', `/deliveries/${d}`)).data.delivery.compliance;
    if (comp && comp.status !== 'pending') break;
  }
  expect(comp && comp.status === 'done' && typeof comp.score === 'number', `Conformité attendue (statut ${comp?.status}, ${comp?.summary || ''})`, { status: 200, data: comp });
  const item = (k) => comp.items.find(i => i.key === k);
  expect(item('count')?.status === 'ok' && item('audio')?.status === 'ok' && item('duration')?.status === 'fail', 'Points de conformité inattendus (2 s livrées pour 30 s attendues, son présent)', { status: 200, data: comp.items });
  const tooEarlyBefore = await brandApi('POST', `/deliveries/${d}/ready-pack`, { formats: ['9:16'] });
  expect(tooEarlyBefore.status === 400, 'Le pack ne doit pas être commandable avant validation', tooEarlyBefore);
  await brandApi('POST', `/deliveries/${d}/approve`);

  const order = await brandApi('POST', `/deliveries/${d}/ready-pack`, { formats: ['9:16', '1:1'], thumbnail: true, subtitles: false });
  expect(order.status === 200 && order.data.price === 18 && order.data.readyPack.priceHT === 15 && order.data.readyPack.status === 'awaiting_payment' && order.data.clientSecret, 'Commande du pack incorrecte (15 € HT = 18 € TTC attendus)', order);
  const notPaid = await brandApi('POST', `/deliveries/${d}/ready-pack/confirm`, {});
  expect(notPaid.status === 400, 'La confirmation sans paiement doit échouer', notPaid);
  await stripe.paymentIntents.confirm(order.data.readyPack.stripePaymentIntentId, { payment_method: 'pm_card_visa' });
  const conf = await brandApi('POST', `/deliveries/${d}/ready-pack/confirm`, {});
  expect(conf.status === 200 && conf.data.readyPack.status === 'queued', 'Confirmation du pack échouée', conf);

  let rp = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const det = await brandApi('GET', `/deliveries/${d}`);
    rp = det.data.delivery.readyPack;
    if (['done', 'failed'].includes(rp.status)) break;
  }
  expect(rp && rp.status === 'done', `Le pack devrait être terminé (statut ${rp?.status}, ${rp?.error || ''})`, { status: 200, data: rp });
  const videos = rp.outputs.filter(o => o.kind === 'video' && o.url);
  const thumbs = rp.outputs.filter(o => o.kind === 'thumbnail' && o.url);
  expect(videos.length === 2 && thumbs.length === 1, 'Attendu : 2 vidéos + 1 vignette', { status: 200, data: rp.outputs });
  const v916 = videos.find(v => v.format === '9:16');
  expect(v916.width === 1080 && v916.height === 1920, 'Format 9:16 incorrect', { status: 200, data: v916 });
  const head = await fetch(v916.url, { headers: { Range: 'bytes=0-64' } });
  expect(head.ok, `La vidéo générée n'est pas téléchargeable (HTTP ${head.status})`);
  fs.unlinkSync(sample);
  return `2 formats + vignette générés et téléchargeables, 15 € payés · conformité ${comp.score}/100 (${comp.summary})`;
});

await step('Shopify : statut, installation (non configurée → message clair), signature HMAC', async () => {
  const st = await brandApi('GET', '/integrations/shopify/status');
  expect(st.status === 200 && st.data.connected === false, 'Statut Shopify incorrect', st);
  const inst = await brandApi('POST', '/integrations/shopify/install', { shop: 'ma-boutique' });
  if (!st.data.configured) {
    expect(inst.status === 503 && /SHOPIFY_API_KEY/.test(inst.data.error), 'Sans configuration, un message clair (503) est attendu', inst);
  } else {
    expect(inst.status === 200 && inst.data.url.includes('ma-boutique.myshopify.com/admin/oauth/authorize'), 'URL d\'installation incorrecte', inst);
  }
  const forbidden = await creatorApi('GET', '/integrations/shopify/status');
  expect(forbidden.status === 403, 'Réservé aux marques', forbidden);
  // Vérification de signature (fonction pure)
  const { verifyShopifyHmac, normalizeShop, signState, verifyState } = await import('../src/services/shopify.js');
  const crypto = await import('crypto');
  const secret = 'test-secret';
  const query = { code: 'abc', shop: 'ma-boutique.myshopify.com', state: 'x', timestamp: '1700000000' };
  const message = Object.keys(query).sort().map(k => `${k}=${query[k]}`).join('&');
  const hmac = crypto.createHmac('sha256', secret).update(message).digest('hex');
  expect(verifyShopifyHmac({ ...query, hmac }, secret) === true, 'HMAC valide refusé');
  expect(verifyShopifyHmac({ ...query, hmac: 'deadbeef' }, secret) === false, 'HMAC invalide accepté');
  expect(normalizeShop('Ma-Boutique') === 'ma-boutique.myshopify.com' && normalizeShop('bad domain!') === null, 'Normalisation du domaine incorrecte');
  const state = signState({ uid: 'u1', shop: 'ma-boutique.myshopify.com' });
  expect(verifyState(state)?.uid === 'u1' && verifyState(state + 'x') === null, 'State signé incorrect');
  return st.data.configured ? 'configurée, URL OAuth générée' : 'non configurée : message clair, signatures vérifiées';
});

await step('Gifting : ouvert à toutes les marques, frais de service en gratuit, aucun en Pro, opt-in créateur', async () => {
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  // La marque est en essai Pro : on la passe en gratuit pour vérifier les frais de service, puis on la remet en Pro
  const usersCol = mongoose.connection.db.collection('users');
  const proSub = (await usersCol.findOne({ email: brandEmail }, { projection: { subscription: 1 } })).subscription;
  await usersCol.updateOne({ email: brandEmail }, { $set: { 'subscription.plan': 'free', 'subscription.status': 'none' } });
  const tooCheap = await brandApi('POST', '/campaigns', { title: 'Gifting valeur trop faible', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.', videoType: 'unboxing', duration: 30, deliverables: 1, niches: ['beauty'], applicationDeadline: deadline, type: 'gifting', giftingProductName: 'Échantillon', giftingProductValue: 10 });
  expect(tooCheap.status === 403 && /30/.test(tooCheap.data.error), 'Un produit < 30 € doit être refusé', tooCheap);
  const c = await brandApi('POST', '/campaigns', { title: 'Campagne gifting sérum offert', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.', videoType: 'unboxing', duration: 30, deliverables: 2, niches: ['beauty'], applicationDeadline: deadline, type: 'gifting', giftingProductName: 'Coffret sérum', giftingProductValue: 45 });
  expect(c.status === 201 && c.data.campaign.type === 'gifting' && !c.data.campaign.budget?.total && c.data.campaign.gifting?.feePerVideo === 5, 'Création gifting (marque gratuite, frais 5 € HT/vidéo) échouée', c);
  await brandApi('POST', `/campaigns/${c.data.campaign._id}/publish`);
  // Le créateur (niveau Nouveau) accepte le gifting par défaut ; s'il refuse, la campagne disparaît de son feed
  const off = await creatorApi('PATCH', '/auth/profile', { preferences: { acceptGifting: false } });
  expect(off.status === 200 && off.data.user.acceptsGifting === false, 'Désactivation du gifting échouée', off);
  const hidden = await creatorApi('GET', '/campaigns');
  expect(!hidden.data.campaigns.some(x => x._id === c.data.campaign._id), 'Le gifting devrait être masqué quand le créateur le refuse', hidden);
  const refused = await creatorApi('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 0, estimatedDeliveryDays: 4 });
  expect(refused.status === 403, 'Candidature gifting refusée si opt-out', refused);
  await creatorApi('PATCH', '/auth/profile', { preferences: { acceptGifting: true } });
  const ap = await creatorApi('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 999, estimatedDeliveryDays: 4 });
  expect(ap.status === 201 && ap.data.application.price === 0, 'Le prix d\'une candidature gifting est forcé à 0', ap);
  const sel = await brandApi('POST', `/campaigns/${c.data.campaign._id}/select/${creatorUser.id}`);
  expect(sel.status === 200 && sel.data.delivery.payment.amount === 12 && sel.data.delivery.payment.amountHT === 10 && sel.data.delivery.payment.creatorAmount === 0 && sel.data.delivery.payment.platformFee === 12, 'Frais gifting attendus : 5 € HT × 2 vidéos = 10 € HT, 12 € TTC, créateur 0 €', sel);
  const { default: Stripe } = await import('stripe');
  await new Stripe(process.env.STRIPE_SECRET_KEY).paymentIntents.confirm(sel.data.delivery.payment.stripePaymentIntentId, { payment_method: 'pm_card_visa' });
  await brandApi('POST', `/deliveries/${sel.data.delivery._id}/confirm-payment`, {});
  const f = new FormData(); f.append('files', fakeVideo('g1.mp4')); f.append('files', fakeVideo('g2.mp4'));
  await creatorApi('POST', `/deliveries/${sel.data.delivery._id}/upload`, f, { form: true });
  await creatorApi('POST', `/deliveries/${sel.data.delivery._id}/submit`, {});
  const ok = await brandApi('POST', `/deliveries/${sel.data.delivery._id}/approve`);
  expect(ok.status === 200 && ok.data.delivery.payment.status === 'released' && !ok.data.warning, 'Approbation gifting : frais encaissés, rien à reverser', ok);
  // Marque Pro : gifting sans frais de service, rien à payer, sélection immédiate
  await usersCol.updateOne({ email: brandEmail }, { $set: { subscription: proSub } });
  const free = await brandApi('POST', '/campaigns', { title: 'Deuxième gifting du mois', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.', videoType: 'unboxing', duration: 30, deliverables: 1, niches: ['beauty'], applicationDeadline: deadline, type: 'gifting', giftingProductName: 'Crème', giftingProductValue: 40 });
  expect(free.status === 201 && free.data.campaign.gifting?.feePerVideo === 0, 'Une marque Pro ne doit pas avoir de frais de service gifting', free);
  await brandApi('POST', `/campaigns/${free.data.campaign._id}/publish`);
  const ap2 = await creatorApi('POST', `/campaigns/${free.data.campaign._id}/apply`, { price: 0, estimatedDeliveryDays: 4 });
  expect(ap2.status === 201, 'Candidature gifting Pro échouée', ap2);
  const sel2 = await brandApi('POST', `/campaigns/${free.data.campaign._id}/select/${creatorUser.id}`);
  expect(sel2.status === 200 && sel2.data.delivery.payment.amount === 0 && !sel2.data.delivery.payment.stripePaymentIntentId && sel2.data.delivery.payment.status === 'released' && !sel2.data.warning && sel2.data.paymentRequired === false, 'Gifting Pro : aucun paiement à effectuer', sel2);
  // Limite mensuelle : 2 campagnes gifting max
  const third = await brandApi('POST', '/campaigns', { title: 'Troisième gifting du mois', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.', videoType: 'unboxing', duration: 30, deliverables: 1, niches: ['beauty'], applicationDeadline: deadline, type: 'gifting', giftingProductName: 'Crème', giftingProductValue: 40 });
  expect(third.status === 403 && /limite/i.test(third.data.error), 'La 3e campagne gifting du mois doit être refusée', third);
  return 'gifting : marque gratuite 10 € de frais encaissés, marque Pro 0 € sans paiement, créateur 0 €, opt-in respecté, limite mensuelle active';
});

await step('Abonnement Pro : session Stripe Checkout, synchronisation, portail', async () => {
  const st = await brandApi('GET', '/billing/status');
  expect(st.status === 200 && st.data.plan === 'pro' && st.data.status === 'trialing' && st.data.feePercent === st.data.standardFeePercent, 'Statut abonnement incorrect (Pro ne modifie plus la commission)', st);
  const co = await brandApi('POST', '/billing/checkout');
  expect(co.status === 200 && /checkout\.stripe\.com/.test(co.data.url), 'Session Checkout non créée', co);
  const sync = await brandApi('POST', '/billing/sync');
  expect(sync.status === 200 && sync.data.plan === 'pro', 'Synchronisation échouée', sync);
  return `checkout ${co.data.sessionId}`;
});

await step('Signalement : créateur → campagne, traitement admin', async () => {
  const rep = await creatorApi('POST', '/reports', { targetType: 'campaign', targetId: campaign._id, reason: 'free_work', details: 'La marque demande des vidéos supplémentaires non prévues.' });
  expect(rep.status === 201, 'Signalement échoué', rep);
  const dup = await creatorApi('POST', '/reports', { targetType: 'campaign', targetId: campaign._id, reason: 'spam' });
  expect(dup.status === 400, 'Un double signalement doit être refusé', dup);
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  const list = await brandApi('GET', '/admin/reports');
  expect(list.status === 200 && list.data.reports.some(r => r._id === rep.data.report._id), 'Le signalement devrait apparaître dans l\'admin', list);
  const done = await brandApi('POST', `/admin/reports/${rep.data.report._id}/resolve`, { action: 'dismiss' });
  await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  expect(done.status === 200 && done.data.report.status === 'dismissed', 'Traitement du signalement échoué', done);
  await mongoose.connection.db.collection('reports').deleteMany({ reporterId: new mongoose.Types.ObjectId(creatorUser.id) });
  return 'signalé, listé, classé sans suite';
});

await step('Avis : marque → créateur et créateur → marque', async () => {
  const r1 = await brandApi('POST', `/reviews/campaign/${campaign._id}`, { rating: 5, comment: 'Excellent travail', communication: 5, quality: 5, timeliness: 4, professionalism: 5 });
  expect(r1.status === 201 && !r1.data.review.publishedAt && r1.data.review.publishDeadline, 'Avis marque échoué (devrait être caché en attendant l\'avis du créateur)', r1);
  // Double aveugle : caché tant que le créateur n'a pas noté
  const hidden = await fetch(`${API}/reviews/user/${creatorUser.id}`).then(r => r.json());
  expect(!hidden.reviews.some(x => x._id === r1.data.review._id), 'L\'avis de la marque ne doit pas être visible avant celui du créateur', { status: 200, data: hidden });
  const det = await creatorApi('GET', `/deliveries/${delivery._id}`);
  expect(det.data.delivery.otherHasReviewed === true && !det.data.delivery.receivedReview, 'Le créateur doit savoir qu\'un avis l\'attend sans le voir', det);
  const early = await creatorApi('POST', `/reviews/${r1.data.review._id}/respond`, { comment: 'Merci beaucoup !' });
  expect(early.status === 400, 'Pas de réponse à un avis non publié', early);
  const r2 = await creatorApi('POST', `/reviews/campaign/${campaign._id}`, { rating: 4, comment: '', communication: 4, quality: 4, timeliness: 4, professionalism: 4 });
  expect(r2.status === 201 && r2.data.review.publishedAt, 'Avis créateur échoué (devrait publier les deux)', r2);
  const dup = await brandApi('POST', `/reviews/campaign/${campaign._id}`, { rating: 5, communication: 5, quality: 5, timeliness: 5, professionalism: 5 });
  expect(dup.status === 400, 'Un double avis devrait être refusé', dup);
  const list = await fetch(`${API}/reviews/user/${creatorUser.id}`).then(r => r.json());
  expect(list.stats.avgRating === 5 && list.reviews.length === 1, 'Un seul avis publié attendu (celui de la campagne multi reste caché : le créateur n\'a pas noté)', { status: 200, data: list });
  const profile = await creatorApi('GET', '/auth/profile');
  expect(profile.data.user.profile.stats.rating === 5, 'La note du profil créateur devrait être 5', profile);
  // Réponse publique du créateur à l'avis publié
  const reply = await creatorApi('POST', `/reviews/${r1.data.review._id}/respond`, { comment: 'Merci beaucoup, ravi de cette collaboration !' });
  expect(reply.status === 200 && reply.data.review.response.comment, 'Réponse publique échouée', reply);
  const again = await creatorApi('POST', `/reviews/${r1.data.review._id}/respond`, { comment: 'Encore moi' });
  expect(again.status === 400, 'Une seule réponse par avis', again);
  // Publication automatique après le délai : l'avis de la campagne multi (sans avis en retour) est publié par la tâche planifiée
  const reviewsCol = mongoose.connection.db.collection('reviews');
  await reviewsCol.updateMany({ revieweeId: new mongoose.Types.ObjectId(creatorUser.id), publishedAt: null }, { $set: { publishDeadline: new Date(Date.now() - 60000) } });
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  let jobs;
  try { jobs = await brandApi('POST', '/admin/jobs/run'); } finally { await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } }); }
  expect(jobs.status === 200 && jobs.data.reviewsPublished >= 1, 'La tâche planifiée devrait publier l\'avis en attente', jobs);
  const after = await fetch(`${API}/reviews/user/${creatorUser.id}`).then(r => r.json());
  expect(after.reviews.length === 2 && after.stats.avgRating === 5, 'Deux avis publiés attendus après le délai', { status: 200, data: after });
  return 'double aveugle vérifié, réponse publique, publication automatique après délai';
});

await step('Livraison : détail avec avis (canReview / myReview)', async () => {
  const res = await brandApi('GET', `/deliveries/${delivery._id}`);
  expect(res.status === 200 && res.data.delivery.myReview && res.data.delivery.canReview === false, 'Infos avis manquantes', res);
  return 'OK';
});

await step('Droits d\'utilisation : date de fin, prolongation payée (avenant PDF), rappel d\'expiration', async () => {
  const c0 = await brandApi('GET', `/deliveries/${delivery._id}/contract`);
  expect(c0.status === 200 && c0.data.contract.rightsEndAt, 'La date de fin des droits devrait être fixée après validation', c0);
  const end0 = new Date(c0.data.contract.rightsEndAt);
  const monthsAhead = (end0 - Date.now()) / (30.4 * 86400000);
  const expectedMonths = { '6m': 6, '1y': 12, '2y': 24, '3y': 36 }[c0.data.contract.rights.duration];
  expect(expectedMonths && Math.abs(monthsAhead - expectedMonths) < 1.5, `Droits de ${expectedMonths} mois attendus (≈ ${monthsAhead.toFixed(1)} mois)`, c0);
  // Marque : demande ; créateur : proposition ; marque : acceptation + paiement immédiat
  const req = await brandApi('POST', `/deliveries/${delivery._id}/rights-extension/request`, { message: 'Un an de plus ?' });
  expect(req.status === 200 && req.data.rightsExtension.status === 'requested', 'Demande de prolongation échouée', req);
  const prop = await creatorApi('POST', `/deliveries/${delivery._id}/rights-extension/propose`, { price: 60, duration: '1y' });
  expect(prop.status === 200 && prop.data.rightsExtension.status === 'proposed' && prop.data.rightsExtension.creatorAmount === 54, 'Proposition échouée (créateur = 90 %)', prop);
  const acc = await brandApi('POST', `/deliveries/${delivery._id}/rights-extension/accept`);
  expect(acc.status === 200, 'Acceptation échouée', acc);
  let done = acc.data.addendum ? acc : null;
  if (!done) {
    expect(acc.data.clientSecret, 'Client secret attendu pour le paiement de la prolongation', acc);
    const { default: Stripe } = await import('stripe');
    const piId = acc.data.clientSecret.split('_secret_')[0];
    await new Stripe(process.env.STRIPE_SECRET_KEY).paymentIntents.confirm(piId, { payment_method: 'pm_card_visa' });
    done = await brandApi('POST', `/deliveries/${delivery._id}/rights-extension/confirm`);
    expect(done.status === 200 && done.data.addendum, 'Confirmation de la prolongation échouée', done);
  }
  expect(/^NC-AV-/.test(done.data.addendum.number) && done.data.addendum.url, 'Avenant manquant', done);
  const end1 = new Date(done.data.rightsEndAt);
  expect((end1 - end0) / 86400000 > 360, 'La date de fin devrait être repoussée d\'environ un an', done);
  const c1 = await brandApi('GET', `/deliveries/${delivery._id}/contract`);
  expect(c1.data.contract.addenda.length === 1 && c1.data.contract.addenda[0].url.startsWith('http') && c1.data.rightsExtension.status === 'paid', 'Avenant non rattaché au contrat', c1);
  // Rappel d'expiration : on simule une fin de droits dans 10 jours puis on lance les tâches planifiées
  const deliveries = mongoose.connection.db.collection('deliveries');
  await deliveries.updateOne({ _id: new mongoose.Types.ObjectId(delivery._id) }, { $set: { 'contract.rightsEndAt': new Date(Date.now() + 10 * 86400000), 'contract.expiryReminderSentAt': null } });
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  const jobs = await brandApi('POST', '/admin/jobs/run');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  expect(jobs.status === 200 && jobs.data.rightsReminders >= 1, 'Le rappel d\'expiration des droits n\'a pas été envoyé', jobs);
  const doc = await deliveries.findOne({ _id: new mongoose.Types.ObjectId(delivery._id) });
  expect(doc.contract.expiryReminderSentAt, 'expiryReminderSentAt devrait être renseigné', { status: 200, data: doc.contract });
  return `fin initiale ${end0.toISOString().slice(0, 10)} → ${end1.toISOString().slice(0, 10)} après avenant ${done.data.addendum.number}, rappel envoyé`;
});

await step('Stripe Connect : onboarding créateur (compte Express + lien)', async () => {
  const status0 = await creatorApi('GET', '/auth/stripe/status');
  expect(status0.status === 200 && status0.data.connected === false, 'Statut initial attendu : non connecté', status0);
  const res = await creatorApi('POST', '/auth/stripe/connect', {});
  if (res.status === 500 && /signed up for Connect/i.test(res.data?.error || '')) {
    return '⚠️ Stripe Connect n\'est pas activé sur votre compte Stripe : activez-le sur https://dashboard.stripe.com/connect (obligatoire pour virer les gains aux créateurs). Le reste du flux fonctionne.';
  }
  expect(res.status === 200 && res.data.url?.startsWith('https://connect.stripe.com'), 'Lien d\'onboarding Stripe invalide', res);
  const status1 = await creatorApi('GET', '/auth/stripe/status');
  expect(status1.status === 200 && status1.data.connected === true && status1.data.accountId === res.data.accountId, 'Statut après création incorrect', status1);
  return `compte ${res.data.accountId}, onboarding ${status1.data.onboardingComplete ? 'terminé' : 'à compléter par le créateur'}`;
});

await step('Admin : suppression du compte Stripe Connect d\'un créateur (reset pour tests)', async () => {
  const before = await creatorApi('GET', '/auth/stripe/status');
  if (!before.data?.connected) return 'ignoré : pas de compte Connect (Connect inactif)';
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  try {
    // 0. Admin : marquer une adresse comme confirmée (Firebase + base)
    const mv = await brandApi('POST', `/admin/users/${creatorUser.id}/verify-email`);
    expect(mv.status === 200 && mv.data.emailVerified === true, 'Marquage email confirmé échoué', mv);
    // 0 bis. Liste des utilisateurs avec filtres (rôle, origine, email confirmé)
    const fl = await brandApi('GET', `/admin/users?role=creator&origin=real&verified=1&search=${encodeURIComponent(creatorUser.email)}`);
    expect(fl.status === 200 && fl.data.users.length === 1 && fl.data.users[0].email === creatorUser.email && fl.data.pagination.total === 1, 'Filtres utilisateurs : créateur réel confirmé attendu', fl);
    const fl2 = await brandApi('GET', `/admin/users?role=brand&search=${encodeURIComponent(creatorUser.email)}`);
    expect(fl2.status === 200 && fl2.data.users.length === 0, 'Filtre rôle marque : aucun résultat attendu', fl2);
    // 1. Créateur avec mission en cours : refus
    const blocked = await brandApi('POST', `/admin/users/${creatorUser.id}/stripe-connect/reset`);
    expect(blocked.status === 409, 'La suppression devrait être refusée tant qu\'une mission est en cours', blocked);
    // 2. Créateur sans mission : suppression chez Stripe, puis nouveau compte possible
    const email = `e2e-connect-${RUN}@needcreator-test.com`;
    const fu = await firebaseUser(email);
    const cApi = client(fu.idToken);
    const reg = await cApi('POST', '/auth/register/creator', { acceptTerms: true, email, name: 'Connect Reset', bio: '', niches: ['beauty'], minPrice: 80 });
    expect(reg.status === 201, 'Inscription créateur de test échouée', reg);
    extraCleanup.push({ userId: reg.data.user.id, uid: fu.uid });
    await users.updateOne({ email }, { $set: { status: 'active' } });
    const first = await cApi('POST', '/auth/stripe/connect', {});
    expect(first.status === 200 && first.data.accountId, 'Création du compte Connect échouée', first);
    const reset = await brandApi('POST', `/admin/users/${reg.data.user.id}/stripe-connect/reset`);
    expect(reset.status === 200 && reset.data.stripeDeleted === true, 'Suppression du compte Connect échouée', reset);
    const after = await cApi('GET', '/auth/stripe/status');
    expect(after.status === 200 && after.data.connected === false, 'Le créateur devrait être déconnecté de Stripe', after);
    const again = await cApi('POST', '/auth/stripe/connect', {});
    expect(again.status === 200 && again.data.accountId && again.data.accountId !== first.data.accountId, 'Un nouveau compte Connect devrait être créé', again);
    await brandApi('POST', `/admin/users/${reg.data.user.id}/stripe-connect/reset`); // nettoyage du second compte
    return `refus si mission en cours ; ${first.data.accountId} supprimé puis ${again.data.accountId} recréé`;
  } finally {
    await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  }
});

await step('Envoi direct vers R2 : portfolio + livraison (lien signé, sans passer par le serveur)', async () => {
  // Portfolio
  const bad = await creatorApi('POST', '/portfolio/upload-url', { filename: 'doc.pdf', contentType: 'application/pdf', size: 10 });
  expect(bad.status === 400, 'Un fichier non vidéo devrait être refusé', bad);
  const pre = await creatorApi('POST', '/portfolio/upload-url', { filename: 'direct.mp4', contentType: 'video/mp4', size: 2048 });
  expect(pre.status === 200 && pre.data.uploadUrl && pre.data.key.startsWith(`videos/${creatorUser.id}/`), 'Lien signé portfolio invalide', pre);
  const ghost = await creatorApi('POST', '/portfolio/videos', { key: pre.data.key, title: 'Fantôme', videoType: 'demo' });
  expect(ghost.status === 400, 'Enregistrer une clé non déposée devrait échouer', ghost);
  const body = Buffer.concat([Buffer.from('\x00\x00\x00\x18ftypmp42', 'binary'), Buffer.alloc(2048, 1)]);
  const put = await fetch(pre.data.uploadUrl, { method: 'PUT', body, headers: { 'Content-Type': 'video/mp4' } });
  expect(put.ok, `PUT direct vers R2 refusé (HTTP ${put.status})`, { status: put.status, data: await put.text() });
  const reg = await creatorApi('POST', '/portfolio/videos', { key: pre.data.key, title: 'Vidéo envoi direct', videoType: 'demo' });
  expect(reg.status === 201 && reg.data.video?.videoUrl, 'Enregistrement portfolio échoué', reg);
  const dup = await creatorApi('POST', '/portfolio/videos', { key: pre.data.key, title: 'Doublon', videoType: 'demo' });
  expect(dup.status === 409, 'Un doublon devrait être refusé', dup);
  const other = await creatorApi('POST', '/portfolio/videos', { key: `videos/000000000000000000000000/x.mp4`, title: 'Autre', videoType: 'demo' });
  expect(other.status === 400, 'Une clé d\'un autre utilisateur devrait être refusée', other);
  await creatorApi('DELETE', `/portfolio/${reg.data.video._id}`);
  // Livraison : nouvelle campagne + sélection, puis dépôt direct d'un fichier
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const c = await brandApi('POST', '/campaigns', { title: 'Campagne envoi direct', description: 'Description suffisamment longue pour passer la validation de cinquante caractères minimum.', videoType: 'demo', duration: 30, deliverables: 1, budget: 100, niches: ['beauty'], applicationDeadline: deadline });
  await brandApi('POST', `/campaigns/${c.data.campaign._id}/publish`);
  const ap = await creatorApi('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 100, estimatedDeliveryDays: 3 });
  expect(ap.status === 201, 'Candidature échouée', ap);
  const sel = await brandApi('POST', `/campaigns/${c.data.campaign._id}/select/${creatorUser.id}`);
  expect(sel.status === 200, 'Sélection échouée', sel);
  const d = sel.data.delivery._id;
  const dpre = await creatorApi('POST', `/deliveries/${d}/upload-url`, { filename: 'livrable.mp4', contentType: 'video/mp4', size: 2048 });
  expect(dpre.status === 200 && dpre.data.key.startsWith(`deliverables/${d}/`), 'Lien signé livraison invalide', dpre);
  const dput = await fetch(dpre.data.uploadUrl, { method: 'PUT', body, headers: { 'Content-Type': 'video/mp4' } });
  expect(dput.ok, `PUT direct livraison refusé (HTTP ${dput.status})`, { status: dput.status, data: null });
  const dreg = await creatorApi('POST', `/deliveries/${d}/files`, { files: [{ key: dpre.data.key, filename: 'livrable.mp4', contentType: 'video/mp4', size: 2048 }] });
  expect(dreg.status === 200 && dreg.data.files.length === 1 && dreg.data.files[0].size === body.length, 'Enregistrement livraison échoué', dreg);
  const over = await creatorApi('POST', `/deliveries/${d}/files`, { files: [{ key: dpre.data.key, filename: 'livrable.mp4', contentType: 'video/mp4', size: 2048 }] });
  expect(over.status === 400 || over.status === 409, 'Dépasser le nombre attendu / doublon devrait être refusé', over);
  // Nettoyage : livraison et campagne de test (le paiement n'a pas été confirmé)
  const db = mongoose.connection.db;
  await db.collection('deliveries').deleteOne({ _id: new mongoose.Types.ObjectId(d) });
  await db.collection('campaigns').deleteOne({ _id: new mongoose.Types.ObjectId(c.data.campaign._id) });
  return 'portfolio et livraison déposés directement dans R2, contrôles OK';
});

await step('Email non confirmé : publication refusée ; emails de confirmation et de réinitialisation via notre SMTP', async () => {
  const email = `e2e-unverified-${RUN}@needcreator-test.com`;
  const fu = await firebaseUser(email, false);
  const uApi = client(fu.idToken);
  const reg = await uApi('POST', '/auth/register/brand', { acceptTerms: true, email, companyName: 'Marque Non Confirmée', website: 'https://exemple.fr', industry: 'ecommerce' });
  expect(reg.status === 201, 'Inscription échouée', reg);
  extraCleanup.push({ userId: reg.data.user.id, uid: fu.uid });
  await mongoose.connection.db.collection('users').updateOne({ email }, { $set: { 'verification.business.status': 'verified' } });
  const c = await uApi('POST', '/campaigns', { title: 'Campagne test email', description: 'Description suffisamment longue pour passer la validation de cinquante caractères minimum.', videoType: 'demo', duration: 30, deliverables: 1, budget: 100, niches: ['beauty'], applicationDeadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) });
  expect(c.status === 201, 'Création du brouillon échouée', c);
  const pub = await uApi('POST', `/campaigns/${c.data.campaign._id}/publish`);
  expect(pub.status === 403 && pub.data.code === 'EMAIL_NOT_VERIFIED', 'La publication devrait être refusée sans email confirmé', pub);
  // Emails d'authentification envoyés par notre SMTP : renvoi de confirmation, mot de passe oublié
  const resend = await uApi('POST', '/auth/send-verification');
  expect([200, 502].includes(resend.status) && (resend.status !== 200 || resend.data.verified === false), 'Le renvoi de confirmation devrait générer un lien (200) ou signaler un SMTP indisponible (502)', resend);
  const again = await uApi('POST', '/auth/send-verification');
  expect(again.status === 429 || again.status === 502, 'Un second renvoi immédiat devrait être limité', again);
  // Le lien Firebase est réécrit vers notre domaine (filtres anti-spam sur firebaseapp.com)
  const { rewriteActionLink } = await import('../src/utils/authLinks.js');
  // Firebase limite la génération de liens par adresse : en cas de blocage temporaire, on teste la réécriture sur un lien type
  let raw;
  try { raw = await admin.auth().generateEmailVerificationLink(email); }
  catch (err) {
    if (!/TOO_MANY_ATTEMPTS/.test(err?.message || '')) throw err;
    raw = `https://${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=EXEMPLE&apiKey=x&lang=fr`;
  }
  const ours = rewriteActionLink(raw);
  const origin = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();
  expect(raw.includes('/__/auth/action') && ours.startsWith(`${origin}/auth/action?`) && ours.includes('oobCode=') && ours.includes('mode=verifyEmail'), 'Le lien de confirmation devrait pointer vers /auth/action de notre site', { status: 200, data: { raw, ours } });
  const alreadyOk = await creatorApi('POST', '/auth/send-verification');
  expect(alreadyOk.status === 200 && alreadyOk.data.verified === true, 'Un compte déjà confirmé ne doit pas recevoir d\'email', alreadyOk);
  const unknown = await fetch(`${API}/auth/password-reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `inconnu-${RUN}@needcreator-test.com` }) });
  expect([200, 429].includes(unknown.status), 'Réinitialisation : réponse générique attendue pour un email inconnu (429 = limite par IP atteinte par des lancements répétés)', { status: unknown.status, data: await unknown.json() });
  const badMail = await fetch(`${API}/auth/password-reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'pas-un-email' }) });
  expect([400, 429].includes(badMail.status), 'Réinitialisation : email invalide refusé (ou limite IP)', { status: badMail.status, data: null });
  const known = await fetch(`${API}/auth/password-reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  expect([200, 429, 502].includes(known.status), 'Réinitialisation : lien généré (200), limite IP (429) ou SMTP indisponible (502)', { status: known.status, data: await known.json() });
  await admin.auth().updateUser(fu.uid, { emailVerified: true });
  const pub2 = await uApi('POST', `/campaigns/${c.data.campaign._id}/publish`);
  expect(pub2.status === 200, 'La publication devrait passer une fois l\'email confirmé', pub2);
  await mongoose.connection.db.collection('campaigns').deleteOne({ _id: new mongoose.Types.ObjectId(c.data.campaign._id) });
  return 'refusée avant confirmation, acceptée après';
});

await step('Suggestion de prix : médiane des devis acceptés (grille de secours sous 10 devis)', async () => {
  const r = await brandApi('GET', '/campaigns/market-rates?fresh=1');
  expect(r.status === 200 && r.data.rates && r.data.minSample === 10, 'Taux de marché indisponibles', r);
  const demo = r.data.rates.demo;
  expect(demo && demo.min > 0 && demo.max >= demo.min && demo.median >= demo.min && ['grid', 'market'].includes(demo.source), 'Entrée « demo » incohérente', r);
  const types = Object.keys(r.data.rates).length;
  return `${types} types de vidéo, demo : ${demo.min}–${demo.max} € (médiane ${demo.median} €, ${demo.count} devis acceptés, source ${demo.source})`;
});

await step('Site public : créateurs inscrits avec accord (fiche + vidéo), Ambassadeurs mis en avant', async () => {
  // Accord activé par défaut (12/09/2026) : le créateur peut le retirer, il disparaît alors du site
  const byDefault = await fetch(`${API}/creators/public`).then(r => r.json());
  expect(byDefault.creators.some(c => String(c.id) === creatorUser.id), 'Par défaut, le créateur validé avec portfolio doit apparaître sur le site', { status: 200, data: byDefault });
  const optOut = await creatorApi('PATCH', '/auth/profile', { profile: { publicConsent: { site: false, marketing: false } } });
  expect(optOut.status === 200 && optOut.data.user.profile.publicConsent?.site === false, 'Retrait de l\'accord non enregistré', optOut);
  const none = await fetch(`${API}/creators/public`).then(r => r.json());
  expect(!none.creators.some(c => String(c.id) === creatorUser.id), 'Sans accord, le créateur ne doit pas apparaître sur le site', { status: 200, data: none });
  const consent = await creatorApi('PATCH', '/auth/profile', { profile: { publicConsent: { site: true, marketing: true } } });
  expect(consent.status === 200 && consent.data.user.profile.publicConsent?.site === true, 'Accord non enregistré', consent);
  const pub = await fetch(`${API}/creators/public`).then(r => r.json());
  const me = pub.creators.find(c => String(c.id) === creatorUser.id);
  expect(me && me.video?.url && me.isAmbassador === true, 'Le créateur (Ambassadeur) devrait apparaître avec sa vidéo', { status: 200, data: pub });
  const featured = await fetch(`${API}/creators/public?featured=1`).then(r => r.json());
  expect(featured.creators.some(c => String(c.id) === creatorUser.id), 'Ambassadeur avec accord communication attendu en vedette', { status: 200, data: featured });
  expect(!('email' in (me || {})), 'Pas d\'email sur le site public', { status: 200, data: me });
  return `${pub.pagination.total} créateur(s) publics, ${featured.pagination.total} en vedette`;
});

await step('Sécurité : un créateur ne peut pas créer de campagne, une marque ne peut pas candidater', async () => {
  const a = await creatorApi('POST', '/campaigns', {});
  const b = await brandApi('POST', `/campaigns/${campaign._id}/apply`, { price: 100, estimatedDeliveryDays: 3 });
  const c = await creatorApi('GET', '/admin/stats');
  expect(a.status === 403 && b.status === 403 && c.status === 403, 'Contrôles de rôle défaillants', { status: `${a.status}/${b.status}/${c.status}`, data: null });
  return 'rôles respectés';
});

await step('Auto-approbation : simulation J+7', async () => {
  // Nouvelle campagne + livraison soumise, date d'auto-approbation forcée dans le passé
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const c = await brandApi('POST', '/campaigns', {
    title: 'Campagne auto-approbation test', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.',
    videoType: 'demo', duration: 30, deliverables: 1, budget: 100, niches: ['beauty'], applicationDeadline: deadline,
  });
  await brandApi('POST', `/campaigns/${c.data.campaign._id}/publish`);
  await creatorApi('POST', `/campaigns/${c.data.campaign._id}/apply`, { price: 100, estimatedDeliveryDays: 3 });
  const sel = await brandApi('POST', `/campaigns/${c.data.campaign._id}/select/${creatorUser.id}`);
  expect(sel.status === 200 && sel.data.delivery, 'Sélection échouée', sel);
  const { default: Stripe } = await import('stripe');
  await new Stripe(process.env.STRIPE_SECRET_KEY).paymentIntents.confirm(sel.data.delivery.payment.stripePaymentIntentId, { payment_method: 'pm_card_visa' });
  await brandApi('POST', `/deliveries/${sel.data.delivery._id}/confirm-payment`, {});
  const form = new FormData(); form.append('files', fakeVideo('auto.mp4'));
  await creatorApi('POST', `/deliveries/${sel.data.delivery._id}/upload`, form, { form: true });
  await creatorApi('POST', `/deliveries/${sel.data.delivery._id}/submit`, {});
  const deliveries = mongoose.connection.db.collection('deliveries');
  await deliveries.updateOne({ _id: new mongoose.Types.ObjectId(sel.data.delivery._id) }, { $set: { autoApprovalDate: new Date(Date.now() - 1000) } });
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  const jobs = await brandApi('POST', '/admin/jobs/run');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  expect(jobs.status === 200 && jobs.data.autoApprovals >= 1, 'Le job d\'auto-approbation n\'a rien traité', jobs);
  const d = await brandApi('GET', `/deliveries/${sel.data.delivery._id}`);
  expect(d.data.delivery.status === 'auto_approved', 'Statut attendu auto_approved', d);
  return `paiement ${d.data.delivery.payment.status}`;
});

await step('RGPD : export des données + suppression de compte (anonymisation)', async () => {
  const exp = await creatorApi('GET', '/auth/export');
  expect(exp.status === 200 && exp.data.account && Array.isArray(exp.data.deliveries), 'Export RGPD invalide', exp);
  // Comptes avec missions ou campagnes actives : suppression refusée
  const refusedBrand = await brandApi('DELETE', '/auth/account');
  expect(refusedBrand.status === 409, 'La suppression d\'une marque avec campagnes actives devrait être refusée', refusedBrand);
  const refusedCreator = await creatorApi('DELETE', '/auth/account');
  expect(refusedCreator.status === 409, 'La suppression d\'un créateur avec mission en cours devrait être refusée', refusedCreator);
  // Compte neuf : acceptation des CGU, export, suppression, anonymisation
  const rgpdEmail = `e2e-rgpd-${RUN}@needcreator-test.com`;
  const fu = await firebaseUser(rgpdEmail);
  const rApi = client(fu.idToken);
  const noTerms = await rApi('POST', '/auth/register/creator', { email: rgpdEmail, name: 'RGPD', bio: '', niches: ['beauty'], minPrice: 80 });
  expect(noTerms.status === 400, 'L\'inscription sans acceptation des CGU devrait être refusée', noTerms);
  const reg = await rApi('POST', '/auth/register/creator', { acceptTerms: true, email: rgpdEmail, name: 'RGPD', bio: '', niches: ['beauty'], minPrice: 80 });
  expect(reg.status === 201 && reg.data.user.legalUpToDate === true, 'Inscription avec CGU échouée', reg);
  extraCleanup.push({ userId: reg.data.user.id, uid: fu.uid });
  const acc = await rApi('POST', '/auth/accept-terms');
  expect(acc.status === 200 && acc.data.legalUpToDate === true, 'Acceptation des CGU échouée', acc);
  const del = await rApi('DELETE', '/auth/account');
  expect(del.status === 200, 'Suppression du compte échouée', del);
  const after = await rApi('GET', '/auth/profile');
  expect([401, 403, 404].includes(after.status), 'Le compte supprimé ne devrait plus être accessible', after);
  const doc = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(reg.data.user.id) });
  expect(doc && doc.status === 'deleted' && doc.email.startsWith('supprime-') && doc.profile.name === 'Compte supprimé' && (doc.profile.portfolio || []).length === 0, 'Anonymisation incomplète', { status: 200, data: doc });
  return 'export OK, refus si activité en cours, CGU obligatoires, compte anonymisé';
});

await step('Monitoring : récapitulatif admin dans les tâches planifiées, alertes immédiates branchées', async () => {
  const users = mongoose.connection.db.collection('users');
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  try {
    const jobs = await brandApi('POST', '/admin/jobs/run');
    expect(jobs.status === 200 && jobs.data.adminDigest && typeof jobs.data.adminDigest.sent === 'boolean', 'Le récapitulatif admin devrait être évalué par les tâches planifiées', jobs);
    return `récapitulatif ${jobs.data.adminDigest.sent ? 'envoyé' : `non envoyé (${jobs.data.adminDigest.reason || jobs.data.adminDigest.error})`}`;
  } finally {
    await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  }
});

await step('Admin : purge des campagnes, devis et missions d\'un compte (outil temporaire)', async () => {
  const users = mongoose.connection.db.collection('users');
  const c2Id = (await c2Api('GET', '/auth/profile')).data.user.id;
  const before = await mongoose.connection.db.collection('deliveries').countDocuments({ creatorId: new mongoose.Types.ObjectId(c2Id) });
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  try {
    const r = await brandApi('POST', `/admin/users/${c2Id}/purge`);
    if (r.status === 403) return 'outil désactivé (ADMIN_PURGE_ENABLED=false) : refus vérifié';
    expect(r.status === 200, 'Purge échouée', r);
    const after = await mongoose.connection.db.collection('deliveries').countDocuments({ creatorId: new mongoose.Types.ObjectId(c2Id) });
    const apps = await mongoose.connection.db.collection('campaigns').countDocuments({ 'applications.creatorId': new mongoose.Types.ObjectId(c2Id) });
    expect(after === 0 && apps === 0, 'Le créateur 2 ne devrait plus avoir ni mission ni devis', { status: 200, data: { before, after, apps } });
    return `${before} mission(s) et les devis du créateur 2 supprimés, ${r.data.payments.length} paiement(s) traité(s)`;
  } finally {
    await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  }
});

await step('Admin : suppression complète d\'un compte (outil temporaire)', async () => {
  const users = mongoose.connection.db.collection('users');
  const email = `e2e-hard-${RUN}@needcreator-test.com`;
  const fu = await firebaseUser(email);
  const hApi = client(fu.idToken);
  const reg = await hApi('POST', '/auth/register/brand', { acceptTerms: true, email, companyName: 'Marque à supprimer', website: 'https://exemple.fr', industry: 'ecommerce' });
  expect(reg.status === 201, 'Inscription échouée', reg);
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  try {
    const r = await brandApi('DELETE', `/admin/users/${reg.data.user.id}/hard`);
    if (r.status === 403) { extraCleanup.push({ userId: reg.data.user.id, uid: fu.uid }); return 'outil désactivé (ADMIN_PURGE_ENABLED=false) : refus vérifié'; }
    expect(r.status === 200 && r.data.firebase === 'supprimé', 'Suppression complète échouée', r);
    const doc = await users.findOne({ _id: new mongoose.Types.ObjectId(reg.data.user.id) });
    expect(!doc, 'Le document utilisateur devrait avoir disparu', { status: 200, data: doc });
    const fb = await admin.auth().getUser(fu.uid).then(() => 'existe').catch(() => 'absent');
    expect(fb === 'absent', 'Le compte Firebase devrait être supprimé', { status: 200, data: { fb } });
    return `compte ${email} supprimé de la base et de Firebase`;
  } finally {
    await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  }
});

// Nettoyage
await step('Amorçage admin : marques et campagnes en masse, invisibles côté créateur, clôture à échéance, suppression du lot', async () => {
  const users = mongoose.connection.db.collection('users');
  try {
  const seedEmail = `e2e-seed-${RUN}@needcreator-test.com`;
  const lines = `# commentaire\n${seedEmail} ; MotDePasse123! ; Atelier Lumen ; 35600000000048 ; atelier-lumen.fr ; beauté ; 2 ; 250 ; Marque lyonnaise de soins bio ; produits envoyés sous 48 h\nmauvais ; x ; ; ; ; ; 1 ; abc`;
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  const bad = await brandApi('POST', '/admin/seed/preview', { lines });
  expect(bad.status === 200 && bad.data.errors.length === 1 && bad.data.errors[0].errors.some(e => /tarif max/.test(e)) && bad.data.rows.length === 1 && bad.data.rows[0].template === 'beauty-testimonial' && bad.data.rows[0].maxBudget === 250 && bad.data.rows[0].comment === 'Marque lyonnaise de soins bio ; produits envoyés sous 48 h' && bad.data.rows[0].existing === null, 'Aperçu : 1 ligne valide (tarif max 250), 1 invalide (tarif max abc)', bad);
  const refused = await brandApi('POST', '/admin/seed/run', { lines });
  expect(refused.status === 400, 'Un lot avec une ligne invalide est refusé', refused);
  const ok = await brandApi('POST', '/admin/seed/run', { lines: lines.split('\n').slice(0, 2).join('\n'), publishedWithinDays: 10, deadlineWithinDays: 20, budgetMin: 200, budgetMax: 300, closeAtDeadline: true, useAi: false });
  expect(ok.status === 200 && ok.data.accounts === 1 && ok.data.planned === 2 && ok.data.batch, 'Lot non créé', ok);
  const batch = ok.data.batch;
  // Campagnes générées en arrière-plan : on attend la fin (avancement dans la liste des lots)
  for (let i = 0; i < 40; i++) { const st = await brandApi('GET', '/admin/seed/batches'); const b = st.data.batches.find(x => x.batch === batch); if (b?.progress && !b.progress.running) break; await new Promise(r => setTimeout(r, 500)); }
  const seeded = await users.findOne({ email: seedEmail });
  expect(seeded && seeded.role === 'brand' && !/lyonnaise/.test(seeded.profile?.bio || '') && seeded.verification?.business?.status === 'verified' && seeded.verification?.email === true && seeded.seed?.batch === batch && seeded.legalInfo?.signatoryName, 'Compte d\'amorçage incomplet', { status: 200, data: seeded });
  const seedCamps = await mongoose.connection.db.collection('campaigns').find({ 'seed.batch': batch }).toArray();
  expect(seedCamps.length === 2 && seedCamps.every(c => c.status === 'active' && c.budget?.total >= 200 && c.budget?.total <= 250 && c.timeline?.applicationDeadline > new Date() && !/lyonnaise/.test(c.description) && c.seed?.note), 'Campagnes d\'amorçage : budget entre 200 et le tarif max 250, consigne conservée en interne mais jamais dans le brief', { status: 200, data: seedCamps.map(c => ({ status: c.status, budget: c.budget })) });
  // Devis libre : tarif max 0 → aucun budget affiché
  const free = await brandApi('POST', '/admin/seed/run', { lines: `${seedEmail} ; MotDePasse123! ; Atelier Lumen ; ; ; beauté ; 1 ; 0`, closeAtDeadline: true, useAi: false });
  expect(free.status === 200 && free.data.existing === 1 && free.data.planned === 1, 'Lot devis libre non créé', free);
  for (let i = 0; i < 40; i++) { const st = await brandApi('GET', '/admin/seed/batches'); const b = st.data.batches.find(x => x.batch === free.data.batch); if (b?.progress && !b.progress.running) break; await new Promise(r => setTimeout(r, 500)); }
  const freeCamp = await mongoose.connection.db.collection('campaigns').findOne({ 'seed.batch': free.data.batch });
  expect(freeCamp && !freeCamp.budget?.total, 'Tarif max 0 doit donner une campagne sans budget (devis libre)', { status: 200, data: freeCamp?.budget });
  await mongoose.connection.db.collection('campaigns').deleteOne({ _id: freeCamp._id });
  // Suspension d'une marque : ses campagnes disparaissent du fil, du détail et du site public ; réactivation = retour
  const susp = await brandApi('POST', `/admin/users/${seeded._id}/suspend`, { reason: 'Test de suspension' });
  expect(susp.status === 200, 'Suspension échouée', susp);
  const feedS = await creatorApi('GET', '/campaigns?limit=100');
  expect(!feedS.data.campaigns.some(c => seedCamps.some(s => String(s._id) === c._id)), 'Les campagnes d\'une marque suspendue ne doivent plus apparaître dans le fil', feedS);
  const detailS = await creatorApi('GET', `/campaigns/${seedCamps[0]._id}`);
  expect(detailS.status === 403, 'Le détail d\'une campagne de marque suspendue doit être refusé au créateur', detailS);
  const pubS = await fetch(`${API}/campaigns/public/${seedCamps[0]._id}`);
  expect(pubS.status === 404, 'La page publique d\'une campagne de marque suspendue doit renvoyer 404', { status: pubS.status });
  const stored2 = await users.findOne({ email: seedEmail });
  expect(stored2.status === 'suspended' && stored2.suspension?.reason === 'Test de suspension', 'Motif de suspension attendu en base', { status: 200, data: stored2.suspension });
  const react = await brandApi('POST', `/admin/users/${seeded._id}/reactivate`);
  expect(react.status === 200, 'Réactivation échouée', react);
  await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  // Côté créateur : rien ne distingue ces campagnes
  const feed = await creatorApi('GET', '/campaigns?limit=100'); // la base de dev peut contenir d'autres campagnes ouvertes
  const inFeed = feed.data.campaigns.filter(c => seedCamps.some(s => String(s._id) === c._id));
  expect(inFeed.length === 2 && inFeed.every(c => c.seed === undefined), 'Les campagnes d\'amorçage doivent apparaître sans marquage', feed);
  const one = await creatorApi('GET', `/campaigns/${seedCamps[0]._id}`);
  expect(one.status === 200 && one.data.campaign.seed === undefined, 'Le détail ne doit pas exposer le marquage', one);
  // Clôture à échéance : le candidat est prévenu (non retenu)
  const ap = await creatorApi('POST', `/campaigns/${seedCamps[0]._id}/apply`, { price: 220, estimatedDeliveryDays: 5 });
  expect(ap.status === 201, 'Candidature sur une campagne d\'amorçage échouée', ap);
  await mongoose.connection.db.collection('campaigns').updateOne({ _id: seedCamps[0]._id }, { $set: { 'timeline.applicationDeadline': new Date(Date.now() - 3600000) } });
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  const jobs = await brandApi('POST', '/admin/jobs/run');
  expect(jobs.status === 200 && jobs.data.seedClosed >= 1, 'La campagne échue doit être clôturée par les tâches planifiées', jobs);
  const closed = await mongoose.connection.db.collection('campaigns').findOne({ _id: seedCamps[0]._id });
  expect(closed.status === 'completed' && closed.applications[0].status === 'rejected', 'Campagne clôturée et candidature non retenue attendues', { status: 200, data: { status: closed.status, app: closed.applications[0].status } });
  const bell = await creatorApi('GET', '/notifications');
  expect(bell.data.notifications.some(n => /Devis non retenu/.test(n.title) && n.text), 'Le candidat doit recevoir la notification de non-sélection', bell);
  // Lots et suppression avec les comptes
  const list = await brandApi('GET', '/admin/seed/batches');
  expect(list.status === 200 && list.data.batches.some(b => b.batch === batch && b.campaigns === 2) && list.data.batches.some(b => b.batch === free.data.batch && b.accounts === 1), 'Les deux lots doivent être listés (le compte réutilisé appartient au dernier lot)', list);
  const delFree = await brandApi('DELETE', `/admin/seed/batches/${free.data.batch}?users=1`);
  expect(delFree.status === 200 && delFree.data.accounts === 1, 'Suppression du lot devis libre avec le compte échouée', delFree);
  // Le compte supprimé emporte toutes ses campagnes, y compris celles du premier lot
  const del = await brandApi('DELETE', `/admin/seed/batches/${batch}`);
  expect(del.status === 200 && del.data.campaigns === 0, 'Le premier lot ne doit plus contenir de campagne (compte supprimé avec toutes ses campagnes)', del);
  await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  expect(!(await users.findOne({ email: seedEmail })) && (await mongoose.connection.db.collection('campaigns').countDocuments({ 'seed.batch': batch })) === 0, 'Le lot doit avoir disparu (compte + campagnes)', { status: 200, data: {} });
  return 'lot créé (1 compte vérifié, 2 campagnes), invisible côté créateur, clôture à échéance avec non-sélection, lot supprimé avec le compte';
  } finally {
    await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  }
});

await step('Prospection : ajout manuel qualifié par l\'IA, filtres, statut groupé, export CSV mailing, import annuaire', async () => {
  const db = mongoose.connection.db;
  await db.collection('users').updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  try {
    const ov = await brandApi('GET', '/admin/acquisition');
    expect(ov.status === 200 && ov.data.settings && ov.data.counts && Array.isArray(ov.data.statuses), 'Vue d\'ensemble prospection attendue', ov);
    const leadEmail = `e2e-lead-${RUN}@needcreator-test.com`;
    await db.collection('leads').deleteMany({ $or: [{ email: /^e2e-lead-/ }, { handle: /^@leavlog/ }, { handle: /^@rebond/ }, { name: 'Maison Soleil' }, { name: 'Marque Répond' }] });
    const bad = await brandApi('POST', '/admin/acquisition/leads', { kind: 'creator', name: '' });
    expect(bad.status === 400, 'Prospect sans nom refusé', bad);
    const c = await brandApi('POST', '/admin/acquisition/leads', { kind: 'creator', name: 'Léa Vlog', handle: `@leavlog${RUN}`, url: `https://www.youtube.com/@leavlog${RUN}`, email: leadEmail, description: `Créatrice UGC beauté à Lyon : routines skincare, tests de sérums et unboxings pour des marques de cosmétiques. TikTok : @leavlog${RUN}. Collaborations : contact par email.`, niche: 'beauty', stats: { subscribers: 12000 }, socials: { instagram: `https://www.instagram.com/leavlog${RUN}/` } });
    expect(c.status === 201 && c.data.lead._id && c.data.lead.source === 'manual', 'Prospect créateur non créé', c);
    expect(c.data.lead.socials?.instagram === `https://www.instagram.com/leavlog${RUN}/` && c.data.lead.socials?.tiktok === `https://www.tiktok.com/@leavlog${RUN}`, 'Réseaux attendus : Instagram saisi, TikTok extrait de la bio', c.data.lead.socials);
    const soc = await brandApi('PATCH', `/admin/acquisition/leads/${c.data.lead._id}`, { socials: { tiktok: '', youtube: `https://www.youtube.com/@leavlog${RUN}` } });
    expect(soc.status === 200 && !soc.data.lead.socials.tiktok && soc.data.lead.socials.youtube && soc.data.lead.socials.instagram, 'Modification des réseaux : vide efface, les autres restent', soc.data.lead.socials);
    const aiOn = ov.data.settings.ai;
    if (aiOn) expect(['qualified', 'rejected'].includes(c.data.lead.status) && c.data.lead.message && c.data.lead.message.length <= 320 && c.data.lead.emailParagraph && typeof c.data.lead.score === 'number', 'Qualification IA attendue (statut, message, paragraphe, score)', c);
    const dup = await brandApi('POST', '/admin/acquisition/leads', { kind: 'creator', name: 'Léa Vlog', url: `https://www.youtube.com/@leavlog${RUN}` });
    expect(dup.status === 409, 'Doublon de prospect refusé', dup);
    const b = await brandApi('POST', '/admin/acquisition/leads', { kind: 'brand', name: 'Maison Soleil', website: `https://maison-soleil-${RUN}.example.com`, description: 'Marque française de crèmes solaires minérales vendues en ligne, publicités vidéo actives sur Instagram.', niche: 'cosmétiques', stats: { ads: 4 } });
    expect(b.status === 201 && b.data.lead.kind === 'brand', 'Prospect marque non créé', b);
    const list = await brandApi('GET', `/admin/acquisition/leads?kind=creator&hasEmail=1&q=leavlog${RUN}`);
    expect(list.status === 200 && list.data.total === 1 && list.data.leads[0].email === leadEmail, 'Filtres prospects : 1 créateur avec email attendu', list);
    const none = await brandApi('GET', `/admin/acquisition/leads?kind=brand&q=leavlog${RUN}`);
    expect(none.data.total === 0, 'Filtre type marque : aucun résultat attendu', none);
    const bulk = await brandApi('PATCH', '/admin/acquisition/leads/bulk', { ids: [c.data.lead._id], status: 'to_contact' });
    expect(bulk.status === 200 && bulk.data.updated === 1, 'Statut groupé échoué', bulk);
    const csvRes = await fetch(`${API}/admin/acquisition/export.csv?kind=creator&status=to_contact`, { headers: { Authorization: `Bearer ${brand.idToken}` } });
    const csv = await csvRes.text();
    expect(csvRes.status === 200 && csv.includes(leadEmail) && csv.includes(`register?role=creator&from=leavlog${RUN}`) && csv.replace(/^\uFEFF/, '').startsWith('email;prenom;pseudo;nom;niche;abonnes;url;instagram;tiktok') && csv.includes(`https://www.instagram.com/leavlog${RUN}/`), 'Export CSV mailing attendu (email, réseaux, lien d\'inscription rattaché)', { status: csvRes.status, data: csv.slice(0, 200) });
    const imp = await brandApi('POST', '/admin/acquisition/import-directory', { ids: [c.data.lead._id] });
    expect(imp.status === 200 && imp.data.stats.created === 1 && imp.data.linked === 1, 'Import dans l\'annuaire attendu', imp);
    const ec = await db.collection('externalcreators').findOne({ username: `leavlog${RUN}` });
    expect(ec && ec.source === 'prospection' && ec.niches.includes('beauty'), 'Créateur référencé créé depuis le prospect', { status: 200, data: ec });
    // Outil de mailing (fournisseur factice en test) : poussée, réponse et rebond synchronisés
    const ms = await brandApi('GET', '/admin/acquisition/mailing');
    expect(ms.status === 200 && ms.data.settings && typeof ms.data.eligible === 'number', 'État du mailing attendu', ms);
    let mailingNote = 'mailing non testé (fournisseur réel ou absent)';
    if (ms.data.settings.provider === 'mock') {
      const rl = await brandApi('POST', '/admin/acquisition/leads', { kind: 'brand', name: 'Marque Répond', website: `https://marque-repond-${RUN}.example.com`, email: `e2e-lead-${RUN}+reply@needcreator-test.com`, description: 'Marque de bougies parfumées vendues en ligne.', niche: 'maison', qualify: false });
      const bl = await brandApi('POST', '/admin/acquisition/leads', { kind: 'creator', name: 'Créateur Rebond', handle: `@rebond${RUN}`, url: `https://www.youtube.com/@rebond${RUN}`, email: `e2e-lead-${RUN}+bounce@needcreator-test.com`, description: 'Créateur UGC tech.', niche: 'tech', qualify: false });
      const push = await brandApi('POST', '/admin/acquisition/mailing/push', { ids: [c.data.lead._id, rl.data.lead._id, bl.data.lead._id] });
      expect(push.status === 200 && push.data.pushed === 3, 'Poussée de 3 prospects vers le mailing attendue', push);
      const after = await brandApi('GET', `/admin/acquisition/leads?kind=creator&q=leavlog${RUN}`);
      expect(after.data.leads[0].status === 'contacted' && after.data.leads[0].mailing?.pushedAt && after.data.leads[0].mailing?.provider === 'mock', 'Le prospect poussé doit être « contacté » avec la trace mailing', after);
      const ms2 = await brandApi('GET', '/admin/acquisition/mailing');
      expect(ms2.data.pushedToday >= 3 && ms2.data.lists.some(l => l.kind === 'creator' && l.contacts >= 2) && ms2.data.lists.some(l => l.kind === 'brand' && l.contacts >= 1), 'Listes créées avec les contacts', ms2);
      const sync = await brandApi('POST', '/admin/acquisition/mailing/sync');
      expect(sync.status === 200 && sync.data.replies >= 1 && sync.data.bounced >= 1, 'Synchronisation : 1 réponse et 1 rebond attendus', sync);
      const replied = await brandApi('GET', `/admin/acquisition/leads?kind=brand&status=replied&q=Marque Répond`);
      expect(replied.data.leads.length === 1 && /intéresse/.test(replied.data.leads[0].mailing.replyText), 'Le prospect qui répond passe en « A répondu » avec le texte', replied);
      const bounced = await brandApi('GET', `/admin/acquisition/leads?kind=creator&status=rejected&q=rebond${RUN}`);
      expect(bounced.data.leads.length === 1 && bounced.data.leads[0].mailing.bounced === true, 'Le prospect en rebond passe en « Hors cible »', bounced);
      const again = await brandApi('POST', '/admin/acquisition/mailing/push', { ids: [c.data.lead._id] });
      expect(again.data.pushed === 0, 'Un prospect déjà poussé ne l\'est pas deux fois', again);
      // Livraison 3 : réponse classée par l'IA, proposition envoyée depuis l'outil, onboarding de la marque, tableau de bord
      const rlead = replied.data.leads[0];
      if (aiOn) expect(rlead.mailing.replyIntent && rlead.mailing.replySuggestion && rlead.mailing.replySummary, 'La réponse doit être classée par l\'IA avec une proposition', rlead.mailing);
      const sendR = await brandApi('POST', `/admin/acquisition/leads/${rlead._id}/reply`, { text: rlead.mailing.replySuggestion || 'Merci pour votre retour, voici le lien pour créer votre compte.' });
      expect(sendR.status === 200 && sendR.data.lead.mailing.replySentAt && sendR.data.lead.mailing.replyMessageId, 'Envoi de la réponse depuis l\'outil attendu', sendR);
      const ds = await brandApi('GET', '/admin/acquisition/dashboard');
      expect(ds.status === 200 && ds.data.total.brand.replied >= 1 && ds.data.last30.creator.contacted >= 1 && Array.isArray(ds.data.byNiche), 'Tableau de bord : entonnoirs attendus', ds);
      // Marque intéressée qui s'inscrit avec le lien du prospect : prospect « inscrit », campagne brouillon préparée
      const leadBrandEmail = `e2e-lead-${RUN}+reply@needcreator-test.com`;
      const fuLead = await firebaseUser(leadBrandEmail);
      const regLead = await client(fuLead.idToken)('POST', '/auth/register/brand', { acceptTerms: true, email: leadBrandEmail, companyName: 'Marque Répond', country: 'FR', language: 'fr', leadId: rlead._id });
      expect(regLead.status === 201, 'Inscription marque depuis un prospect échouée', regLead);
      let draft = null;
      for (let i = 0; i < 40 && !draft; i++) { draft = await db.collection('campaigns').findOne({ brandId: new mongoose.Types.ObjectId(regLead.data.user.id), status: 'draft' }); if (!draft) await new Promise(r => setTimeout(r, 1000)); }
      expect(draft && draft.title && draft.description.length > 50, 'Campagne brouillon préparée pour la marque inscrite', { status: 200, data: draft });
      const leadAfter = await db.collection('leads').findOne({ _id: new mongoose.Types.ObjectId(rlead._id) });
      expect(leadAfter.status === 'registered' && String(leadAfter.registeredUserId) === regLead.data.user.id && String(leadAfter.draftCampaignId) === String(draft._id), 'Le prospect doit être « inscrit » et lié à la campagne brouillon', { status: 200, data: leadAfter });
      await db.collection('campaigns').deleteMany({ brandId: new mongoose.Types.ObjectId(regLead.data.user.id) });
      await db.collection('notifications').deleteMany({ userId: new mongoose.Types.ObjectId(regLead.data.user.id) });
      await db.collection('users').deleteOne({ _id: new mongoose.Types.ObjectId(regLead.data.user.id) });
      await admin.auth().deleteUser(fuLead.uid).catch(() => {});
      mailingNote = `mailing (factice) : poussée, listes, réponse → a répondu${aiOn ? ` (${rlead.mailing.replyIntent})` : ''}, réponse envoyée, rebond → hors cible, pas de double envoi, marque inscrite → campagne brouillon « ${draft.title.slice(0, 40)} »`;
    }
    // Import groupé : liste collée, lecture préalable, doublons et lignes invalides, réseaux, compte inscrit marqué
    const pasted = `nom;lien;email;bio\nImport Une ; https://www.instagram.com/imp1${RUN}/ ; imp1-${RUN}@needcreator-test.com ; Créatrice UGC food Nantes, TikTok : @imp1${RUN}\nhttps://www.tiktok.com/@imp2${RUN} | Import Deux, vidéos fitness, contact imp2-${RUN}@needcreator-test.com\n${leadEmail} ; doublon du prospect manuel\n;;\nImport Inscrite ; ${brandEmail}`;
    const prev = await brandApi('POST', '/admin/acquisition/leads/import?preview=1', { kind: 'creator', text: pasted });
    expect(prev.status === 200 && prev.data.rows.length === 5 && prev.data.rows[0].name === 'Import Une' && prev.data.rows[0].socials.tiktok === `https://www.tiktok.com/@imp1${RUN}` && prev.data.rows[1].name === 'Import Deux' && prev.data.rows[1].email === `imp2-${RUN}@needcreator-test.com` && prev.data.rows[3].error, 'Lecture préalable de la liste collée attendue', prev);
    const impB = await brandApi('POST', '/admin/acquisition/leads/import', { kind: 'creator', text: pasted, niche: 'food', origin: 'test' });
    expect(impB.status === 201 && impB.data.created === 3 && impB.data.duplicates === 1 && impB.data.invalid === 1 && impB.data.known === 1, 'Import groupé : 3 créés, 1 doublon, 1 invalide, 1 déjà inscrit', impB);
    const impList = await brandApi('GET', `/admin/acquisition/leads?kind=creator&q=Import`);
    const one = impList.data.leads.find(l => l.name === 'Import Une');
    const registered = impList.data.leads.find(l => l.name === 'Import Inscrite');
    expect(one && one.socials?.instagram && one.socials?.tiktok && one.niche === 'food' && one.keyword === 'import:test' && registered?.status === 'registered', 'Prospects importés avec réseaux, niche par défaut, origine et compte inscrit marqué', { status: 200, data: { one, registered } });
    const again = await brandApi('POST', '/admin/acquisition/leads/import', { kind: 'creator', text: pasted });
    expect(again.status === 201 && again.data.created === 0 && again.data.duplicates === 4, 'Un second import identique ne crée rien', again);
    if (aiOn) { let q = null; for (let i = 0; i < 40 && !q; i++) { const l = await db.collection('leads').findOne({ _id: new mongoose.Types.ObjectId(one._id) }); if (['qualified', 'rejected'].includes(l?.status)) q = l; else await new Promise(r => setTimeout(r, 1000)); } expect(q && q.message, 'Les prospects importés doivent être qualifiés par l\'IA en arrière-plan', { status: 200, data: q }); }
    // Marque importée avec un site mais sans email : l'email est trouvé sur la page contact du site (site factice local), à l'import puis par la passe groupée
    const site = http.createServer((rq, rs) => { rs.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); rs.end(rq.url.startsWith('/contact') ? `<html><body><h1>Contact</h1><a href="mailto:bonjour-${RUN}@needcreator-test.com">Nous écrire</a></body></html>` : `<html><body><h1>Boutique</h1><a href="/contact">Contact</a> <a href="https://www.instagram.com/boutique${RUN}/">Instagram</a></body></html>`); });
    await new Promise(r => site.listen(0, '127.0.0.1', r));
    try {
      const siteUrl = `http://127.0.0.1:${site.address().port}`;
      const impS = await brandApi('POST', '/admin/acquisition/leads/import', { kind: 'brand', text: `Boutique Site ${RUN} ; ${siteUrl} ; bougies artisanales, publicités vidéo actives`, origin: 'test' });
      expect(impS.status === 201 && impS.data.created === 1, 'Import de la marque avec site attendu', impS);
      let withMail = null;
      for (let i = 0; i < 60 && !withMail; i++) { const l = await db.collection('leads').findOne({ _id: new mongoose.Types.ObjectId(impS.data.ids[0]) }); if (l?.email) withMail = l; else await new Promise(r => setTimeout(r, 1000)); }
      expect(withMail?.email === `bonjour-${RUN}@needcreator-test.com` && withMail.emailSource === 'site:contact' && withMail.socials?.instagram, 'Email et Instagram attendus depuis le site de la marque importée', { status: 200, data: withMail });
      // Mémoire de 30 jours : un prospect déjà visité à l'import n'est pas revisité par la passe groupée
      expect(withMail.enrich?.emailSearchedAt, 'La visite du site à l\'import doit être mémorisée', { status: 200, data: withMail.enrich });
      await db.collection('leads').updateOne({ _id: withMail._id }, { $set: { email: null, emailSource: null } });
      const skip = await brandApi('POST', '/admin/acquisition/leads/enrich-emails', { kind: 'brand' });
      const skipped = await db.collection('leads').findOne({ _id: withMail._id });
      expect(skip.status === 200 && !skipped.email, 'Un prospect visité il y a moins de 30 jours ne doit pas être revisité', skip);
      for (let i = 0; i < 60; i++) { const st = await brandApi('POST', '/admin/acquisition/leads/enrich-emails', { kind: 'brand' }); if (!/Déjà en cours/.test(st.data.message)) break; await new Promise(r => setTimeout(r, 1000)); }
      await db.collection('leads').updateOne({ _id: withMail._id }, { $set: { 'enrich.emailSearchedAt': new Date(Date.now() - 40 * 86400000) } }); // comme si la visite datait de 40 jours
      const bareRow = await brandApi('POST', '/admin/acquisition/leads/import?preview=1', { kind: 'brand', text: 'Respire ; https://www.facebook.com/respire.co ; ; déodorants naturels ; respire.co' });
      expect(bareRow.status === 200 && bareRow.data.rows[0].name === 'Respire' && bareRow.data.rows[0].website === 'https://respire.co' && bareRow.data.rows[0].description === 'déodorants naturels', 'Un site écrit sans https:// doit être reconnu comme site web', bareRow);
      const pass = await brandApi('POST', '/admin/acquisition/leads/enrich-emails', { kind: 'brand' });
      expect(pass.status === 200 && pass.data.total >= 1, 'Lancement de la recherche groupée des emails attendu', pass);
      let again2 = null;
      for (let i = 0; i < 90 && !again2; i++) { const l = await db.collection('leads').findOne({ _id: withMail._id }); if (l?.email) again2 = l; else await new Promise(r => setTimeout(r, 1000)); }
      expect(again2?.email === `bonjour-${RUN}@needcreator-test.com`, 'La passe groupée doit retrouver l\'email sur le site', { status: 200, data: again2 });
      await db.collection('leads').deleteOne({ _id: withMail._id });
    } finally { site.close(); }
    // Publication Instagram trouvée par hashtag sans auteur : le lien est listé pour l'assistant Chrome, puis la ligne importée complète la fiche au lieu d'en créer une
    const igPost = await db.collection('leads').insertOne({ kind: 'creator', source: 'instagram', externalId: `igpost-${RUN}`, name: 'Bon… cette fois c\'est officiel', url: `https://www.instagram.com/reel/E2E${RUN}/`, description: 'Je me lance dans l\'UGC', status: 'qualified', score: 40, keyword: '#ugcfrance', createdAt: new Date(), updatedAt: new Date() });
    const igList = await brandApi('GET', '/admin/acquisition/leads?kind=creator&source=instagram&noHandle=1&limit=60');
    expect(igList.status === 200 && igList.data.leads.some(l => String(l._id) === String(igPost.insertedId)), 'La publication sans auteur doit être listée pour l\'assistant', igList);
    const igImp = await brandApi('POST', '/admin/acquisition/leads/import', { kind: 'creator', text: `https://www.instagram.com/reel/E2E${RUN}/?igsh=abc ; https://www.instagram.com/devi.ugc${RUN}/ ; devi-${RUN}@needcreator-test.com ; Créatrice UGC lifestyle, 1 200 abonnés` });
    expect(igImp.status === 201 && igImp.data.updated === 1 && igImp.data.created === 0, 'La ligne doit compléter la fiche existante, sans doublon', igImp);
    const igDone = await db.collection('leads').findOne({ _id: igPost.insertedId });
    expect(igDone.handle === `@devi.ugc${RUN}` && igDone.email === `devi-${RUN}@needcreator-test.com` && igDone.socials?.instagram === `https://www.instagram.com/devi.ugc${RUN}/` && /^Créatrice UGC lifestyle, 1 200 abonnés/.test(igDone.description) && igDone.stats?.subscribers === 1200, 'Auteur, profil, email et bio attendus sur la fiche complétée', { status: 200, data: igDone });
    // Même créatrice, autre publication : la seconde fiche est complétée puis mise de côté, une seule reste active
    const igPost2 = await db.collection('leads').insertOne({ kind: 'creator', source: 'instagram', externalId: `igpost2-${RUN}`, name: 'Autre publication', url: `https://www.instagram.com/p/E2F${RUN}/`, status: 'qualified', keyword: '#ugcfrance', createdAt: new Date(), updatedAt: new Date() });
    const igTwin = await brandApi('POST', '/admin/acquisition/leads/import', { kind: 'creator', text: `https://www.instagram.com/p/E2F${RUN}/ ; https://www.instagram.com/devi.ugc${RUN}/ ; devi-${RUN}@needcreator-test.com ; Créatrice UGC lifestyle – 1 200 abonnés` });
    const twinDoc = await db.collection('leads').findOne({ _id: igPost2.insertedId });
    expect(igTwin.status === 201 && igTwin.data.twins === 1 && twinDoc.status === 'excluded' && /Doublon de/.test(twinDoc.notes || ''), 'Le doublon d\'un même créateur doit être mis de côté', { status: igTwin.status, data: { res: igTwin.data, twinDoc } });
    await db.collection('leads').deleteOne({ _id: igPost2.insertedId });
    const igList2 = await brandApi('GET', '/admin/acquisition/leads?kind=creator&source=instagram&noHandle=1&limit=60');
    expect(!igList2.data.leads.some(l => String(l._id) === String(igPost.insertedId)), 'Une fiche complétée ne doit plus être proposée à l\'assistant', igList2);
    await db.collection('leads').deleteOne({ _id: igPost.insertedId });
    // Créateur sans email avec un profil Instagram : remis une seule fois à l'assistant, puis la ligne importée ajoute l'email à la fiche existante
    const ne = await db.collection('leads').insertOne({ kind: 'creator', source: 'youtube', externalId: `noemail-${RUN}`, name: `Sans Email ${RUN}`, url: `https://www.youtube.com/@sansemail${RUN}`, socials: { instagram: `https://www.instagram.com/sansemail${RUN}/` }, description: 'Créatrice UGC', status: 'qualified', score: 99, createdAt: new Date(), updatedAt: new Date() });
    const batch = await brandApi('POST', '/admin/acquisition/leads/assistant-batch', { limit: 60 });
    expect(batch.status === 200 && batch.data.links.includes(`https://www.instagram.com/sansemail${RUN}/`), 'Le profil sans email doit être remis à l\'assistant', batch);
    const batch2 = await brandApi('POST', '/admin/acquisition/leads/assistant-batch', { limit: 60 });
    expect(!batch2.data.links.includes(`https://www.instagram.com/sansemail${RUN}/`), 'Un profil déjà remis ne doit pas être redonné avant 30 jours', batch2);
    const addMail = await brandApi('POST', '/admin/acquisition/leads/import', { kind: 'creator', text: `https://www.instagram.com/sansemail${RUN}/ ; sansemail-${RUN}@needcreator-test.com ; UGC beauté, Lyon – 2 300 abonnés ; https://linktr.ee/sansemail${RUN}` });
    const neDoc = await db.collection('leads').findOne({ _id: ne.insertedId });
    expect(addMail.status === 201 && addMail.data.emailsAdded === 1 && addMail.data.created === 0 && neDoc.email === `sansemail-${RUN}@needcreator-test.com` && neDoc.status === 'qualified' && neDoc.source === 'youtube' && /UGC beauté, Lyon/.test(neDoc.description), 'L\'email doit être ajouté à la fiche existante, sans nouvelle fiche', { status: addMail.status, data: { res: addMail.data, neDoc } });
    const same = await brandApi('POST', '/admin/acquisition/leads/import', { kind: 'creator', text: `https://www.instagram.com/sansemail${RUN}/ ; sansemail-${RUN}@needcreator-test.com ; UGC beauté, Lyon – 2 300 abonnés ; https://linktr.ee/sansemail${RUN}` });
    expect(same.data.created === 0 && same.data.emailsAdded === 0 && same.data.duplicates === 1, 'Réimporter la même ligne ne change rien', same);
    await db.collection('leads').deleteOne({ _id: ne.insertedId });
    // Chaîne YouTube sans aucun réseau connu : second lot pour l'assistant, puis la ligne importée (casse différente) ajoute Instagram et email à la fiche
    const yt = await db.collection('leads').insertOne({ kind: 'creator', source: 'youtube', externalId: `ytonly-${RUN}`, name: `Chaine Seule ${RUN}`, url: `https://www.youtube.com/@chaineseule${RUN}`, socials: { youtube: `https://www.youtube.com/@chaineseule${RUN}` }, description: 'Créatrice UGC', status: 'qualified', score: 98, stats: { subscribers: 40 }, createdAt: new Date(), updatedAt: new Date() });
    const ytBatch = await brandApi('POST', '/admin/acquisition/leads/assistant-batch', { type: 'youtube', limit: 60 });
    expect(ytBatch.status === 200 && ytBatch.data.type === 'youtube' && ytBatch.data.links.some(l => l.startsWith(`https://www.youtube.com/@chaineseule${RUN} ; `)), 'La chaîne sans réseau doit être remise à l\'assistant (lien ; nom)', ytBatch);
    const ytImp = await brandApi('POST', '/admin/acquisition/leads/import', { kind: 'creator', text: `https://www.youtube.com/@ChaineSeule${RUN}/ ; https://www.instagram.com/chaineseule.ig${RUN}/ ; chaineseule-${RUN}@needcreator-test.com ; UGC food Nantes – 850 abonnés ; https://linktr.ee/chaineseule${RUN}` });
    const ytDoc = await db.collection('leads').findOne({ _id: yt.insertedId });
    expect(ytImp.status === 201 && ytImp.data.created === 0 && ytImp.data.emailsAdded === 1 && ytDoc.email === `chaineseule-${RUN}@needcreator-test.com` && ytDoc.socials.instagram === `https://www.instagram.com/chaineseule.ig${RUN}/` && ytDoc.stats.subscribers === 40, 'Instagram et email attendus sur la fiche YouTube existante, abonnés YouTube conservés', { status: ytImp.status, data: { res: ytImp.data, ytDoc } });
    await db.collection('leads').deleteOne({ _id: yt.insertedId });
    // Décompte « pourquoi tous les prospects ne sont pas dans le mailing » : chaque fiche dans une seule case, la somme donne le total
    const bd = await brandApi('GET', '/admin/acquisition/mailing/breakdown');
    const sumOf = (k) => ['pushed', 'eligible', 'noEmail', 'rejected', 'lowScore', 'generic', 'known', 'registered', 'toQualify'].reduce((a, x) => a + bd.data[k][x], 0);
    expect(bd.status === 200 && sumOf('creator') === bd.data.creator.total && sumOf('brand') === bd.data.brand.total && bd.data.creator.total === await db.collection('leads').countDocuments({ kind: 'creator' }) && bd.data.creator.pushed >= 1, 'Le décompte du mailing doit être exhaustif (somme = total) et compter les prospects envoyés', bd);
    // « Compléter les réseaux (tous) » : passe en arrière-plan, le TikTok cité dans la bio d'un prospect sans réseaux est retrouvé
    const bare = await db.collection('leads').insertOne({ kind: 'creator', source: 'manual', externalId: `bare-${RUN}`, name: `Sans Reseaux ${RUN}`, description: `Créatrice UGC. TikTok : @bare${RUN}`, status: 'qualified', createdAt: new Date(), updatedAt: new Date() });
    const enr = await brandApi('POST', '/admin/acquisition/leads/enrich-socials');
    expect(enr.status === 200 && enr.data.total >= 1 && /lancée|Déjà en cours/.test(enr.data.message), 'Lancement de la recherche des réseaux attendu', enr);
    let enriched = null;
    for (let i = 0; i < 60 && !enriched; i++) { const l = await db.collection('leads').findOne({ _id: bare.insertedId }); if (l?.socials?.tiktok) enriched = l; else await new Promise(r => setTimeout(r, 1000)); }
    expect(enriched?.socials?.tiktok === `https://www.tiktok.com/@bare${RUN}`, 'Le TikTok de la bio doit être relevé par la passe groupée', { status: 200, data: enriched });
    await db.collection('leads').deleteOne({ _id: bare.insertedId });
    // Suppression d'un prospect = liste d'exclusion : ni réimporté ni recollecté (politique de confidentialité)
    const delOne = await brandApi('DELETE', `/admin/acquisition/leads/${one._id}`);
    expect(delOne.status === 200 && /exclusion/.test(delOne.data.message), 'Suppression avec mise en liste d\'exclusion attendue', delOne);
    const reimp = await brandApi('POST', '/admin/acquisition/leads/import', { kind: 'creator', text: `Import Une ; https://www.instagram.com/imp1${RUN}/ ; imp1-${RUN}@needcreator-test.com` });
    expect(reimp.status === 201 && reimp.data.created === 0 && reimp.data.suppressed === 1, 'Un prospect supprimé ne doit pas pouvoir être réimporté', reimp);
    const stored = await db.collection('leadsuppressions').find({}).limit(200).toArray();
    expect(stored.length >= 2 && stored.every(x => /^[a-f0-9]{64}$/.test(x.hash) && !JSON.stringify(x).includes('imp1-')), 'La liste d\'exclusion ne doit contenir que des empreintes', { status: 200, data: stored.slice(0, 2) });
    await db.collection('leads').deleteMany({ _id: { $in: impB.data.ids.map(id => new mongoose.Types.ObjectId(id)) } });
    const note = await brandApi('PATCH', `/admin/acquisition/leads/${b.data.lead._id}`, { status: 'contacted', contactedVia: 'linkedin', notes: 'Message envoyé sur LinkedIn' });
    expect(note.status === 200 && note.data.lead.status === 'contacted' && note.data.lead.contactedAt && note.data.lead.contactedVia === 'linkedin', 'Mise à jour manuelle du prospect échouée', note);
    const del = await brandApi('DELETE', `/admin/acquisition/leads/${b.data.lead._id}`);
    expect(del.status === 200, 'Suppression du prospect échouée', del);
    await db.collection('leads').deleteMany({ $or: [{ email: new RegExp(`^e2e-lead-${RUN}`) }, { handle: `@leavlog${RUN}` }, { handle: `@rebond${RUN}` }, { name: 'Marque Répond' }] });
    await db.collection('externalcreators').deleteMany({ username: `leavlog${RUN}` });
    return `prospects créateur et marque, ${aiOn ? `qualification IA (score ${c.data.lead.score}, ${c.data.lead.status})` : 'IA non configurée'}, filtres, statut groupé, CSV mailing, import annuaire ; ${mailingNote}`;
  } finally {
    await db.collection('users').updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  }
});

await step('Marque : invite un créateur extérieur par email, rattaché à la campagne à son inscription', async () => {
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const c = await brandApi('POST', '/campaigns', { title: 'Campagne avec invitation extérieure', description: 'Description suffisamment longue pour passer la validation de cinquante caractères minimum.', videoType: 'demo', duration: 30, deliverables: 1, budget: 120, niches: ['beauty'], applicationDeadline: deadline });
  expect(c.status === 201, 'Création campagne échouée', c);
  const cid = c.data.campaign._id;
  const early = await brandApi('POST', `/campaigns/${cid}/invite-external`, { email: `e2e-guest-${RUN}@needcreator-test.com` });
  expect(early.status === 400, 'Pas d\'invitation avant publication', early);
  await brandApi('POST', `/campaigns/${cid}/publish`);
  const self = await brandApi('POST', `/campaigns/${cid}/invite-external`, { email: brandEmail });
  expect(self.status === 400, 'Sa propre adresse doit être refusée', self);
  const extEmail = `e2e-guest-${RUN}@needcreator-test.com`;
  const inv = await brandApi('POST', `/campaigns/${cid}/invite-external`, { email: extEmail, name: 'Léa' });
  expect(inv.status === 200 && inv.data.existing === false && /campaignInvite=/.test(inv.data.link), 'Invitation extérieure non créée', inv);
  const token = inv.data.link.split('campaignInvite=')[1];
  const info = await fetch(`${API}/campaigns/invitation/${token}`).then(r => r.json());
  expect(info.email === extEmail && info.campaignTitle === 'Campagne avec invitation extérieure' && info.companyName, 'Infos d\'invitation publiques incorrectes', { status: 200, data: info });
  const fu = await firebaseUser(extEmail);
  const extApi = client(fu.idToken);
  const reg = await extApi('POST', '/auth/register/creator', { acceptTerms: true, email: extEmail, name: 'Léa Invitée', bio: '', niches: ['beauty'], minPrice: 80, campaignInviteToken: token });
  expect(reg.status === 201 && String(reg.data.invitedCampaignId) === String(cid), 'L\'inscription avec jeton doit renvoyer la campagne rattachée', reg);
  extraCleanup.push({ userId: reg.data.user.id, uid: fu.uid });
  const seen = await extApi('GET', `/campaigns/${cid}`);
  expect(seen.status === 200 && seen.data.campaign.invited === true, 'Le créateur invité doit voir la campagne (malgré l\'avant-première) et être marqué invité', seen);
  const used = await fetch(`${API}/campaigns/invitation/${token}`);
  expect(used.status === 404, 'Un jeton utilisé ne doit plus être valide', { status: used.status });
  const existing = await brandApi('POST', `/campaigns/${cid}/invite-external`, { email: creatorEmail });
  expect(existing.status === 200 && existing.data.existing === true, 'Un créateur déjà inscrit doit être invité directement', existing);
  const camp = await brandApi('GET', `/campaigns/${cid}`);
  expect(camp.data.campaign.invitations?.some(i => String(i.creatorId?._id || i.creatorId) === creatorUser.id), 'Le créateur existant doit figurer dans les invitations', camp);
  await mongoose.connection.db.collection('campaigns').deleteOne({ _id: new mongoose.Types.ObjectId(cid) });
  return 'invitation extérieure → inscription rattachée ; créateur existant invité directement';
});

if (CLEAN) {
  await step('Nettoyage des données de test', async () => {
    const db = mongoose.connection.db;
    await db.collection('settings').deleteOne({ key: 'ambassadorFeePercent' }); // retour à la valeur par défaut (neutralisée à 10 pendant le test)
    const ids = [brandUser?.id, creatorUser?.id].filter(Boolean).map(id => new mongoose.Types.ObjectId(id));
    const camps = await db.collection('campaigns').find({ brandId: ids[0] }).project({ _id: 1 }).toArray();
    const campIds = camps.map(c => c._id);
    await db.collection('reviews').deleteMany({ campaignId: { $in: campIds } });
    await db.collection('reports').deleteMany({ $or: [{ reporterId: { $in: ids } }, { targetUserId: { $in: ids } }] });
    await db.collection('invoices').deleteMany({ $or: [{ brandId: { $in: ids } }, { creatorId: { $in: ids } }] });
    await db.collection('deliveries').deleteMany({ campaignId: { $in: campIds } });
    await db.collection('campaigns').deleteMany({ _id: { $in: campIds } });
    await db.collection('contents').deleteMany({ brandId: { $in: ids } });
    // Campagnes d'amorçage restantes des comptes de test (ou orphelines après suppression d'un compte)
    const testBrandIds = (await db.collection('users').find({ email: /needcreator-test\.com$/ }).project({ _id: 1 }).toArray()).map(u => u._id);
    const seedCamps = await db.collection('campaigns').find({ 'seed.batch': { $exists: true } }).project({ _id: 1, brandId: 1 }).toArray();
    const existingBrands = new Set((await db.collection('users').find({ _id: { $in: seedCamps.map(c => c.brandId) } }).project({ _id: 1 }).toArray()).map(u => String(u._id)));
    const orphanSeed = seedCamps.filter(c => testBrandIds.some(id => String(id) === String(c.brandId)) || !existingBrands.has(String(c.brandId))).map(c => c._id);
    if (orphanSeed.length) { await db.collection('deliveries').deleteMany({ campaignId: { $in: orphanSeed } }); await db.collection('campaigns').deleteMany({ _id: { $in: orphanSeed } }); }
    const extraIds = extraCleanup.map(e => new mongoose.Types.ObjectId(e.userId));
    await db.collection('reviews').deleteMany({ $or: [{ revieweeId: { $in: extraIds } }, { reviewerId: { $in: extraIds } }] });
    await db.collection('deliveries').deleteMany({ creatorId: { $in: extraIds } });
    await db.collection('users').deleteMany({ _id: { $in: [...ids, ...extraIds] } });
    for (const u of [brand, creator, ...extraCleanup]) { if (u) await admin.auth().deleteUser(u.uid).catch(() => {}); }
    return 'comptes et données supprimés';
  });
}

await mongoose.disconnect().catch(() => {});

console.log(`\n=== Résultat : ${results.length - failed}/${results.length} étapes OK ===\n`);
process.exit(failed ? 1 : 0);
