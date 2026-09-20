import dns from 'dns/promises';
import net from 'net';
import { z } from 'zod';
import ProductBrief from '../models/ProductBrief.js';
import Campaign from '../models/Campaign.js';
import { getFeePercents } from '../models/Setting.js';
import { generateJson, generateBrief, aiConfig } from './ai.js';
import { estimateRate, marketRatesData, GRID } from '../controllers/marketRates.js';
import { notify } from './notifications.js';
import logger from '../utils/logger.js';

const NICHES = ['beauty', 'fashion', 'tech', 'food', 'travel', 'fitness', 'gaming', 'lifestyle', 'parenting', 'pets', 'home', 'business', 'education', 'health'];
const VIDEO_TYPES = Object.keys(GRID);
const TYPE_LABELS = { testimonial: 'Témoignage', unboxing: 'Unboxing', demo: 'Démonstration', tutorial: 'Tutoriel', review: 'Avis', comparison: 'Comparatif', lifestyle: 'Lifestyle', 'behind-the-scenes': 'Coulisses', interview: 'Interview', challenge: 'Challenge', haul: 'Haul', vlog: 'Vlog' };

const decodeEntities = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
const stripTags = (html) => decodeEntities(String(html || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const meta = (html, name) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i');
  const m = html.match(re);
  return decodeEntities(m ? (m[1] || m[2] || '') : '').trim();
};

const isPrivateIp = (ip) => {
  if (net.isIPv6(ip)) return /^(::1|fc|fd|fe80)/i.test(ip) || /^::ffff:(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(ip);
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
};

/** URL publique http(s) uniquement, hors réseaux privés (anti-SSRF) ; ALLOW_LOCAL_FETCH=1 pour les tests */
export async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { throw Object.assign(new Error('Adresse invalide'), { status: 400 }); }
  if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error('Adresse invalide : http ou https attendu'), { status: 400 });
  if (process.env.ALLOW_LOCAL_FETCH === '1') return u;
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname)) throw Object.assign(new Error('Adresse non autorisée'), { status: 400 });
  let addrs = [];
  try { addrs = await dns.lookup(u.hostname, { all: true }); } catch { throw Object.assign(new Error('Site introuvable'), { status: 400 }); }
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw Object.assign(new Error('Adresse non autorisée'), { status: 400 });
  return u;
}

const MAX_BYTES = 2500 * 1024; // fiches Shopify : l'en-tête dépasse souvent 400 Ko
const FETCH_TIMEOUT = 12000;

/** Lecture de la page avec un statut explicite (site qui bloque, page absente, délai) */
async function fetchProductPage(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 NeedCreator/1.0', Accept: 'text/html,application/xhtml+xml,*/*;q=0.5', 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5' } });
    if (res.status === 404 || res.status === 410) throw Object.assign(new Error('Page introuvable (404) : vérifiez l\'adresse du produit'), { status: 422 });
    if (res.status === 403 || res.status === 401 || res.status === 429) throw Object.assign(new Error('Ce site bloque la lecture automatique (protection anti-robot). Décrivez le produit à la main ci-dessous.'), { status: 422, code: 'UNREADABLE' });
    if (!res.ok) throw Object.assign(new Error(`Page indisponible (erreur ${res.status})`), { status: 422 });
    if (!/text\/html|application\/xhtml/.test(res.headers.get('content-type') || '')) throw Object.assign(new Error('Cette adresse n\'est pas une page web'), { status: 422 });
    const reader = res.body.getReader();
    let received = 0; const chunks = [];
    while (received < MAX_BYTES) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); received += value.length; }
    try { reader.cancel(); } catch { /* flux déjà fermé */ }
    return Buffer.concat(chunks).toString('utf8');
  } catch (err) {
    if (err.status) throw err;
    const blocked = /redirect count exceeded/i.test(String(err.cause?.message || err.message));
    throw Object.assign(new Error(err.name === 'AbortError' ? 'Le site met trop de temps à répondre, réessayez' : blocked ? 'Ce site bloque la lecture automatique (protection anti-robot). Décrivez le produit à la main ci-dessous.' : 'Page illisible : vérifiez que l\'adresse est publique et accessible, ou décrivez le produit à la main ci-dessous'), { status: 422, code: 'UNREADABLE' });
  } finally { clearTimeout(t); }
}

