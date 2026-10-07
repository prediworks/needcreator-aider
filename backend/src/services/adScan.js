import { z } from 'zod';
import AdScan, { AdScanRequest } from '../models/AdScan.js';
import Lead from '../models/Lead.js';
import { getSetting, SETTINGS } from '../models/Setting.js';
import { fetchAds, metaConfigured } from './acquisition/meta.js';
import { generateJson, aiConfig } from './ai.js';
import { assembleBrief } from './productBrief.js';
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
  const keys = ['scanAnonPerDay', 'scanMemberPerDay', 'scanProPerDay', 'scanAnonAds', 'scanIpPerHour', 'scanGlobalPerDay', 'scanMaxAds', 'scanBlockedPages'];
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

/** Lecture IA des publicités : angles comptés avec exemple cité, accroches récurrentes, angles absents, constats chiffrés */
export async function analyzeAds({ pageName, ads, stats, totalActive = 0 }) {
  if (!aiConfig().configured || !ads.length) return null;
  const detailed = Math.min(30, ads.length);
  const list = ads.slice(0, 30).map((a, i) => `#${i + 1} (tourne depuis ${ageDays(a.startedAt) ?? '?'} j${a.platforms?.length ? `, ${a.platforms.join('/')}` : ''}) ${[a.title, a.body, a.description].filter(Boolean).join(' — ').replace(/\s+/g, ' ').slice(0, 350)}`).join('\n');
  const out = await generateJson({
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
      summary: factual(raw?.summary).slice(0, 400),
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
    try { insights = await Promise.race([analyzeAds({ pageName, ads, stats, totalActive: raw.length }), new Promise((_, rej) => setTimeout(() => rej(new Error('délai IA dépassé')), 120000))]); }
    catch (err) { logger.warn(`Ad scan ${pageName}: IA en échec (${err.message})`); }
  }
  await AdScan.updateOne({ _id: scanId }, { $set: { insights, insightsPending: false } });
  logger.info(`Ad scan ${pageName}: ${raw.length} active ad(s), ${ads.length} kept, ${insights ? 'insights ok' : 'no insights'} (${tier}${ip ? `, ${ip}` : ''})`);
  return null;
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
  const ins = scan.insights && (scan.insights.summary || scan.insights.facts?.length || scan.insights.angles?.length) ? scan.insights : null; // sous-document vide tant que l'IA n'a pas parlé
  const insights = ins ? (tier === 'anon' ? { summary: ins.summary || '', facts: ins.facts || [], angles: (ins.angles || []).slice(0, 2).map(a => ({ name: a.name, count: a.count })), locked: ['angles', 'hooks', 'missing'] } : { summary: ins.summary || '', facts: ins.facts || [], angles: ins.angles || [], hooks: ins.hooks || [], missing: ins.missing || [], locked: [] }) : null;
  let leadId = null;
  if (user?.role === 'creator' && scan.pageName) {
    const esc = scan.pageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const or = [{ name: new RegExp(`^\\s*${esc}\\s*$`, 'i') }];
    if (scan.website) { try { or.push({ website: new RegExp(`^https?://(www\\.)?${new URL(scan.website).hostname.replace(/^www\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|$)`, 'i') }); } catch { /* adresse illisible */ } }
    const lead = await Lead.findOne({ kind: 'brand', $or: or }).select('_id').lean();
    leadId = lead?._id || null;
  }
  return {
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
export async function briefFromScan(scan, { adId, ip, user } = {}) {
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
  const pb = await assembleBrief({ product, text: text.slice(0, 4000) }, {
    url: scan.website || `https://www.facebook.com/${scan.pageId}`, domain: scan.website ? new URL(scan.website).hostname.replace(/^www\./, '') : scan.pageName, ip, manual: true,
    goal: 'obtenir en vidéo créateur l\'équivalent de la publicité qui tourne depuis le plus longtemps, avec un angle que les publicités actuelles n\'utilisent pas',
    extra: { scanId: scan._id, scanAdId: chosen.id },
  });
  await AdScan.updateOne({ _id: scan._id }, { $inc: { briefs: 1 } });
  return pb;
}
