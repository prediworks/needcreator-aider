import admin from 'firebase-admin';
import Campaign from '../models/Campaign.js';
import User from '../models/User.js';
import Delivery from '../models/Delivery.js';
import { CAMPAIGN_TEMPLATES } from '../../config/campaignTemplates.js';
import { getFeePercents } from '../models/Setting.js';
import { config } from '../config/index.js';
import { notifyNotSelected } from './campaigns.js';
import logger from '../utils/logger.js';

/**
 * Amorçage (admin) : marques et campagnes créées en masse pour que l'application ne paraisse pas vide.
 * Invisible côté créateur (le champ `seed` n'est jamais exposé). Chaque lot est supprimable d'un bloc.
 * Garde-fou : à la date limite, une campagne du lot se clôture et les candidats reçoivent l'email de non-sélection.
 */
const SECTORS = {
  'beaute': 'beauty-testimonial', 'beauté': 'beauty-testimonial', 'cosmetique': 'beauty-testimonial', 'cosmétique': 'beauty-testimonial', 'soin': 'beauty-testimonial',
  'ecommerce': 'ecommerce-unboxing', 'e-commerce': 'ecommerce-unboxing', 'boutique': 'ecommerce-unboxing', 'lifestyle': 'ecommerce-unboxing', 'maison': 'ecommerce-unboxing',
  'food': 'food-recipe', 'alimentation': 'food-recipe', 'boisson': 'food-recipe', 'boissons': 'food-recipe', 'epicerie': 'food-recipe', 'épicerie': 'food-recipe',
  'tech': 'tech-demo', 'application': 'tech-demo', 'app': 'tech-demo', 'logiciel': 'tech-demo', 'saas': 'tech-demo',
  'mode': 'fashion-tryon', 'fashion': 'fashion-tryon', 'accessoires': 'fashion-tryon', 'bijoux': 'fashion-tryon', 'textile': 'fashion-tryon',
  'service': 'service-tutorial', 'services': 'service-tutorial', 'abonnement': 'service-tutorial', 'formation': 'service-tutorial', 'coaching': 'service-tutorial',
};
const TITLE_VARIANTS = ['Lancement {p}', 'Nouvelle collection {p}', 'Édition limitée {p}', 'Offre de rentrée {p}', 'Best-seller {p} : vidéos témoignage', '{p} : avis clients en vidéo', 'Découverte {p}', '{p} en situation réelle'];
const PRODUCTS = {
  'beauty-testimonial': ['sérum vitamine C', 'crème de nuit', 'huile visage', 'gommage corps', 'shampoing solide', 'baume à lèvres', 'masque capillaire', 'déodorant naturel', 'crème solaire minérale', 'eau micellaire', 'contour des yeux', 'vernis longue tenue'],
  'ecommerce-unboxing': ['coffret cadeau', 'gourde isotherme', 'lampe d\'ambiance', 'organiseur de bureau', 'sac week-end', 'tapis de yoga', 'plaid en laine', 'bougie parfumée', 'carnet relié', 'casque audio', 'kit de plantation', 'trousse de voyage'],
  'food-recipe': ['granola bio', 'sauce piquante', 'infusion du soir', 'pâte à tartiner', 'kit brunch', 'café de spécialité', 'miel de montagne', 'huile d\'olive nouvelle', 'chocolat noir 85 %', 'kombucha maison', 'pâtes artisanales', 'mélange à pancakes'],
  'tech-demo': ['application de budget', 'montre connectée', 'enceinte nomade', 'clavier compact', 'appli de méditation', 'tracker de sommeil', 'prise connectée', 'chargeur sans fil', 'appli de covoiturage', 'caméra de vélo', 'liseuse', 'assistant vocal'],
  'fashion-tryon': ['veste en lin', 'sneakers recyclées', 'robe d\'été', 'sac banane', 'lunettes de soleil', 'jean droit', 'chemise oversize', 'montre minimaliste', 'sandales en cuir', 'bonnet en laine', 'trench léger', 'boucles d\'oreilles dorées'],
  'service-tutorial': ['abonnement fitness', 'cours de langue en ligne', 'coaching sommeil', 'box de jardinage', 'application de recettes', 'service de repassage', 'abonnement de café', 'cours de piano en ligne', 'livraison de paniers de légumes', 'application de méditation', 'formation photo smartphone', 'service de ménage'],
};
/** Tire un produit puis un titre non encore utilisés dans le lot pour ce modèle : deux marques d'un même secteur n'ont pas le même sujet */
function pickUnique(state, key, list) {
  const used = state[key] || (state[key] = new Set());
  const free = list.filter(x => !used.has(x));
  const chosen = free.length ? rand(free) : rand(list);
  used.add(chosen);
  return chosen;
}
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const between = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const templateFor = (sector) => { const k = String(sector || '').trim().toLowerCase(); return CAMPAIGN_TEMPLATES.find(t => t.key === (SECTORS[k] || Object.entries(SECTORS).find(([w]) => k.includes(w))?.[1])) || rand(CAMPAIGN_TEMPLATES); };

