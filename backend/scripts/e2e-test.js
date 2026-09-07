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

async function firebaseUser(email) {
  let user;
  try { user = await admin.auth().getUserByEmail(email); }
  catch { user = await admin.auth().createUser({ email, password: 'Test1234!', emailVerified: true }); }
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
let brandUser, creatorUser, campaign, delivery;

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

await step('Inscription marque (+ client Stripe)', async () => {
  const res = await brandApi('POST', '/auth/register/brand', {
    email: brandEmail, companyName: 'Marque Test E2E', website: 'https://exemple.fr', industry: 'ecommerce',
  });
  expect(res.status === 201, 'Inscription marque échouée', res);
  brandUser = res.data.user;
  expect(brandUser.stripeCustomerId, 'Client Stripe non créé', res);
  return `id ${brandUser.id}, Stripe ${brandUser.stripeCustomerId}`;
});

await step('Inscription créateur (bio vide acceptée)', async () => {
  const res = await creatorApi('POST', '/auth/register/creator', {
    email: creatorEmail, name: 'Créateur Test E2E', bio: '', niches: ['beauty', 'lifestyle'], minPrice: 100,
  });
  expect(res.status === 201, 'Inscription créateur échouée', res);
  creatorUser = res.data.user;
  expect(creatorUser.status === 'pending', 'Le créateur devrait être en attente de validation', res);
  return `id ${creatorUser.id}, statut ${creatorUser.status}`;
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

await step('Campagne : publication', async () => {
  const res = await brandApi('POST', `/campaigns/${campaign._id}/publish`);
  expect(res.status === 200 && res.data.campaign.status === 'active', 'Publication échouée', res);
  return `${res.data.notifiedCreators} créateur(s) notifié(s)`;
});

await step('Candidature refusée tant que le créateur n\'est pas validé', async () => {
  const res = await creatorApi('POST', `/campaigns/${campaign._id}/apply`, { proposal: '', price: 250, estimatedDeliveryDays: 5 });
  expect(res.status === 403, 'Devrait être refusé (403)', res);
  return res.data.error;
});

await step('Admin : validation du créateur', async () => {
  // Promotion temporaire de la marque en admin pour valider le créateur
  await mongoose.connect(process.env.MONGODB_URI);
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

await step('Marque : approbation (encaissement Stripe)', async () => {
  const res = await brandApi('POST', `/deliveries/${delivery._id}/approve`);
  expect(res.status === 200 && res.data.delivery.status === 'approved', 'Approbation échouée', res);
  const camp = await brandApi('GET', `/campaigns/${campaign._id}`);
  expect(camp.data.campaign.status === 'completed', 'La campagne devrait être terminée', camp);
  const profile = await creatorApi('GET', '/auth/profile');
  expect(profile.data.user.profile.stats.completedJobs >= 1, 'completedJobs devrait être incrémenté', profile);
  return `paiement ${res.data.delivery.payment.status}${res.data.warning ? ' — ' + res.data.warning : ''}`;
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
  let pub = await fetch(`${API}/portfolio/creator/${creatorUser.id}`).then(r => r.json());
  expect(pub.realisations.length === 1 && pub.realisations[0].isPublic, 'Le lien devrait être public par défaut sur le profil', { status: 200, data: pub });
  const priv = await brandApi('PATCH', `/deliveries/${d}/links/${linkId}/visibility`, { public: false });
  expect(priv.status === 200 && priv.data.isPublic === false, 'La marque devrait pouvoir rendre le lien privé', priv);
  pub = await fetch(`${API}/portfolio/creator/${creatorUser.id}`).then(r => r.json());
  expect(pub.realisations.length === 0, 'Un lien privé ne doit pas apparaître publiquement', { status: 200, data: pub });
  const asBrand = await brandApi('GET', `/portfolio/creator/${creatorUser.id}`);
  expect(asBrand.data.realisations.length === 1 && asBrand.data.realisations[0].isPublic === false, 'La marque concernée doit voir le lien privé', asBrand);
  return 'public par défaut, privé dès qu\'une partie refuse, visible par la marque concernée';
});

await step('Avis : marque → créateur et créateur → marque', async () => {
  const r1 = await brandApi('POST', `/reviews/campaign/${campaign._id}`, { rating: 5, comment: 'Excellent travail', communication: 5, quality: 5, timeliness: 4, professionalism: 5 });
  expect(r1.status === 201, 'Avis marque échoué', r1);
  const r2 = await creatorApi('POST', `/reviews/campaign/${campaign._id}`, { rating: 4, comment: '', communication: 4, quality: 4, timeliness: 4, professionalism: 4 });
  expect(r2.status === 201, 'Avis créateur échoué', r2);
  const dup = await brandApi('POST', `/reviews/campaign/${campaign._id}`, { rating: 5, communication: 5, quality: 5, timeliness: 5, professionalism: 5 });
  expect(dup.status === 400, 'Un double avis devrait être refusé', dup);
  const list = await fetch(`${API}/reviews/user/${creatorUser.id}`).then(r => r.json());
  expect(list.stats.avgRating === 5 && list.reviews.length === 1, 'Moyenne des avis incorrecte', { status: 200, data: list });
  const profile = await creatorApi('GET', '/auth/profile');
  expect(profile.data.user.profile.stats.rating === 5, 'La note du profil créateur devrait être 5', profile);
  return 'note créateur 5.0';
});

await step('Livraison : détail avec avis (canReview / myReview)', async () => {
  const res = await brandApi('GET', `/deliveries/${delivery._id}`);
  expect(res.status === 200 && res.data.delivery.myReview && res.data.delivery.canReview === false, 'Infos avis manquantes', res);
  return 'OK';
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

// Nettoyage
if (CLEAN) {
  await step('Nettoyage des données de test', async () => {
    const db = mongoose.connection.db;
    const ids = [brandUser?.id, creatorUser?.id].filter(Boolean).map(id => new mongoose.Types.ObjectId(id));
    const camps = await db.collection('campaigns').find({ brandId: ids[0] }).project({ _id: 1 }).toArray();
    const campIds = camps.map(c => c._id);
    await db.collection('reviews').deleteMany({ campaignId: { $in: campIds } });
    await db.collection('deliveries').deleteMany({ campaignId: { $in: campIds } });
    await db.collection('campaigns').deleteMany({ _id: { $in: campIds } });
    await db.collection('users').deleteMany({ _id: { $in: ids } });
    for (const u of [brand, creator]) { if (u) await admin.auth().deleteUser(u.uid).catch(() => {}); }
    return 'comptes et données supprimés';
  });
}

await mongoose.disconnect().catch(() => {});

console.log(`\n=== Résultat : ${results.length - failed}/${results.length} étapes OK ===\n`);
process.exit(failed ? 1 : 0);