/**
 * Trouve une fiche produit sur le site d'une marque à partir de sa page d'accueil (liens /products/, /produit/, /product/, /p/…).
 * Sert au brief offert : on part du site connu du prospect, pas d'un lien fourni. Retourne l'adresse de la fiche, ou le site lui-même à défaut.
 */
export async function findProductPage(siteUrl) {
  const base = await assertPublicUrl(siteUrl);
  let html;
  try { html = await fetchProductPage(base.href); } catch { return base.href; }
  const seen = new Set(); const found = [];
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    let u; try { u = new URL(m[1], base.href); } catch { continue; }
    if (u.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
    const path = u.pathname.toLowerCase();
    if (!/\/(products|produits?|product|shop|boutique|p|article|articles)\/[^/]+/.test(path)) continue;
    if (/\.(jpg|jpeg|png|webp|svg|css|js|json|xml)$/.test(path) || /\/(cart|panier|account|compte|search|recherche|collections?\/?$)/.test(path)) continue;
    const clean = `${u.origin}${u.pathname}`;
    if (seen.has(clean)) continue; seen.add(clean);
    found.push({ url: clean, score: (/\/products\//.test(path) ? 3 : 1) + (path.split('/').filter(Boolean).pop().length > 8 ? 1 : 0) });
    if (found.length >= 40) break;
  }
  found.sort((a, b) => b.score - a.score);
  return found[0]?.url || base.href;
}

/** Lit une fiche produit : JSON-LD Product, Open Graph, balises meta, texte principal */
export async function extractProduct(url) {
  const html = await fetchProductPage(url);
  const product = { name: '', brand: '', description: '', price: null, currency: '', image: '' };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const json = JSON.parse(m[1]);
      const nodes = [].concat(json['@graph'] || json);
      const p = nodes.find(n => /Product/i.test(String(n?.['@type'])));
      if (!p) continue;
      product.name ||= String(p.name || '');
      product.brand ||= typeof p.brand === 'string' ? p.brand : String(p.brand?.name || '');
      product.description ||= String(p.description || '');
      const offer = [].concat(p.offers || [])[0];
      if (offer && product.price == null) { const pr = parseFloat(offer.price ?? offer.lowPrice); if (Number.isFinite(pr)) { product.price = pr; product.currency = String(offer.priceCurrency || ''); } }
      product.image ||= typeof p.image === 'string' ? p.image : String([].concat(p.image || [])[0]?.url || [].concat(p.image || [])[0] || '');
    } catch { /* JSON-LD invalide : ignoré */ }
  }
  product.name ||= meta(html, 'og:title') || decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  product.description ||= meta(html, 'og:description') || meta(html, 'description');
  product.image ||= meta(html, 'og:image');
  product.brand ||= meta(html, 'og:site_name') || meta(html, 'product:brand');
  if (product.price == null) { const pr = parseFloat(meta(html, 'product:price:amount') || meta(html, 'og:price:amount')); if (Number.isFinite(pr)) { product.price = pr; product.currency = meta(html, 'product:price:currency') || meta(html, 'og:price:currency'); } }
  const body = (html.match(/<body[\s\S]*<\/body>/i) || [html])[0];
  const text = stripTags(body).slice(0, 4000);
  product.name = product.name.slice(0, 150); product.description = stripTags(product.description).slice(0, 1500); product.brand = product.brand.slice(0, 80);
  if (!product.name && text.length < 80) throw Object.assign(new Error('Aucune fiche produit trouvée sur cette page. Décrivez le produit à la main ci-dessous.'), { status: 422, code: 'UNREADABLE' });
  return { product, text };
}

const analysisSchema = z.object({
  positioning: z.string().min(20).max(400),
  audience: z.string().min(10).max(300),
  niche: z.enum(NICHES),
  angles: z.array(z.object({ title: z.string().min(3).max(80), hook: z.string().min(5).max(200), why: z.string().min(5).max(250) })).min(3).max(3),
  videoType: z.enum(VIDEO_TYPES),
  duration: z.number().int().min(15).max(90),
  deliverables: z.number().int().min(1).max(5),
  platforms: z.array(z.enum(['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin', 'website'])).min(1).max(4),
});
const clip = (s, n) => String(s || '').trim().slice(0, n);
function normalizeAnalysis(raw) {
  const num = (v, d) => { const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) ? n : d; };
  const angles = (Array.isArray(raw.angles) ? raw.angles : []).slice(0, 3).map(a => ({ title: clip(a?.title || a?.titre, 80), hook: clip(a?.hook || a?.accroche, 200), why: clip(a?.why || a?.pourquoi || a?.rationale, 250) }));
  while (angles.length < 3) angles.push({ title: `Angle ${angles.length + 1}`, hook: 'Montrez le produit en situation réelle dès la première seconde.', why: 'Angle générique proposé faute de détail suffisant sur la page.' });
  const niche = String(raw.niche || '').toLowerCase();
  const videoType = String(raw.videoType || raw.video_type || '').toLowerCase();
  const platforms = (Array.isArray(raw.platforms) ? raw.platforms : []).map(p => String(p).toLowerCase()).filter(p => ['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin', 'website'].includes(p));
  return {
    positioning: clip(raw.positioning || raw.positionnement, 400), audience: clip(raw.audience || raw.cible, 300),
    niche: NICHES.includes(niche) ? niche : 'lifestyle', angles,
    videoType: VIDEO_TYPES.includes(videoType) ? videoType : 'testimonial',
    duration: Math.min(90, Math.max(15, num(raw.duration, 30))), deliverables: Math.min(5, Math.max(1, num(raw.deliverables, 2))),
    platforms: platforms.length ? platforms.slice(0, 4) : ['tiktok', 'instagram'],
  };
}