/** Ligne : email ; mot de passe ; entreprise ; SIRET ; site ; secteur ; nombre de campagnes ; tarif max (0 = devis libre, vide = fourchette du lot) ; commentaire (facultatif : repris dans la présentation de la marque et dans chaque brief) */
export function parseSeedLines(text) {
  const rows = []; const errors = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const raw = line.trim(); if (!raw || raw.startsWith('#')) return;
    const [email, password, companyName, siret, website, sector, countRaw, maxRaw, ...rest] = raw.split(';').map(x => (x || '').trim());
    const comment = rest.filter(Boolean).join(' ; ').trim().slice(0, 600); // le commentaire peut contenir des points-virgules
    const n = parseInt(countRaw || '3', 10);
    const maxBudget = maxRaw === '' || maxRaw === undefined ? null : parseInt(maxRaw.replace(/[^\d]/g, ''), 10);
    const err = [];
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) err.push('email invalide');
    if (!password || password.length < 8) err.push('mot de passe : 8 caractères minimum');
    if (!companyName) err.push('nom d\'entreprise manquant');
    if (siret && !/^\d{14}$/.test(siret.replace(/\s/g, ''))) err.push('SIRET : 14 chiffres');
    if (!Number.isFinite(n) || n < 0 || n > 20) err.push('nombre de campagnes entre 0 et 20');
    if (maxBudget !== null && (!Number.isFinite(maxBudget) || maxBudget < 0 || (maxBudget > 0 && maxBudget < config.business.minQuotePrice))) err.push(`tarif max : 0 (devis libre) ou au moins ${config.business.minQuotePrice} €`);
    if (err.length) errors.push({ line: i + 1, raw, errors: err });
    else rows.push({ email: email.toLowerCase(), password, companyName, siret: siret ? siret.replace(/\s/g, '') : '', website: website && !/^https?:/.test(website) ? `https://${website}` : website, sector, count: n, maxBudget, comment, template: templateFor(sector).key });
  });
  return { rows, errors };
}

export async function previewSeed(req, res) {
  const { rows, errors } = parseSeedLines(req.body?.lines);
  const existing = await User.find({ email: { $in: rows.map(r => r.email) } }).select('email role').lean();
  res.json({ rows: rows.map(r => ({ ...r, password: undefined, existing: existing.find(u => u.email === r.email)?.role || null })), errors, totalCampaigns: rows.reduce((a, r) => a + r.count, 0) });
}

async function ensureBrand(row, batch) {
  let user = await User.findOne({ email: row.email });
  if (user && user.role !== 'brand') throw new Error(`${row.email} existe déjà avec le rôle ${user.role}`);
  let fb;
  try { fb = await admin.auth().getUserByEmail(row.email); await admin.auth().updateUser(fb.uid, { password: row.password, emailVerified: true }); }
  catch { fb = await admin.auth().createUser({ email: row.email, password: row.password, emailVerified: true }); }
  const created = !user;
  if (!user) {
    user = new User({
      firebaseUid: fb.uid, email: row.email, role: 'brand', status: 'active',
      profile: { companyName: row.companyName, name: row.companyName, website: row.website || undefined, industry: row.sector || undefined, bio: row.comment || `${row.companyName} : ${row.sector || 'marque'} qui cherche des vidéos authentiques pour ses réseaux et sa boutique.`, company: { siret: row.siret || undefined, country: 'FR' } },
      legal: { termsVersion: config.legal.termsVersion, acceptedAt: new Date() },
      legalInfo: { signatoryName: `Direction ${row.companyName}`, signatoryTitle: 'Gérant(e)', updatedAt: new Date() },
    });
  } else if (user.firebaseUid !== fb.uid) {
    user.firebaseUid = fb.uid;
  }
  user.set('verification.email', true);
  user.set('verification.business', { status: 'verified', method: 'admin', checkedAt: new Date(), note: 'Compte d\'amorçage (admin)' });
  user.set('seed', { batch });
  await user.save();
  return { user, created };
}

