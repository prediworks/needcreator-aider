import { z } from 'zod';
import AdScan, { AdScanRequest } from '../models/AdScan.js';
import Lead from '../models/Lead.js';
import { getSetting, SETTINGS } from '../models/Setting.js';
import { fetchAds, metaConfigured } from './acquisition/meta.js';
import { generateJsonText, aiConfig } from './ai.js';
import { assembleBrief } from './productBrief.js';
import { GRID } from '../controllers/marketRates.js';
import { notifyAdmins } from './adminAlerts.js';
import logger from '../utils/logger.js';

/**
 * Scan concurrentiel : la marque (ou un visiteur) entre le nom d'un concurrent, on lit ses publicités Meta actives par la bibliothèque
 * publicitaire, l'IA en tire des constats factuels, et un clic prépare « l'équivalent » en brief NeedCreator.
 * Règles : une lecture Meta + IA par page et par 24 h quel que soit le trafic ; plafonds par palier (anonyme, inscrit, Pro), par IP et global ;
 * constats comptés, jamais de jugement ; on ne garde que du texte et des dates, les aperçus restent chez Meta.
 */

export const DAY = 86400000;
const setting = (k) => getSetting(SETTINGS[k].key, SETTINGS[k].default);

export async function scanSettings() {
  const keys = ['scanAnonPerDay', 'scanMemberPerDay', 'scanProPerDay', 'scanAnonAds', 'scanIpPerHour', 'scanGlobalPerDay', 'scanMaxAds', 'scanBlockedPages', 'scanPinned'];
  const vals = await Promise.all(keys.map(setting));
  return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
}

/** Palier d'un visiteur : anonyme, inscrit (marque ou créateur, compte actif), marque Pro */
export function tierOf(user) {
  if (!user) return 'anon';
  return typeof user.isPro === 'function' && user.isPro() ? 'pro' : 'member';
}

export const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'marque';

const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

export function isBlockedPage(list, { pageId, pageName }) {
  const items = String(list || '').split(/[,\n;]+/).map(x => x.trim()).filter(Boolean);
  return items.some(x => x === String(pageId) || (norm(x).length >= 3 && norm(x) === norm(pageName)));
}

const ageDays = (d, now = Date.now()) => (d ? Math.max(0, Math.floor((now - new Date(d).getTime()) / DAY)) : null);
const domainOf = (cap) => { const d = String(cap || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]; return d && d.includes('.') && !/facebook|instagram|fb\.me|linktr|bit\.ly|wa\.me/.test(d) ? d : null; };

/** Publicité Meta brute → ce qu'on garde (texte, dates, ciblage déclaré). Jamais l'URL d'aperçu : elle porte notre jeton. */
export function pickAd(ad) {
  const loc = (ad.target_locations || []).filter(l => !l.excluded).map(l => l.name).filter(Boolean);
  return {
    id: String(ad.id || ''),
    body: String(ad.ad_creative_bodies?.[0] || '').slice(0, 1500),
    title: String(ad.ad_creative_link_titles?.[0] || '').slice(0, 300),
    description: String(ad.ad_creative_link_descriptions?.[0] || '').slice(0, 500),
    caption: String(ad.ad_creative_link_captions?.[0] || '').slice(0, 200),
    startedAt: ad.ad_delivery_start_time ? new Date(ad.ad_delivery_start_time) : null,
    platforms: (ad.publisher_platforms || []).slice(0, 6),
    reach: Number.isFinite(Number(ad.eu_total_reach)) ? Number(ad.eu_total_reach) : null,
    ages: ad.target_ages ? `${ad.target_ages[0] || ''}-${ad.target_ages[1] || ''}`.replace(/^-|-$/g, '') : '',
    gender: String(ad.target_gender || ''),
    countries: loc.slice(0, 10),
    languages: (ad.languages || []).slice(0, 5),
  };
}

/**
 * Une même création diffusée dans plusieurs ensembles de publicités apparaît autant de fois : on garde une entrée par texte (titre + corps),
 * avec la date de début la plus ancienne, les supports réunis, la portée additionnée et le nombre de variantes ; les plus anciennes d'abord.
 */
export function dedupeAds(ads) {
  const byText = new Map();
  for (const a of ads) {
    const key = `${a.title}|${a.body}`.toLowerCase().replace(/\s+/g, ' ').trim();
    const cur = byText.get(key);
    if (!cur) { byText.set(key, { ...a, variants: 1 }); continue; }
    cur.variants += 1;
    if (a.startedAt && (!cur.startedAt || a.startedAt < cur.startedAt)) { cur.startedAt = a.startedAt; cur.id = a.id; }
    cur.platforms = [...new Set([...(cur.platforms || []), ...(a.platforms || [])])];
    cur.countries = [...new Set([...(cur.countries || []), ...(a.countries || [])])].slice(0, 10);
    if (a.reach) cur.reach = (cur.reach || 0) + a.reach;
  }
  return [...byText.values()].sort((a, b) => (a.startedAt?.getTime() || Infinity) - (b.startedAt?.getTime() || Infinity));
}

/** Chiffres de la page : ancienneté, répartition par support, pays, âges, portée cumulée */
export function adStats(ads, now = Date.now()) {
  const ages = ads.map(a => ageDays(a.startedAt, now)).filter(n => n != null).sort((a, b) => a - b);
  const platforms = {}; const countries = {}; const ageRanges = {};
  let reach = 0;
  for (const a of ads) {
    for (const p of a.platforms || []) platforms[p] = (platforms[p] || 0) + 1;
    for (const c of a.countries || []) countries[c] = (countries[c] || 0) + 1;
    if (a.ages) ageRanges[a.ages] = (ageRanges[a.ages] || 0) + 1;
    if (a.reach) reach += a.reach;
  }
  const top = (o, n) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, n).map(([k]) => k);
  return {
    oldestDays: ages.length ? ages[ages.length - 1] : null,
    medianDays: ages.length ? ages[Math.floor(ages.length / 2)] : null,
    over90Days: ages.filter(n => n >= 90).length,
    platforms, countries: top(countries, 5), ages: top(ageRanges, 3), reach: reach || null,
  };
}

