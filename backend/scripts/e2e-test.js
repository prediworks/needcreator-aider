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
  if (!cond) throw new Error(`${message}${res ? ' → HTTP ' + res.status + ' ' + JSON.stringify(res.data).slice(0, 300) : ''}`);
}

// Petit fichier vidéo factice (les vrais encodages ne sont pas nécessaires pour tester l'upload)
function fakeVideo(name) {
  const bytes = Buffer.concat([Buffer.from('\x00\x00\x00\x18ftypmp42', 'binary'), Buffer.alloc(2048, 1)]);
  return new File([bytes], name, { type: 'video/mp4' });
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
  if (fake.data.registryChecked && !/injoignable/.test(fake.data.business.note || '')) {
    expect(fake.status === 200 && fake.data.business.status === 'rejected' && /introuvable/.test(fake.data.business.note), 'Un SIRET bien formé mais inexistant au registre doit être refusé', fake);
  }
  const ok = await brandApi('POST', '/auth/business-verification', { siret: '356 000 000 00048', website: 'https://exemple.fr' });
  expect(ok.status === 200 && ok.data.business.status === 'verified' && ok.data.business.method === 'auto', 'La vérification automatique devrait réussir (SIRET réel, site, email pro)', ok);
  const registryOk = ok.data.registry?.legalName === 'LA POSTE' || /injoignable/.test(ok.data.business.note || '');
  expect(registryOk, 'Le registre devrait renvoyer la raison sociale', ok);
  // Désactivation depuis l'admin : le SIRET fictif passe alors le contrôle formel
  await users.updateOne({ email: brandEmail }, { $set: { role: 'admin' } });
  const list = await brandApi('GET', '/admin/settings');
  expect(list.status === 200 && list.data.settings.some(x => x.key === 'businessRegistryCheck'), 'Réglage registre absent', list);
  const off = await brandApi('PUT', '/admin/settings/businessRegistryCheck', { value: false });
  expect(off.status === 200, 'Désactivation du registre échouée', off);
  await users.updateOne({ email: brandEmail }, { $set: { role: 'brand' } });
  const formal = await brandApi('POST', '/auth/business-verification', { siret: '732 829 320 00074', website: 'https://exemple.fr' });
  expect(formal.status === 200 && formal.data.business.status === 'verified' && formal.data.registryChecked === false, 'Registre désactivé : contrôle formel seulement', formal);
  await settings.updateOne({ key: 'businessRegistryCheck' }, { $set: { value: true } });
  return `registre : ${ok.data.registry?.legalName || 'injoignable, contrôle formel'} ; désactivation admin OK`;
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

await step('Portfolio : lecture publique (GET /portfolio/creator/:id)', async () => {
  const res = await fetch(`${API}/portfolio/creator/${creatorUser.id}`);
  const data = await res.json();
  expect(res.status === 200 && data.creator.profile.portfolio.length === 3, 'Portfolio public illisible', { status: res.status, data });
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

await step('Marque : voit la candidature (score de matching)', async () => {
  const res = await brandApi('GET', `/campaigns/${campaign._id}`);
  expect(res.status === 200 && res.data.campaign.applications?.length === 1, 'Candidature invisible côté marque', res);
  const app = res.data.campaign.applications[0];
  expect(app.creatorId?.profile?.name, 'Profil du candidat non peuplé', res);
  expect(app.quote?.terms === 'Produit à fournir par la marque.', 'Le devis devrait être visible par la marque', res);
  return `${app.creatorId.profile.name} — ${app.price}€ — match ${app.matchScore}%`;
});

await step('Marque : sélection du créateur (+ livraison + paiement Stripe test)', async () => {
  const res = await brandApi('POST', `/campaigns/${campaign._id}/select/${creatorUser.id}`);
  expect(res.status === 200, 'Sélection échouée', res);
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
  const sel = await brandApi('POST', `/campaigns/${c.data.campaign._id}/select/${creatorUser.id}`);
  expect(sel.status === 200 && sel.data.delivery.payment.amount === 150, 'Sélection / montant du devis incorrect', sel);
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
  return 'public par défaut, privé dès qu\'une partie refuse, visible par la marque concernée';
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
  const extEmail = `e2e-ext-${RUN}@needcreator-test.com`;
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

await step('Gifting : campagne produit offert (Pro), candidature à 0 €, frais de plateforme, opt-in créateur', async () => {
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const tooCheap = await brandApi('POST', '/campaigns', { title: 'Gifting valeur trop faible', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.', videoType: 'unboxing', duration: 30, deliverables: 1, niches: ['beauty'], applicationDeadline: deadline, type: 'gifting', giftingProductName: 'Échantillon', giftingProductValue: 10 });
  expect(tooCheap.status === 403 && /30/.test(tooCheap.data.error), 'Un produit < 30 € doit être refusé', tooCheap);
  const c = await brandApi('POST', '/campaigns', { title: 'Campagne gifting sérum offert', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.', videoType: 'unboxing', duration: 30, deliverables: 2, niches: ['beauty'], applicationDeadline: deadline, type: 'gifting', giftingProductName: 'Coffret sérum', giftingProductValue: 45 });
  expect(c.status === 201 && c.data.campaign.type === 'gifting' && !c.data.campaign.budget?.total, 'Création gifting échouée', c);
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
  // Limite mensuelle : 2 campagnes gifting max
  await brandApi('POST', '/campaigns', { title: 'Deuxième gifting du mois', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.', videoType: 'unboxing', duration: 30, deliverables: 1, niches: ['beauty'], applicationDeadline: deadline, type: 'gifting', giftingProductName: 'Crème', giftingProductValue: 40 });
  const third = await brandApi('POST', '/campaigns', { title: 'Troisième gifting du mois', description: 'Description suffisamment longue pour passer la validation de cinquante caractères.', videoType: 'unboxing', duration: 30, deliverables: 1, niches: ['beauty'], applicationDeadline: deadline, type: 'gifting', giftingProductName: 'Crème', giftingProductValue: 40 });
  expect(third.status === 403 && /limite/i.test(third.data.error), 'La 3e campagne gifting du mois doit être refusée', third);
  return 'gifting : 10 € de frais encaissés, créateur 0 €, opt-in respecté, limite mensuelle active';
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
if (CLEAN) {
  await step('Nettoyage des données de test', async () => {
    const db = mongoose.connection.db;
    const ids = [brandUser?.id, creatorUser?.id].filter(Boolean).map(id => new mongoose.Types.ObjectId(id));
    const camps = await db.collection('campaigns').find({ brandId: ids[0] }).project({ _id: 1 }).toArray();
    const campIds = camps.map(c => c._id);
    await db.collection('reviews').deleteMany({ campaignId: { $in: campIds } });
    await db.collection('reports').deleteMany({ $or: [{ reporterId: { $in: ids } }, { targetUserId: { $in: ids } }] });
    await db.collection('invoices').deleteMany({ $or: [{ brandId: { $in: ids } }, { creatorId: { $in: ids } }] });
    await db.collection('deliveries').deleteMany({ campaignId: { $in: campIds } });
    await db.collection('campaigns').deleteMany({ _id: { $in: campIds } });
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