async function makeCampaign(brand, row, opts, batch, fees, state = {}) {
  const t = templateFor(row.sector);
  const product = pickUnique(state, `product:${t.key}`, PRODUCTS[t.key] || PRODUCTS['ecommerce-unboxing']);
  const title = pickUnique(state, `title:${t.key}`, TITLE_VARIANTS).replace('{p}', product).replace(/^\w/, c => c.toUpperCase());
  const deliverables = between(1, 3);
  // Tarif max de la ligne : 0 = devis libre (pas de budget affiché), sinon plafond ; vide = fourchette du lot avec une part de devis libres (réglage du lot)
  const freeQuote = row.maxBudget === 0 || (row.maxBudget === null && Math.random() * 100 < opts.freeQuoteShare);
  const max = row.maxBudget > 0 ? row.maxBudget : opts.budgetMax;
  const min = Math.min(opts.budgetMin, max);
  const budget = freeQuote ? null : Math.round(between(min, max) / 10) * 10;
  const publishedAt = new Date(Date.now() - between(0, opts.publishedWithinDays) * 86400000 - between(0, 23) * 3600000);
  const deadline = new Date(Date.now() + between(2, opts.deadlineWithinDays) * 86400000); deadline.setHours(23, 59, 59, 999);
  return Campaign.create({
    brandId: brand._id, platformFeePercent: brand.isPro?.() ? fees.pro : fees.standard, type: 'paid',
    title, description: `${t.description}\n\nProduit concerné : ${product}.${row.comment ? `\n\nÀ propos de ${row.companyName} : ${row.comment}` : ''}`,
    brief: { videoType: t.videoType, duration: t.duration, deliverables, requirements: t.requirements, deliveryTypes: ['file', 'link'], platforms: t.platforms, productShipping: t.productShipping, productDescription: t.productShipping ? `${product} envoyé au créateur sélectionné` : '' },
    visibility: 'public', budget: budget ? { total: budget, perVideo: Math.round(budget / deliverables) } : {},
    matching: { niches: t.niches, creatorsWanted: 1 },
    timeline: { publishedAt, applicationDeadline: deadline }, status: 'active',
    seed: { batch, closeAtDeadline: !!opts.closeAtDeadline },
  });
}

export async function runSeed(req, res) {
  try {
    const { rows, errors } = parseSeedLines(req.body?.lines);
    if (errors.length) return res.status(400).json({ error: `${errors.length} ligne(s) invalide(s)`, errors });
    if (!rows.length) return res.status(400).json({ error: 'Aucune ligne' });
    const opts = { publishedWithinDays: Math.min(90, Math.max(0, parseInt(req.body?.publishedWithinDays ?? 30, 10))), deadlineWithinDays: Math.min(120, Math.max(3, parseInt(req.body?.deadlineWithinDays ?? 30, 10))), budgetMin: Math.max(config.business.minQuotePrice, parseInt(req.body?.budgetMin ?? 150, 10)), budgetMax: Math.max(config.business.minQuotePrice, parseInt(req.body?.budgetMax ?? 600, 10)), closeAtDeadline: req.body?.closeAtDeadline !== false, freeQuoteShare: Math.min(100, Math.max(0, parseInt(req.body?.freeQuoteShare ?? 30, 10) || 0)) };
    if (opts.budgetMax < opts.budgetMin) opts.budgetMax = opts.budgetMin;
    const batch = `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`;
    const fees = await getFeePercents();
    const out = { batch, accounts: 0, existing: 0, campaigns: 0, details: [] };
    const state = {}; // sujets déjà utilisés dans ce lot, par modèle
    for (const row of rows) {
      const { user, created } = await ensureBrand(row, batch);
      created ? out.accounts++ : out.existing++;
      let n = 0;
      for (let i = 0; i < row.count; i++) { await makeCampaign(user, row, opts, batch, fees, state); n++; }
      out.campaigns += n;
      out.details.push({ email: row.email, created, campaigns: n });
    }
    logger.warn(`SEED batch ${batch} by admin ${req.user._id}: ${out.accounts} comptes créés, ${out.existing} existants, ${out.campaigns} campagnes`);
    res.json({ message: `Lot ${batch} : ${out.accounts} compte(s) créé(s), ${out.existing} existant(s), ${out.campaigns} campagne(s) publiée(s)`, ...out });
  } catch (error) {
    logger.error('runSeed failed:', error);
    res.status(500).json({ error: `Amorçage impossible : ${error.message}` });
  }
}