/** Analyse IA de la fiche : positionnement, cible, trois angles, format */
export async function analyzeProduct({ product, text }) {
  const prompt = `Fiche produit lue sur ${product.brand || 'un site e-commerce'} :
Nom : ${product.name || 'non précisé'}
Prix : ${product.price != null ? `${product.price} ${product.currency || ''}` : 'non précisé'}
Description : ${product.description || 'non précisée'}
Extrait de la page : ${text.slice(0, 2500)}

Déduis pour une campagne de vidéos UGC :
- "positioning" : le positionnement du produit en 1 à 2 phrases (promesse, différence).
- "audience" : la cible principale (âge, situation, besoin).
- "niche" : une valeur parmi ${NICHES.join(', ')}.
- "angles" : exactement 3 angles créatifs différents, chacun avec "title" (court), "hook" (l'accroche des 3 premières secondes, à l'oral) et "why" (pourquoi cet angle pour ce produit).
- "videoType" : une valeur parmi ${VIDEO_TYPES.join(', ')}.
- "duration" : durée recommandée en secondes (15 à 60).
- "deliverables" : nombre de vidéos recommandé pour un premier test (1 à 3).
- "platforms" : réseaux pertinents parmi tiktok, instagram, youtube, facebook, linkedin, website.
N'invente aucune caractéristique absente de la fiche. Réponds uniquement avec l'objet JSON, textes en français.`;
  return generateJson({ system: 'Tu es un directeur de création UGC pragmatique. Tu réponds en JSON strict.', prompt, schema: analysisSchema, normalize: normalizeAnalysis });
}