const insightsSchema = z.object({
  summary: z.string().max(400).default(''),
  angles: z.array(z.object({ name: z.string().max(60), count: z.number().int().min(0).max(200), example: z.string().max(220).default('') })).max(8).default([]),
  hooks: z.array(z.string().max(160)).max(5).default([]),
  missing: z.array(z.string().max(160)).max(3).default([]),
  facts: z.array(z.string().max(220)).max(4).default([]),
});
// Mots de jugement bannis des constats : on compte et on décrit, on n'évalue pas le concurrent
const JUDGMENT = /\b(médiocre|mauvais|mauvaise|nul|nulle|ringard|faible|pauvre|raté|ratée|ennuyeux|ennuyeuse|amateur|dépassé|dépassée|incohérent|incohérente|catastroph|lamentable|minable)\b/i;
const factual = (s) => (JUDGMENT.test(String(s || '')) ? '' : String(s || '').trim());
// Coupe un texte trop long à la fin d'une phrase plutôt qu'au milieu d'un mot
const cutAtSentence = (s, max) => { if (s.length <= max) return s; const head = s.slice(0, max); const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.')); return (end > max / 2 ? head.slice(0, end + 1) : head.replace(/\s+\S*$/, '') + '…').trim(); };

/** Lecture IA des publicités : angles comptés avec exemple cité, accroches récurrentes, angles absents, constats chiffrés */
export async function analyzeAds({ pageName, ads, stats, totalActive = 0 }) {
  if (!aiConfig().configured || !ads.length) return null;
  const detailed = Math.min(30, ads.length);
  const list = ads.slice(0, 30).map((a, i) => `#${i + 1} (tourne depuis ${ageDays(a.startedAt) ?? '?'} j${a.platforms?.length ? `, ${a.platforms.join('/')}` : ''}) ${[a.title, a.body, a.description].filter(Boolean).join(' — ').replace(/\s+/g, ' ').slice(0, 350)}`).join('\n');
  const out = await generateJsonText({
    system: 'Tu analyses les publicités actives d\'une marque pour une plateforme française de vidéos UGC. Tu es strictement factuel : tu comptes et tu décris ce qui est écrit, tu ne juges jamais la marque ni la qualité de ses publicités. Tu réponds en JSON strict, en français.',
    prompt: `Marque : « ${pageName} ». ${totalActive || ads.length} publicités actives en France${stats.oldestDays != null ? `, la plus ancienne tourne depuis ${stats.oldestDays} jours` : ''}${stats.over90Days ? `, ${stats.over90Days} depuis plus de 90 jours` : ''}. Les ${detailed} plus anciennes sont détaillées ci-dessous (une même création diffusée plusieurs fois compte une fois) ; tes comptes portent sur ces ${detailed} publicités, sans commenter leur nombre.
Publicités (texte seulement, Meta ne donne pas la vidéo) :
${list}

Réponds avec :
- "summary" : 2 phrases factuelles sur ce que vendent ces publicités et à qui (ce qui est écrit, rien d'autre).
- "angles" : les angles de persuasion utilisés, 3 à 6, chacun avec "name" (prix/promotion, preuve sociale, problème-solution, nouveauté, bénéfice concret, urgence, comparaison, mode d'emploi, émotion, garantie…), "count" (nombre de publicités qui l'utilisent, honnête) et "example" (une phrase recopiée d'une publicité qui l'illustre).
- "hooks" : jusqu'à 5 débuts de texte ou formules qui reviennent dans plusieurs publicités, recopiés.
- "missing" : 3 angles courants en UGC que ces publicités n'utilisent pas (sans dire que c'est un défaut : « Aucune publicité ne montre… »).
- "facts" : 3 à 4 constats chiffrés (« 12 publicités sur 15 citent le prix », « 9 publicités ciblent les 25-44 ans », « la publicité la plus ancienne, #3, tourne depuis 94 jours »).
Interdit : tout adjectif d'évaluation (bon, mauvais, efficace, faible…), toute recommandation, toute supposition sur les résultats.`,
    schema: insightsSchema,
    // Chaque borne du schéma est appliquée ici : le modèle déborde volontiers (résumé long, dix angles), et un débordement ferait tout rejeter
    normalize: (raw) => ({
      summary: cutAtSentence(factual(raw?.summary), 400),
      angles: (Array.isArray(raw?.angles) ? raw.angles : []).map(a => ({ name: String(a?.name || '').slice(0, 60), count: Math.max(0, Math.min(200, parseInt(a?.count, 10) || 0)), example: factual(a?.example).slice(0, 220) })).filter(a => a.name).slice(0, 8),
      hooks: (Array.isArray(raw?.hooks) ? raw.hooks : []).map(h => factual(typeof h === 'string' ? h : h?.text || h?.hook || '').slice(0, 160)).filter(Boolean).slice(0, 5),
      missing: (Array.isArray(raw?.missing) ? raw.missing : []).map(h => factual(typeof h === 'string' ? h : h?.text || h?.name || '').slice(0, 160)).filter(Boolean).slice(0, 3),
      facts: (Array.isArray(raw?.facts) ? raw.facts : []).map(h => factual(typeof h === 'string' ? h : h?.text || '').slice(0, 220)).filter(Boolean).slice(0, 4),
    }),
  });
  out.angles.sort((a, b) => b.count - a.count);
  return out;
}

/** Pages candidates pour un nom tapé : regroupement des publicités trouvées par mot-clé, nom exact d'abord, puis par nombre de publicités */
export async function findPages(q) {
  const ads = await fetchAds({ terms: q, max: 100 }); // une seule page de résultats : quelques secondes
  const byPage = new Map();
  for (const ad of ads) {
    if (!ad.page_id) continue;
    const cur = byPage.get(ad.page_id) || { pageId: String(ad.page_id), pageName: ad.page_name || '', ads: 0, website: null, sample: '' };
    cur.ads++;
    if (!cur.website) cur.website = domainOf(ad.ad_creative_link_captions?.[0]);
    if (!cur.sample && ad.ad_creative_bodies?.[0]) cur.sample = String(ad.ad_creative_bodies[0]).slice(0, 160);
    byPage.set(ad.page_id, cur);
  }
  const target = norm(q);
  return [...byPage.values()].sort((a, b) => (norm(b.pageName) === target) - (norm(a.pageName) === target) || b.ads - a.ads).slice(0, 6);
}

async function uniqueSlug(pageName, pageId) {
  const base = slugify(pageName);
  const taken = await AdScan.findOne({ slug: base }).select('pageId').lean();
  return !taken || taken.pageId === String(pageId) ? base : `${base}-${String(pageId).slice(-5)}`;
}

/** Nombre de lectures fraîches déjà faites : par IP sur l'heure, par IP ou compte sur la journée, global sur la journée */
async function usage({ ip, userId }) {
  const hour = new Date(Date.now() - 3600000); const day = new Date(Date.now() - DAY);
  const [ipHour, ipDay, userDay, global] = await Promise.all([
    ip ? AdScanRequest.countDocuments({ ip, createdAt: { $gte: hour } }) : 0,
    ip ? AdScanRequest.countDocuments({ ip, createdAt: { $gte: day } }) : 0,
    userId ? AdScanRequest.countDocuments({ userId, createdAt: { $gte: day } }) : 0,
    AdScanRequest.countDocuments({ createdAt: { $gte: day } }),
  ]);
  return { ipHour, ipDay, userDay, global };
}

const quotaError = (message, code) => Object.assign(new Error(message), { status: 429, code });

/**
 * Lance ou relit un scan. `q` : nom tapé ; `pageId` : page choisie parmi les candidates. Retourne { scan } ou { candidates } quand le nom
 * correspond à plusieurs pages. Une relecture (scan de moins de 24 h) ne compte dans aucun plafond.
 */
export async function runScan({ q, pageId, pageName, ip, user } = {}) {
  const st = await scanSettings();
  const tier = tierOf(user);
  const name = String(q || '').trim().slice(0, 120);
  if (!pageId && name.length < 2) throw Object.assign(new Error('Entrez le nom d\'une marque (deux caractères au moins)'), { status: 400 });
  if (!(await metaConfigured())) throw Object.assign(new Error('Lecture des publicités indisponible pour le moment (accès Meta non configuré)'), { status: 503, code: 'META_OFF' });

  // Déjà lu depuis moins de 24 h : on relit, gratuitement
  const fresh = new Date(Date.now() - DAY);
  if (pageId) {
    const cached = await AdScan.findOne({ pageId: String(pageId), status: { $in: ['ready', 'empty'] }, fetchedAt: { $gte: fresh } });
    if (cached) return { scan: cached, cached: true };
  } else {
    const cached = await AdScan.findOne({ $or: [{ slug: slugify(name) }, { query: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }], status: { $in: ['ready', 'empty', 'pending'] }, fetchedAt: { $gte: fresh } });
    if (cached && (cached.status !== 'pending' || cached.updatedAt >= new Date(Date.now() - 3 * 60000))) return { scan: cached, cached: true };
  }

  // Plafonds : par IP et par heure (tous), par palier sur la journée, global
  const u = await usage({ ip, userId: user?._id });
  if (u.ipHour >= st.scanIpPerHour) throw quotaError(`Limite atteinte : ${st.scanIpPerHour} nouvelles marques par heure. Revenez dans une heure, ou relisez un scan déjà fait.`, 'RATE_LIMIT');
  const perDay = tier === 'pro' ? st.scanProPerDay : tier === 'member' ? st.scanMemberPerDay : st.scanAnonPerDay;
  const used = tier === 'anon' ? u.ipDay : u.userDay;
  if (used >= perDay) throw quotaError(tier === 'anon' ? `Limite atteinte : ${perDay} marques par jour sans compte. Créez un compte gratuit pour en scanner ${st.scanMemberPerDay} par jour et tout voir.` : `Limite atteinte : ${perDay} nouvelles marques par jour pour votre compte. Revenez demain.`, 'DAILY_LIMIT');
  if (u.global >= st.scanGlobalPerDay) {
    notifyAdmins('Scan concurrentiel : plafond global atteint', `<p>${u.global} nouveaux scans en 24 h, plafond ${st.scanGlobalPerDay}. Réglage : Admin → Réglages → Scan concurrentiel.</p>`).catch(() => {});
    throw quotaError('Outil très sollicité aujourd\'hui : revenez demain, ou relisez un scan déjà fait.', 'GLOBAL_LIMIT');
  }

  // Page à lire : choisie, ou unique candidate pour le nom tapé
  let page = null;
  if (pageId) {
    // Lecture déjà en cours pour cette page (lancée il y a moins de trois minutes) : on la suit, sans nouvelle lecture
    const pending = await AdScan.findOne({ pageId: String(pageId), status: 'pending', updatedAt: { $gte: new Date(Date.now() - 3 * 60000) } });
    if (pending) return { scan: pending, cached: true };
    page = { pageId: String(pageId), pageName: String(pageName || '').trim().slice(0, 160) };
  } else {
    const candidates = await findPages(name);
    if (!candidates.length) {
      const scan = await AdScan.findOneAndUpdate({ slug: slugify(name) }, { $set: { query: name, pageId: `none:${slugify(name)}`, pageName: name, ads: [], totalActive: 0, stats: {}, insights: null, status: 'empty', ip, userId: user?._id, fetchedAt: new Date() } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      await AdScanRequest.create({ ip, userId: user?._id, slug: scan.slug });
      return { scan };
    }
    const exact = candidates.filter(c => norm(c.pageName) === norm(name));
    if (candidates.length > 1 && exact.length !== 1) return { candidates };
    page = exact[0] || candidates[0];
  }
  if (isBlockedPage(st.scanBlockedPages, page)) throw Object.assign(new Error('Cette marque a demandé à ne pas apparaître dans l\'outil.'), { status: 410, code: 'BLOCKED' });

  // La lecture (deux appels Meta, puis l'IA) dépasse le délai d'une requête web : elle se fait en arrière-plan, la page suit l'avancement
  const slug = await uniqueSlug(page.pageName || name, page.pageId);
  const scan = await AdScan.findOneAndUpdate({ pageId: page.pageId }, {
    $set: { slug, query: name || page.pageName, pageName: page.pageName || name, status: 'pending', error: null },
    $setOnInsert: { ip, userId: user?._id, ads: [], totalActive: 0 },
    $inc: { scans: 1, memberScans: tier === 'anon' ? 0 : 1 },
  }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await AdScanRequest.create({ ip, userId: user?._id, slug: scan.slug });
  setImmediate(() => processScan(scan._id, { page, name, tier, ip, settings: st }).catch(err => logger.error(`Ad scan ${scan.slug} failed: ${err.message}`)));
  return { scan };
}

/** Lecture d'une page en arrière-plan : publicités chez Meta, chiffres, lecture IA (40 s au plus), puis le scan passe « prêt » (ou « vide », ou « en échec » avec le motif) */
export async function processScan(scanId, { page, name = '', tier = 'anon', ip = '', settings } = {}) {
  const st = settings || await scanSettings();
  const fail = async (message) => { await AdScan.updateOne({ _id: scanId }, { $set: { status: 'failed', error: String(message || '').slice(0, 300), fetchedAt: new Date() } }); };
  // Meta rend les publicités les plus récentes d'abord : il faut aller loin dans la liste pour trouver les plus anciennes (jusqu'à 500)
  let raw;
  try { raw = await fetchAds({ pageIds: [page.pageId], max: 500 }); }
  catch (err) { logger.warn(`Ad scan ${page.pageId}: Meta en échec (${err.message})`); return fail(err.code === 10 || err.code === 190 ? 'Accès Meta à renouveler (identité ou jeton) : l\'équipe est prévenue' : `Lecture Meta impossible : ${err.message}`); }
  const ads = dedupeAds(raw.map(pickAd).filter(a => a.body || a.title)).slice(0, st.scanMaxAds);
  const pageName = raw[0]?.page_name || page.pageName || name;
  if (isBlockedPage(st.scanBlockedPages, { pageId: page.pageId, pageName })) return AdScan.updateOne({ _id: scanId }, { $set: { pageName, status: 'blocked', fetchedAt: new Date() } });
  const stats = adStats(ads);
  const domains = {}; for (const a of ads) { const d = domainOf(a.caption); if (d) domains[d] = (domains[d] || 0) + 1; }
  const website = Object.entries(domains).sort((x, y) => y[1] - x[1])[0]?.[0] || null;
  // Les publicités sont publiées tout de suite (le scan est « prêt »), la lecture IA suit et la page l'affiche quand elle arrive
  await AdScan.updateOne({ _id: scanId }, { $set: { pageName, website: website ? `https://${website}` : null, ads, totalActive: raw.length, stats, status: ads.length ? 'ready' : 'empty', error: null, insights: null, insightsPending: ads.length > 0, fetchedAt: new Date() } });
  let insights = null;
  if (ads.length) {
    try { insights = await Promise.race([analyzeAds({ pageName, ads, stats, totalActive: raw.length }), new Promise((_, rej) => setTimeout(() => rej(new Error('délai IA dépassé')), 150000))]); }
    catch (err) { logger.warn(`Ad scan ${pageName}: IA en échec (${err.message})`); }
  }
  await AdScan.updateOne({ _id: scanId }, { $set: { insights, insightsPending: false } });
  logger.info(`Ad scan ${pageName}: ${raw.length} active ad(s), ${ads.length} kept, ${insights ? 'insights ok' : 'no insights'} (${tier}${ip ? `, ${ip}` : ''})`);
  return null;
}

/**
 * Scan préparé pour la prospection (concurrent cité dans l'email 1) : la page est lue à l'avance pour s'ouvrir tout de suite depuis l'email.
 * Hors plafonds des visiteurs ; une seule lecture à la fois (file d'attente) ; un scan de moins de `maxAgeDays` jours est réutilisé.
 */
let prepQueue = Promise.resolve();
export async function ensureScanForPage(page, { maxAgeDays = 14 } = {}) {
  const pageId = String(page?.pageId || '');
  if (!pageId) return null;
  const cur = await AdScan.findOne({ pageId });
  if (cur?.status === 'blocked') return null;
  if (cur && ((['ready', 'empty'].includes(cur.status) && cur.fetchedAt >= new Date(Date.now() - maxAgeDays * DAY)) || (cur.status === 'pending' && cur.updatedAt >= new Date(Date.now() - 30 * 60000)))) return cur;
  const pageName = String(page.pageName || '').trim().slice(0, 160);
  const slug = cur?.slug || await uniqueSlug(pageName, pageId);
  const scan = await AdScan.findOneAndUpdate({ pageId }, { $set: { slug, query: pageName, pageName, status: 'pending', error: null }, $setOnInsert: { ads: [], totalActive: 0 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  prepQueue = prepQueue.then(() => processScan(scan._id, { page: { pageId, pageName }, name: pageName, tier: 'prospection' })).catch(err => logger.error(`Prepared ad scan ${slug} failed: ${err.message}`));
  return scan;
}

const hasInsights = (scan) => !!(scan?.insights && (scan.insights.summary || scan.insights.facts?.length || scan.insights.angles?.length));

/**
 * Un scan prêt, avec des publicités mais sans lecture IA (lecture en échec, ou scan fait par une version qui échouait) : la lecture IA
 * est relancée seule, sans rappeler Meta, au plus une fois par heure. Appelé à chaque consultation de la page.
 */
export async function ensureInsights(scan) {
  if (!scan || scan.status !== 'ready' || !scan.ads?.length || hasInsights(scan) || scan.insightsPending || !aiConfig().configured) return false;
  if (scan.insightsTriedAt && Date.now() - new Date(scan.insightsTriedAt).getTime() < 3600000) return false;
  const r = await AdScan.updateOne({ _id: scan._id, insightsPending: { $ne: true } }, { $set: { insightsPending: true, insightsTriedAt: new Date() } });
  if (!r.modifiedCount) return false;
  scan.insightsPending = true;
  setImmediate(async () => {
    let insights = null;
    try { insights = await Promise.race([analyzeAds({ pageName: scan.pageName, ads: scan.ads, stats: scan.stats || adStats(scan.ads), totalActive: scan.totalActive }), new Promise((_, rej) => setTimeout(() => rej(new Error('délai IA dépassé')), 150000))]); }
    catch (err) { logger.warn(`Ad scan ${scan.slug}: relecture IA en échec (${err.message})`); }
    await AdScan.updateOne({ _id: scan._id }, { $set: { insights, insightsPending: false } });
    if (insights) logger.info(`Ad scan ${scan.slug}: insights added on a later reading`);
  });
  return true;
}

const VIDEO_TYPES = Object.keys(GRID);
const auditSchema = z.object({
  diagnosis: z.string().max(500).default(''),
  lasting: z.array(z.string().max(240)).max(3).default([]),
  overused: z.array(z.object({ angle: z.string().max(60), count: z.number().int().min(0).max(500), note: z.string().max(220).default('') })).max(3).default([]),
  missing: z.array(z.object({ angle: z.string().max(60), why: z.string().max(240).default('') })).max(3).default([]),
  hooks: z.array(z.string().max(160)).max(5).default([]),
  briefs: z.array(z.object({ title: z.string().max(90), angle: z.string().max(60), hook: z.string().max(200), videoType: z.string().max(30), duration: z.number().int().min(10).max(90), why: z.string().max(240).default('') })).max(3).default([]),
});
const hasAudit = (scan) => !!(scan?.audit && (scan.audit.diagnosis || scan.audit.briefs?.length));

/**
 * Audit créatif : les publicités d'une marque lues pour elle-même. Ce qui tient dans la durée (angles des publicités les plus anciennes, face aux
 * plus récentes), angles répétés, angles libres, accroches orales à tester, trois briefs de vidéo créateur. Conseils permis, jugements non :
 * on décrit et on propose, on ne qualifie jamais une publicité de bonne ou de mauvaise. Meta ne donne que le texte : l'audit le dit.
 */
export async function auditAds({ pageName, ads, stats, totalActive = 0 }) {
  if (!aiConfig().configured || !ads.length) return null;
  const now = Date.now();
  const line = (a, i) => `#${i + 1} (${ageDays(a.startedAt, now) ?? '?'} j${a.variants > 1 ? `, ${a.variants} variantes` : ''}) ${[a.title, a.body].filter(Boolean).join(' — ').replace(/\s+/g, ' ').slice(0, 300)}`;
  const old = ads.slice(0, 15); const recent = ads.slice(-15).filter(a => !old.includes(a));
  return generateJsonText({
    system: 'Tu es directeur de création UGC. Tu fais l\'audit des publicités Meta d\'une marque, pour elle. Tu décris ce qui est écrit et tu proposes ; tu ne qualifies jamais une publicité de bonne, mauvaise, faible ou efficace. Meta ne fournit que le texte et la durée de diffusion : tu ne parles ni d\'images ni de vidéos. JSON strict, en français.',
    prompt: `Marque : « ${pageName} ». ${totalActive || ads.length} publicités actives en France${stats.oldestDays != null ? `, la plus ancienne depuis ${stats.oldestDays} jours` : ''}. Une publicité maintenue longtemps est un indice de rentabilité.
Les plus anciennes :
${old.map(line).join('\n')}
${recent.length ? `Les plus récentes :\n${recent.map((a, i) => line(a, ads.indexOf(a))).join('\n')}` : ''}

Réponds avec :
- "diagnosis" : 2 à 3 phrases courtes (450 caractères au plus) : ce que la marque met en avant, et ce qui distingue les publicités qui durent des plus récentes.
- "lasting" : 2 à 3 constats sur les publicités qui durent (angle, promesse, forme du texte), en citant leur numéro.
- "overused" : jusqu'à 3 angles répétés dans beaucoup de publicités, avec "angle" (2 à 5 mots), "count" (nombre honnête) et "note" (ce qui se répète, décrit sans jugement).
- "missing" : 3 angles courants en vidéo UGC absents de ces publicités, avec "angle" (2 à 5 mots) et "why" (en quoi il convient à ce que vend la marque).
- "hooks" : 5 accroches orales nouvelles, pour les 3 premières secondes d'une vidéo créateur, différentes des textes actuels.
- "briefs" : exactement 3 vidéos créateur à commander, chacune sur un angle libre ou sur l'angle des publicités qui durent, avec "title", "angle" (2 à 5 mots), "hook" (la première phrase dite face caméra), "videoType" (une valeur parmi ${VIDEO_TYPES.join(', ')}), "duration" (secondes, 15 à 60), "why" (une phrase).
Interdit : tout adjectif d'évaluation sur les publicités existantes, toute supposition sur les dépenses ou les résultats.`,
    schema: auditSchema,
    normalize: (raw) => ({
      diagnosis: cutAtSentence(factual(raw?.diagnosis), 500),
      lasting: (Array.isArray(raw?.lasting) ? raw.lasting : []).map(x => factual(typeof x === 'string' ? x : x?.text || '').slice(0, 240)).filter(Boolean).slice(0, 3),
      overused: (Array.isArray(raw?.overused) ? raw.overused : []).map(o => ({ angle: String(o?.angle || o?.name || '').slice(0, 60), count: Math.max(0, Math.min(500, parseInt(o?.count, 10) || 0)), note: factual(o?.note).slice(0, 220) })).filter(o => o.angle).slice(0, 3),
      missing: (Array.isArray(raw?.missing) ? raw.missing : []).map(o => (typeof o === 'string' ? { angle: o.slice(0, 60), why: '' } : { angle: String(o?.angle || o?.name || '').slice(0, 60), why: factual(o?.why).slice(0, 240) })).filter(o => o.angle).slice(0, 3),
      hooks: (Array.isArray(raw?.hooks) ? raw.hooks : []).map(h => factual(typeof h === 'string' ? h : h?.text || '').slice(0, 160)).filter(Boolean).slice(0, 5),
      briefs: (Array.isArray(raw?.briefs) ? raw.briefs : []).map(b => ({ title: String(b?.title || '').slice(0, 90), angle: String(b?.angle || '').slice(0, 60), hook: factual(b?.hook).slice(0, 200), videoType: VIDEO_TYPES.includes(b?.videoType) ? b.videoType : 'testimonial', duration: Math.max(10, Math.min(90, parseInt(b?.duration, 10) || 30)), why: factual(b?.why).slice(0, 240) })).filter(b => b.title && b.hook).slice(0, 3),
    }),
  });
}

/** Lance l'audit en arrière-plan (une lecture IA par page et par 24 h ; relance une fois par heure au plus après un échec) */
export async function requestAudit(scan) {
  if (!scan || scan.status !== 'ready' || !scan.ads?.length) throw Object.assign(new Error('Aucune publicité active à auditer pour cette page'), { status: 400 });
  if (!aiConfig().configured) throw Object.assign(new Error('Audit indisponible pour le moment (IA non configurée)'), { status: 503 });
  if (hasAudit(scan) && scan.auditTriedAt && Date.now() - new Date(scan.auditTriedAt).getTime() < DAY) return { started: false };
  if (scan.auditPending) return { started: false };
  if (!hasAudit(scan) && scan.auditTriedAt && Date.now() - new Date(scan.auditTriedAt).getTime() < 3600000) return { started: false };
  const r = await AdScan.updateOne({ _id: scan._id, auditPending: { $ne: true } }, { $set: { auditPending: true, auditTriedAt: new Date() }, $inc: { audits: 1 } });
  if (!r.modifiedCount) return { started: false };
  scan.auditPending = true;
  setImmediate(async () => {
    let audit = null;
    try { audit = await Promise.race([auditAds({ pageName: scan.pageName, ads: scan.ads, stats: scan.stats || adStats(scan.ads), totalActive: scan.totalActive }), new Promise((_, rej) => setTimeout(() => rej(new Error('délai IA dépassé')), 150000))]); }
    catch (err) { logger.warn(`Ad audit ${scan.slug}: IA en échec (${err.message})`); }
    await AdScan.updateOne({ _id: scan._id }, { $set: { ...(audit ? { audit } : {}), auditPending: false } });
    if (audit) logger.info(`Ad audit ${scan.slug}: ready`);
  });
  return { started: true };
}

/** Lien public d'une publicité dans la bibliothèque Meta (sans jeton) */
export const adLibraryUrl = (adId) => `https://www.facebook.com/ads/library/?id=${encodeURIComponent(adId)}`;

/**
 * Ce que voit un visiteur selon son palier : anonyme → les N publicités les plus anciennes, le résumé et les constats ; inscrit → tout.
 * `leadId` : fiche prospect de cette marque, quand elle existe (sert au créateur : « Proposer une vidéo »).
 */
export async function serializeScan(scan, { user, settings } = {}) {
  const st = settings || await scanSettings();
  const tier = tierOf(user);
  const all = scan.ads || [];
  const shown = tier === 'anon' ? all.slice(0, st.scanAnonAds) : all;
  const now = Date.now();
  const ads = shown.map((a, i) => ({ id: a.id, index: i + 1, variants: a.variants || 1, body: a.body, title: a.title, description: a.description, caption: a.caption, startedAt: a.startedAt, days: ageDays(a.startedAt, now), platforms: a.platforms, reach: a.reach, ages: a.ages, gender: a.gender, countries: a.countries, url: adLibraryUrl(a.id) }));
  const ins = hasInsights(scan) ? scan.insights : null; // sous-document vide tant que l'IA n'a pas parlé
  const insights = ins ? (tier === 'anon' ? { summary: ins.summary || '', facts: ins.facts || [], angles: (ins.angles || []).slice(0, 2).map(a => ({ name: a.name, count: a.count })), locked: ['angles', 'hooks', 'missing'] } : { summary: ins.summary || '', facts: ins.facts || [], angles: ins.angles || [], hooks: ins.hooks || [], missing: ins.missing || [], locked: [] }) : null;
  let leadId = null;
  if (user?.role === 'creator' && scan.pageName) {
    const esc = scan.pageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const or = [{ name: new RegExp(`^\\s*${esc}\\s*$`, 'i') }];
    if (scan.website) { try { or.push({ website: new RegExp(`^https?://(www\\.)?${new URL(scan.website).hostname.replace(/^www\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|$)`, 'i') }); } catch { /* adresse illisible */ } }
    const lead = await Lead.findOne({ kind: 'brand', $or: or }).select('_id').lean();
    leadId = lead?._id || null;
  }
  const au = hasAudit(scan) ? scan.audit : null;
  const audit = au ? (tier === 'anon'
    ? { diagnosis: au.diagnosis || '', lasting: au.lasting || [], briefs: (au.briefs || []).slice(0, 1), locked: ['overused', 'missing', 'hooks', 'briefs'] }
    : { diagnosis: au.diagnosis || '', lasting: au.lasting || [], overused: au.overused || [], missing: au.missing || [], hooks: au.hooks || [], briefs: au.briefs || [], locked: [] }) : null;
  return {
    audit, auditPending: !!scan.auditPending,
    slug: scan.slug, pageId: scan.pageId, pageName: scan.pageName, website: scan.website, pageUrl: `https://www.facebook.com/${scan.pageId}`, libraryUrl: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=FR&view_all_page_id=${encodeURIComponent(scan.pageId)}`,
    status: scan.status, error: scan.error || null, insightsPending: !!scan.insightsPending, totalActive: scan.totalActive || 0, kept: all.length, shown: ads.length, hidden: Math.max(0, all.length - ads.length),
    stats: scan.stats || {}, insights, ads, tier, fetchedAt: scan.fetchedAt, views: scan.views || 0, leadId,
    limits: { anonAds: st.scanAnonAds, memberPerDay: st.scanMemberPerDay },
  };
}

/** Indexable : des publicités, une consultation humaine, pas retirée */
export const indexable = (scan) => scan.status === 'ready' && (scan.ads?.length || 0) >= 5 && !!scan.humanViewedAt;

/**
 * « Commander l'équivalent » : brief NeedCreator préparé depuis le scan. Le « produit » est ce que vendent les publicités de la marque
 * (toutes, ou la publicité choisie), l'angle retenu est celui de la publicité la plus ancienne. Repris par le pont existant du brief depuis URL.
 */
export async function briefFromScan(scan, { adId, proposal, ip, user } = {}) {
  if (!aiConfig().configured) throw Object.assign(new Error('Génération indisponible : IA non configurée sur le serveur'), { status: 503 });
  const ads = scan.ads || [];
  if (!ads.length) throw Object.assign(new Error('Aucune publicité à partir de laquelle préparer un brief'), { status: 400 });
  const chosen = (adId && ads.find(a => a.id === adId)) || ads[0];
  const others = ads.filter(a => a !== chosen).slice(0, 8).map(a => [a.title, a.body].filter(Boolean).join(' — ').slice(0, 300)).join('\n');
  const product = {
    name: chosen.title || `Produits ${scan.pageName}`.slice(0, 150), brand: scan.pageName, currency: 'EUR', price: null, image: '',
    description: `${chosen.body || ''} ${chosen.description || ''}`.trim().slice(0, 1500),
  };
  const text = `Publicité de référence de ${scan.pageName} (tourne depuis ${ageDays(chosen.startedAt) ?? '?'} jours) : ${[chosen.title, chosen.body, chosen.description].filter(Boolean).join(' — ')}\n\nAutres publicités actives :\n${others}\n\n${scan.insights?.summary || ''}`;
  // Brief proposé par l'audit : son angle, son accroche et son format orientent le brief
  const prop = Number.isInteger(proposal) ? scan.audit?.briefs?.[proposal] : null;
  if (Number.isInteger(proposal) && !prop) throw Object.assign(new Error('Proposition de brief introuvable : relancez l\'audit'), { status: 404 });
  const pb = await assembleBrief({ product, text: `${prop ? `Vidéo à produire : « ${prop.title} ». Angle : ${prop.angle}. Accroche face caméra : « ${prop.hook} ». Format : ${prop.videoType}, ${prop.duration} secondes. ${prop.why}\n\n` : ''}${text}`.slice(0, 4500) }, {
    url: scan.website || `https://www.facebook.com/${scan.pageId}`, domain: scan.website ? new URL(scan.website).hostname.replace(/^www\./, '') : scan.pageName, ip, manual: true,
    goal: prop ? `une vidéo créateur sur l'angle « ${prop.angle} », qui commence par « ${prop.hook} »` : 'obtenir en vidéo créateur l\'équivalent de la publicité qui tourne depuis le plus longtemps, avec un angle que les publicités actuelles n\'utilisent pas',
    extra: { scanId: scan._id, scanAdId: chosen.id },
  });
  await AdScan.updateOne({ _id: scan._id }, { $inc: { briefs: 1 } });
  return pb;
}

/** Prospect marque déjà connu pour cette page : même page Meta (recherche nocturne), même nom ou même site */
async function leadForScan(scan) {
  const esc = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const or = [{ source: 'meta', externalId: String(scan.pageId) }, { kind: 'brand', name: new RegExp(`^\\s*${esc(scan.pageName || '')}\\s*$`, 'i') }];
  if (scan.website) { try { or.push({ kind: 'brand', website: new RegExp(`^https?://(www\\.)?${esc(new URL(scan.website).hostname.replace(/^www\./, ''))}(/|$)`, 'i') }); } catch { /* adresse illisible */ } }
  return Lead.findOne({ $or: or }).select('_id name status').lean();
}

const REF_ACTIONS = ['visit', 'scan', 'audit', 'brief'];
/**
 * Visite venue d'un lien de l'email marques (paramètre ref = identifiant de la fiche) : enregistrée sur la fiche, une fois par action et par
 * page sur l'heure. La première visite d'une marque prévient l'équipe : elle a cliqué, c'est le moment de la relancer.
 */
export async function trackScanRef(ref, { action, slug } = {}) {
  if (!/^[a-f0-9]{24}$/i.test(String(ref || '')) || !REF_ACTIONS.includes(action)) return null;
  const lead = await Lead.findOne({ _id: ref, kind: 'brand' }).select('_id name status email scanVisits').lean();
  if (!lead) return null;
  const s = slug ? await AdScan.findOne({ slug: String(slug).toLowerCase() }).select('slug pageName').lean() : null;
  const hourAgo = new Date(Date.now() - 3600000);
  if ((lead.scanVisits || []).some(v => v.action === action && (v.slug || '') === (s?.slug || '') && v.at >= hourAgo)) return { tracked: false };
  const first = !(lead.scanVisits || []).length;
  await Lead.updateOne({ _id: lead._id }, { $push: { scanVisits: { $each: [{ at: new Date(), action, slug: s?.slug, pageName: s?.pageName }], $slice: -30 } }, $set: { lastScanVisitAt: new Date() } });
  if (first) {
    const esc = (v) => String(v || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    notifyAdmins(`Prospection : ${lead.name} a ouvert l'outil de scan depuis l'email`, `<p><strong>${esc(lead.name)}</strong>${lead.email ? ` (${esc(lead.email)})` : ''} a cliqué sur un lien de l'email${s ? ` et regarde les publicités de <strong>${esc(s.pageName)}</strong>` : ''}. C'est le moment de lui écrire.</p><p>Admin → Prospection → Scan concurrentiel, liste « Marques venues de l'email ».</p>`).catch(() => {});
  }
  return { tracked: true, first };
}

/** Admin : activité de l'outil (lectures, consultations, briefs, audits) et marques les plus scannées, avec leur fiche prospect quand elle existe */
export async function adminScanStats() {
  const day = new Date(Date.now() - DAY); const week = new Date(Date.now() - 7 * DAY);
  const [reads24h, members24h, newPages7d, totals, top] = await Promise.all([
    AdScanRequest.countDocuments({ createdAt: { $gte: day } }),
    AdScanRequest.countDocuments({ createdAt: { $gte: day }, userId: { $ne: null } }),
    AdScan.countDocuments({ createdAt: { $gte: week } }),
    AdScan.aggregate([{ $group: { _id: null, pages: { $sum: 1 }, scans: { $sum: '$scans' }, views: { $sum: '$views' }, briefs: { $sum: '$briefs' }, audits: { $sum: '$audits' }, proposals: { $sum: '$proposals' } } }]),
    AdScan.find({ status: { $in: ['ready', 'empty'] } }).sort({ scans: -1, views: -1, fetchedAt: -1 }).limit(30).select('slug pageId pageName website totalActive stats.oldestDays scans memberScans views briefs audits proposals leadId status fetchedAt').lean(),
  ]);
  const rows = await Promise.all(top.map(async (s) => {
    const lead = s.leadId ? await Lead.findById(s.leadId).select('_id name status').lean() : await leadForScan(s);
    return { slug: s.slug, pageName: s.pageName, website: s.website, totalActive: s.totalActive || 0, oldestDays: s.stats?.oldestDays ?? null, scans: s.scans || 0, memberScans: s.memberScans || 0, views: s.views || 0, briefs: s.briefs || 0, audits: s.audits || 0, proposals: s.proposals || 0, status: s.status, fetchedAt: s.fetchedAt, lead: lead ? { id: lead._id, name: lead.name, status: lead.status } : null };
  }));
  const fromEmail = (await Lead.find({ kind: 'brand', lastScanVisitAt: { $ne: null } }).sort({ lastScanVisitAt: -1 }).limit(30).select('_id name status email scanVisits lastScanVisitAt mailing.replyAt').lean())
    .map(l => ({ id: l._id, name: l.name, status: l.status, email: l.email || '', replied: !!l.mailing?.replyAt, last: l.lastScanVisitAt, visits: (l.scanVisits || []).length, actions: [...new Set((l.scanVisits || []).map(v => v.action))], pages: [...new Set((l.scanVisits || []).map(v => v.pageName).filter(Boolean))].slice(0, 4) }));
  const t = totals[0] || {};
  return { fromEmail, reads24h, members24h, newPages7d, pages: t.pages || 0, scans: t.scans || 0, views: t.views || 0, briefs: t.briefs || 0, audits: t.audits || 0, proposals: t.proposals || 0, top: rows };
}

/**
 * Admin : « Mettre en prospection » une marque scannée. Une marque scannée plusieurs fois intéresse le marché ; sa fiche reprend la page Meta
 * (même identifiant que la recherche nocturne, donc pas de doublon), le site, le nombre d'annonces et le résumé de la lecture IA. Contrôle de taille
 * habituel : une très grande marque n'est pas démarchée.
 */
export async function prospectFromScan(slug, { createdBy } = {}) {
  const scan = await AdScan.findOne({ slug: String(slug || '').toLowerCase() });
  if (!scan) throw Object.assign(new Error('Scan introuvable'), { status: 404 });
  if (String(scan.pageId).startsWith('none:')) throw Object.assign(new Error('Aucune page Meta pour ce nom : rien à mettre en prospection'), { status: 400 });
  const { brandTier } = await import('./brandSuggestions.js');
  const { tier, blocked } = await brandTier({ name: scan.pageName, ads: scan.totalActive || 0 });
  if (tier === 'huge') throw Object.assign(new Error(`${scan.pageName} est une très grande marque (${blocked ? 'liste des marques refusées' : `${scan.totalActive} annonces actives`}) : nous ne la démarchons pas. Seuils : Admin → Réglages → Prospection.`), { status: 400 });
  const note = `Scannée ${scan.scans || 0} fois dans l'outil de scan concurrentiel (dont ${scan.memberScans || 0} par des inscrits), ${scan.views || 0} consultation(s)`;
  const existing = await leadForScan(scan);
  let lead;
  if (existing) {
    lead = await Lead.findById(existing._id);
    if (['new', 'rejected', 'excluded'].includes(lead.status)) lead.status = 'qualified';
    lead.notes = [lead.notes, note].filter(Boolean).join(' · ').slice(0, 2000);
    if (!lead.website && scan.website) lead.website = scan.website;
    await lead.save();
  } else {
    lead = await Lead.create({
      kind: 'brand', source: 'meta', externalId: String(scan.pageId), name: scan.pageName, handle: scan.pageName, url: `https://www.facebook.com/${scan.pageId}`,
      website: scan.website || undefined, country: 'FR', status: 'qualified', score: 50, keyword: 'scan concurrentiel', sizeTier: tier,
      stats: { ads: scan.totalActive || 0 }, description: String(scan.insights?.summary || `Annonceur Meta, ${scan.totalActive || 0} publicités actives en France.`).slice(0, 2000), notes: note, createdBy,
    });
    const leadId = lead._id;
    setImmediate(async () => {
      try {
        const l = await Lead.findById(leadId); if (!l) return;
        const { qualifyOne } = await import('./acquisition/index.js');
        await qualifyOne(l, []);
        if (l.status === 'rejected') { l.status = 'qualified'; await l.save(); } // l'équipe a décidé : la note de l'IA n'écarte pas la marque
        if (!l.email && l.website) { const { enrichLeadFromSite } = await import('./acquisition/enrich.js'); await enrichLeadFromSite(l).catch(() => false); await l.save(); }
      } catch (err) { logger.warn(`Scanned brand ${leadId} not enriched: ${err.message}`); }
    });
  }
  await AdScan.updateOne({ _id: scan._id }, { $set: { leadId: lead._id } });
  return { lead, created: !existing, tier };
}