export async function listSeedBatches(req, res) {
  const camps = await Campaign.aggregate([{ $match: { 'seed.batch': { $exists: true, $ne: null } } }, { $group: { _id: '$seed.batch', campaigns: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, applications: { $sum: { $size: { $ifNull: ['$applications', []] } } }, createdAt: { $min: '$createdAt' } } }, { $sort: { createdAt: -1 } }]);
  const users = await User.aggregate([{ $match: { 'seed.batch': { $exists: true, $ne: null } } }, { $group: { _id: '$seed.batch', accounts: { $sum: 1 }, emails: { $push: '$email' } } }]);
  const byBatch = new Map(users.map(u => [u._id, u]));
  const batches = camps.map(c => ({ batch: c._id, campaigns: c.campaigns, active: c.active, applications: c.applications, createdAt: c.createdAt, accounts: byBatch.get(c._id)?.accounts || 0, emails: byBatch.get(c._id)?.emails || [] }));
  for (const u of users) if (!batches.some(b => b.batch === u._id)) batches.push({ batch: u._id, campaigns: 0, active: 0, applications: 0, createdAt: null, accounts: u.accounts, emails: u.emails });
  res.json({ batches });
}

/** Supprime un lot : campagnes (et devis reçus, livraisons éventuelles), puis les comptes si demandé (base + Firebase) */
export async function deleteSeedBatch(req, res) {
  try {
    const batch = req.params.batch;
    const withUsers = req.query.users === '1' || req.body?.users === true;
    const camps = await Campaign.find({ 'seed.batch': batch }).select('_id').lean();
    const ids = camps.map(c => c._id);
    const db = Campaign.db;
    const out = { batch, campaigns: ids.length, deliveries: 0, accounts: 0 };
    out.deliveries = (await Delivery.deleteMany({ campaignId: { $in: ids } })).deletedCount;
    await db.collection('conversations').deleteMany({ campaignId: { $in: ids } });
    await db.collection('reviews').deleteMany({ campaignId: { $in: ids } });
    await db.collection('invoices').deleteMany({ campaignId: { $in: ids } });
    await db.collection('contents').deleteMany({ campaignId: { $in: ids } });
    await Campaign.deleteMany({ _id: { $in: ids } });
    if (withUsers) {
      const users = await User.find({ 'seed.batch': batch, role: 'brand' }).select('_id email firebaseUid');
      for (const u of users) {
        await Campaign.deleteMany({ brandId: u._id });
        await db.collection('notifications').deleteMany({ userId: u._id });
        await db.collection('contents').deleteMany({ brandId: u._id });
        if (u.firebaseUid) await admin.auth().deleteUser(u.firebaseUid).catch(() => {});
        await User.deleteOne({ _id: u._id });
        out.accounts++;
      }
    }
    logger.warn(`SEED batch ${batch} deleted by admin ${req.user._id}: ${JSON.stringify(out)}`);
    res.json({ message: `Lot ${batch} supprimé : ${out.campaigns} campagne(s)${withUsers ? `, ${out.accounts} compte(s)` : ''}`, ...out });
  } catch (error) {
    logger.error('deleteSeedBatch failed:', error);
    res.status(500).json({ error: `Suppression impossible : ${error.message}` });
  }
}

/** Tâche planifiée : clôture des campagnes d'amorçage arrivées à échéance, candidats prévenus (email de non-sélection) */
export async function closeSeededCampaigns() {
  const due = await Campaign.find({ 'seed.closeAtDeadline': true, status: 'active', 'timeline.applicationDeadline': { $lt: new Date() } });
  let closed = 0;
  for (const c of due) {
    const pending = c.applications.filter(a => a.status === 'pending').map(a => String(a.creatorId));
    c.applications.forEach(a => { if (a.status === 'pending') a.status = 'rejected'; });
    c.status = 'completed';
    await c.save();
    if (pending.length) await notifyNotSelected(c, pending).catch(() => {});
    closed++;
  }
  if (closed) logger.info(`Seeded campaigns closed at deadline: ${closed}`);
  return closed;
}