/** Chaîne complète : lecture, analyse, brief, budget, enregistrement */
export async function buildProductBrief(url, { ip, manual } = {}) {
  if (!aiConfig().configured) throw Object.assign(new Error('Génération indisponible : IA non configurée sur le serveur'), { status: 503 });
  const u = await assertPublicUrl(url);
  // Repli : description saisie à la main quand la page ne peut pas être lue (protection anti-robot)
  const extracted = manual?.description
    ? { product: { name: clip(manual.name, 150), brand: clip(manual.brand, 80) || u.hostname.replace(/^www\./, ''), description: clip(manual.description, 1500), price: Number.isFinite(Number(manual.price)) && Number(manual.price) > 0 ? Number(manual.price) : null, currency: 'EUR', image: '' }, text: clip(manual.description, 4000) }
    : await extractProduct(u.href);
  const analysis = await analyzeProduct(extracted);
  const { product } = extracted;
  const brief = await generateBrief({
    productDescription: `${product.name}${product.price != null ? ` (${product.price} ${product.currency || '€'})` : ''}. ${product.description || ''} Positionnement : ${analysis.positioning} Angles retenus : ${analysis.angles.map(a => `${a.title} (« ${a.hook} »)`).join(' ; ')}.`,
    brandName: product.brand || u.hostname.replace(/^www\./, ''), industry: analysis.niche, videoType: analysis.videoType, videoTypeLabel: TYPE_LABELS[analysis.videoType],
    platforms: analysis.platforms.join(', '), niches: analysis.niche, goal: 'faire découvrir le produit et générer des ventes', tone: 'authentique', duration: analysis.duration, deliverables: analysis.deliverables,
  });
  const rates = await marketRatesData();
  const est = estimateRate({ videoType: analysis.videoType, duration: analysis.duration, deliverables: analysis.deliverables, rights: '1y', supports: 'social_organic,paid_ads' }, rates.rates);
  const doc = await ProductBrief.create({
    url: u.href, domain: u.hostname.replace(/^www\./, ''), ip, product, analysis, manual: !!manual?.description,
    brief: { title: brief.title, description: brief.description, requirements: brief.requirements, dos: brief.dos, donts: brief.donts, hashtags: brief.hashtags },
    budget: { low: est.total.low, mid: est.total.mid, high: est.total.high, perVideoMid: est.perVideo.mid },
  });
  logger.info(`Product brief ${doc._id} generated from ${u.hostname}`);
  return doc;
}

/** Transforme un brief URL en campagne brouillon pour la marque (inscription ou marque connectée) */
export async function createDraftCampaignFromProductBrief(brand, pb) {
  if (pb.campaignId) return Campaign.findById(pb.campaignId);
  const fees = await getFeePercents();
  const a = pb.analysis || {}; const b = pb.brief || {};
  const platforms = (a.platforms || ['tiktok', 'instagram']).filter(p => ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'website', 'other'].includes(p));
  const campaign = await Campaign.create({
    brandId: brand._id, platformFeePercent: fees.standard, type: 'paid', status: 'draft', visibility: 'public',
    title: b.title || `Vidéos UGC ${pb.product?.name || pb.domain}`.slice(0, 100),
    description: (b.description || `Campagne préparée depuis ${pb.url}. ${a.positioning || ''}`).slice(0, 1000),
    brief: {
      videoType: a.videoType || 'testimonial', duration: a.duration || 30, deliverables: a.deliverables || 1,
      requirements: (b.requirements || []).slice(0, 10), deliveryTypes: ['file', 'link'], platforms: platforms.length ? platforms : ['tiktok', 'instagram'],
      productShipping: true, productDescription: `${pb.product?.name || ''}${pb.product?.price != null ? ` (${pb.product.price} ${pb.product.currency || '€'})` : ''} · ${pb.url}`.slice(0, 1000),
      dosDonts: { dos: (b.dos || []).slice(0, 6), donts: (b.donts || []).slice(0, 6) },
    },
    budget: pb.budget?.mid >= 50 ? { total: pb.budget.mid, perVideo: pb.budget.perVideoMid, currency: 'EUR' } : undefined,
    matching: { niches: [a.niche || 'lifestyle'], creatorsWanted: 1 },
    timeline: { applicationDeadline: new Date(Date.now() + 14 * 86400000) },
  });
  pb.claimedBy = brand._id; pb.campaignId = campaign._id; await pb.save();
  notify(brand._id, { type: 'system', title: 'Votre brief est prêt à publier', text: `Campagne préparée depuis ${pb.domain} : relisez, ajustez le budget et publiez.`, href: `/campaigns/${campaign._id}` }).catch(() => {});
  logger.info(`Draft campaign ${campaign._id} created from product brief ${pb._id} (brand ${brand._id})`);
  return campaign;
}
