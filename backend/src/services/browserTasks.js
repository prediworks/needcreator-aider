import crypto from 'crypto';
import { z } from 'zod';
import BrowserTask, { BrowserTaskBatch, TASK_TYPES } from '../models/BrowserTask.js';
import Lead from '../models/Lead.js';
import { getSetting, setSetting } from '../models/Setting.js';
import { extractEmails, pickEmail, extractSocials } from './acquisition/enrich.js';
import { importLeads } from './acquisition/importLeads.js';
import { generateJson, aiConfig } from './ai.js';
import logger from '../utils/logger.js';

/**
 * File de tâches de l'extension Chrome : création des lots, remise des tâches, lecture des résultats.
 * L'extension renvoie une page réduite (titre, texte visible, liens) ; c'est ici que l'on en tire un prospect,
 * en passant par l'import groupé existant (dédoublonnage, complément des fiches, recherche d'email sur le site, qualification).
 */

const CLAIM_TIMEOUT_MS = 10 * 60 * 1000; // tâche « en cours » sans résultat depuis 10 min : redonnée
const MAX_ATTEMPTS = 3;
const IG_RESERVED = new Set(['p', 'reel', 'reels', 'tv', 'explore', 'accounts', 'direct', 'stories', 'about', 'legal', 'developer', 'privacy', 'terms', 'web', 'api', 'ar', 'lite', 'popular', 'locations', 'directory', 'emails', 'challenge', 'oauth', 'session', 'nametag', 'igtv', 'guide', 'guides', 'press', 'blog', 'help', 'instagram', 'meta', 'threads', 'download', 'business', 'creators', 'community', 'safety', 'topics', 'hashtag', 'tags', 'audio', 'music', 'shop', 'shopping', 'ads', 'login', 'signup', 'share', 'invites', 'static', 'graphql', 'embed', 'your_activity', 'settings', 'notifications', 'archive', 'saved', 'tagged', 'channel']);

/* ---------- Jeton de l'extension ---------- */

export async function getExtensionToken() { return getSetting('extensionToken', ''); }
export async function rotateExtensionToken(userId) {
  const token = crypto.randomBytes(24).toString('base64url');
  await setSetting('extensionToken', token, userId);
  return token;
}
export async function checkExtensionToken(given) {
  const expected = await getExtensionToken();
  if (!expected || !given || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/* ---------- Lots ---------- */

/** Crée un lot et ses tâches. items : [{ type, url, query, count, leadId, postUrl }] */
export async function createBatch({ label, kind = 'creator', origin, niche, items, createdBy, workspaceId = 'default' }) {
  const valid = (items || []).filter(i => TASK_TYPES.includes(i.type) && (i.url || i.query));
  if (!valid.length) throw new Error('Aucune tâche valide dans le lot');
  const batch = await BrowserTaskBatch.create({ label, kind, origin, niche, createdBy, workspaceId, counts: { total: valid.length } });
  await BrowserTask.insertMany(valid.map(i => ({ workspaceId, batchId: batch._id, type: i.type, input: { url: i.url, query: i.query, count: i.count, leadId: i.leadId, postUrl: i.postUrl } })));
  return batch;
}

/** Lot « publications Instagram sans auteur » : les fiches trouvées par hashtag dont l'auteur reste à lire */
export async function batchFromPostsWithoutAuthor({ limit = 60, createdBy } = {}) {
  const leads = await Lead.find({ kind: 'creator', source: 'instagram', handle: { $in: [null, ''] }, status: { $nin: ['rejected', 'excluded', 'registered'] }, url: { $regex: 'instagram\\.com/(p|reel|reels|tv)/' } }).sort({ score: -1, createdAt: -1 }).limit(limit).select('url').lean();
  if (!leads.length) return null;
  return createBatch({ label: `Publications Instagram sans auteur · ${new Date().toLocaleDateString('fr-FR')}`, kind: 'creator', createdBy, items: leads.map(l => ({ type: 'read_post_author', url: l.url, leadId: l._id, postUrl: l.url })) });
}

/** Lot « profils sans email » (Instagram ou TikTok) ; mémorisés 30 jours comme pour l'assistant */
export async function batchFromProfilesWithoutEmail({ limit = 60, createdBy } = {}) {
  const since = new Date(Date.now() - 30 * 86400000);
  const filter = { kind: 'creator', email: { $in: [null, ''] }, status: { $nin: ['rejected', 'excluded', 'registered'] }, $and: [{ $or: [{ 'socials.instagram': { $nin: [null, ''] } }, { 'socials.tiktok': { $nin: [null, ''] } }] }, { $or: [{ 'enrich.assistantAt': { $exists: false } }, { 'enrich.assistantAt': null }, { 'enrich.assistantAt': { $lt: since } }] }] };
  const leads = await Lead.find(filter).sort({ score: -1 }).limit(limit).select('socials').lean();
  if (!leads.length) return null;
  await Lead.updateMany({ _id: { $in: leads.map(l => l._id) } }, { $set: { 'enrich.assistantAt': new Date() } });
  return createBatch({ label: `Profils sans email · ${new Date().toLocaleDateString('fr-FR')}`, kind: 'creator', createdBy, items: leads.map(l => ({ type: 'read_profile', url: l.socials.instagram || l.socials.tiktok, leadId: l._id })) });
}

/** Lot « bibliothèque publicitaire » : un mot-clé par tâche, N annonceurs chacun */
export async function batchFromAdLibrary({ keywords, count = 15, country = 'FR', createdBy } = {}) {
  const kws = [...new Set((keywords || []).map(k => String(k).trim()).filter(Boolean))].slice(0, 12);
  if (!kws.length) return null;
  const items = kws.map(q => ({ type: 'list_ad_library', query: q, count, url: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${encodeURIComponent(country)}&media_type=video&q=${encodeURIComponent(q)}&search_type=keyword_unordered` }));
  return createBatch({ label: `Bibliothèque publicitaire · ${kws.join(', ')}`.slice(0, 160), kind: 'brand', origin: 'bibliothèque Meta', createdBy, items });
}

/** Lot « hashtag » : N publications récentes, puis auteur et profil en tâches filles */
export async function batchFromHashtags({ hashtags, count = 20, createdBy } = {}) {
  const tags = [...new Set((hashtags || []).map(h => String(h).trim().replace(/^#/, '')).filter(Boolean))].slice(0, 10);
  if (!tags.length) return null;
  return createBatch({ label: `Hashtags Instagram · ${tags.map(t => `#${t}`).join(' ')}`.slice(0, 160), kind: 'creator', createdBy, items: tags.map(t => ({ type: 'list_hashtag', query: t, count, url: `https://www.instagram.com/explore/tags/${encodeURIComponent(t)}/` })) });
}

export async function listBatches({ limit = 20 } = {}) {
  await reconcileOpenBatches().catch(() => 0);
  return BrowserTaskBatch.find().sort({ createdAt: -1 }).limit(limit).lean();
}

/** Lots ouverts : compteurs recalculés depuis leurs tâches (total, faites, échecs, emails relevés), fermés si tout est fini */
export async function reconcileOpenBatches() {
  const open = await BrowserTaskBatch.find({ closedAt: null }).select('_id counts imported').lean();
  for (const b of open) {
    const rows = await BrowserTask.aggregate([{ $match: { batchId: b._id } }, { $group: { _id: '$status', n: { $sum: 1 }, emails: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$extracted.email', ''] } }, 0] }, 1, 0] } } } }]);
    const by = Object.fromEntries(rows.map(r => [r._id, r.n]));
    const total = rows.reduce((a, r) => a + r.n, 0);
    const done = by.done || 0, failed = (by.failed || 0) + (by.cancelled || 0);
    const emails = rows.reduce((a, r) => a + r.emails, 0);
    const set = { 'counts.total': total, 'counts.done': done, 'counts.failed': failed, 'imported.emailsAdded': Math.max(b.imported?.emailsAdded || 0, emails) };
    if (total > 0 && done + failed >= total) set.closedAt = new Date();
    await BrowserTaskBatch.updateOne({ _id: b._id }, { $set: set });
  }
  return open.length;
}

export async function cancelBatch(id) {
  const r = await BrowserTask.updateMany({ batchId: id, status: { $in: ['pending', 'running'] } }, { $set: { status: 'cancelled', finishedAt: new Date() } });
  await BrowserTaskBatch.updateOne({ _id: id }, { $set: { closedAt: new Date() } });
  return r.modifiedCount;
}

/* ---------- Remise des tâches ---------- */

/** Tâches en attente ayant épuisé leurs tentatives (résultats jamais reçus, blocages répétés) : passées en échec, lots fermés si complets */
export async function failExhaustedTasks(workspaceId = 'default') {
  const exhausted = await BrowserTask.find({ workspaceId, status: 'pending', attempts: { $gte: MAX_ATTEMPTS } }).select('_id batchId').lean();
  if (!exhausted.length) return 0;
  await BrowserTask.updateMany({ _id: { $in: exhausted.map(t => t._id) } }, { $set: { status: 'failed', finishedAt: new Date(), outcome: `abandonnée après ${MAX_ATTEMPTS} tentatives sans résultat` } });
  const byBatch = new Map();
  for (const t of exhausted) byBatch.set(String(t.batchId), (byBatch.get(String(t.batchId)) || 0) + 1);
  for (const [batchId, n] of byBatch) {
    const batch = await BrowserTaskBatch.findById(batchId);
    if (!batch) continue;
    batch.counts.failed += n;
    if (!batch.closedAt && batch.counts.done + batch.counts.failed >= batch.counts.total) batch.closedAt = new Date();
    await batch.save();
  }
  return exhausted.length;
}

/** Prochaine tâche pour l'extension (la plus ancienne en attente ; une tâche en cours depuis trop longtemps est redonnée) */
export async function claimNextTask({ workspaceId = 'default' } = {}) {
  const stale = new Date(Date.now() - CLAIM_TIMEOUT_MS);
  await BrowserTask.updateMany({ workspaceId, status: 'running', claimedAt: { $lt: stale } }, { $set: { status: 'pending' } });
  await failExhaustedTasks(workspaceId);
  const task = await BrowserTask.findOneAndUpdate(
    { workspaceId, status: 'pending', attempts: { $lt: MAX_ATTEMPTS } },
    { $set: { status: 'running', claimedAt: new Date() }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, new: true },
  ).lean();
  if (!task) return null;
  return { id: task._id, type: task.type, input: task.input, batchId: task.batchId };
}

export async function queueStatus({ workspaceId = 'default' } = {}) {
  await failExhaustedTasks(workspaceId).catch(() => 0);
  const [pending, running] = await Promise.all([
    BrowserTask.countDocuments({ workspaceId, status: 'pending', attempts: { $lt: MAX_ATTEMPTS } }),
    BrowserTask.countDocuments({ workspaceId, status: 'running' }),
  ]);
  return { pending, running };
}

/* ---------- Lecture des résultats ---------- */

const linkHost = (href) => { try { return new URL(href).hostname.replace(/^www\./, ''); } catch { return ''; } };
const igProfileFromHref = (href) => {
  const m = String(href || '').match(/^https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})\/?(?:[?#].*)?$/i);
  if (!m || IG_RESERVED.has(m[1].toLowerCase())) return null;
  return `https://www.instagram.com/${m[1]}/`;
};
const ttProfileFromHref = (href) => { const m = String(href || '').match(/^https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]{2,30})\/?(?:[?#].*)?$/i); return m ? `https://www.tiktok.com/@${m[1]}` : null; };
/** Lien de bio Instagram : « l.instagram.com/?u=https%3A%2F%2F… » → l'adresse réelle */
const unwrapRedirect = (href) => { try { const u = new URL(href); const t = u.searchParams.get('u') || u.searchParams.get('q') || u.searchParams.get('url'); return t && /^https?:\/\//i.test(t) ? t : href; } catch { return href; } };
const followersFromText = (text) => {
  const m = String(text || '').match(/(\d[\d\s\u00a0\u202f.,]*)\s*([kKmM])?\s*(?:abonn[ée]s?|followers|subscribers|abonnements)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/[\s  ]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * (m[2] ? (/m/i.test(m[2]) ? 1e6 : 1e3) : 1)) : null;
};
const externalLinks = (links, hosts) => (links || []).map(l => unwrapRedirect(l.href)).filter(h => /^https?:\/\//i.test(h) && !hosts.some(x => linkHost(h).endsWith(x)));

/**
 * Auteur d'une publication Instagram. Dans l'ordre : description de la page (« 12 likes, 3 comments - pseudo on May 3, 2026: … »),
 * titre « Nom (@pseudo) • Instagram », puis liens de profil de la page, en écartant le compte connecté (menu latéral) et en préférant
 * un lien dont le texte est le pseudo lui-même (en-tête de la publication).
 */
export function extractPostAuthor(result) {
  const self = String(result?.self || '').toLowerCase();
  const ok = (h) => h && !IG_RESERVED.has(h.toLowerCase()) && h.toLowerCase() !== self;
  const desc = `${result?.meta?.description || ''}\n${result?.meta?.ogDescription || ''}`;
  const fromDesc = (desc.match(/[-–]\s*([A-Za-z0-9_.]{2,30})\s+(?:on|le|am|el|il|op|em)\s+\S+\s*\d/i) || desc.match(/[-–]\s*([A-Za-z0-9_.]{2,30})\s*:/) || [])[1];
  if (ok(fromDesc)) return `https://www.instagram.com/${fromDesc}/`;
  const title = `${result?.title || ''}\n${result?.meta?.ogTitle || ''}`;
  const fromTitle = (title.match(/\(@([A-Za-z0-9_.]{2,30})\)/) || [])[1] || (title.match(/^([A-Za-z0-9_.]{2,30}) on Instagram/) || [])[1];
  if (ok(fromTitle)) return `https://www.instagram.com/${fromTitle}/`;
  const candidates = [];
  for (const l of result?.links || []) {
    const p = igProfileFromHref(l.href); if (!p) continue;
    const h = p.replace(/^https:\/\/www\.instagram\.com\//, '').replace(/\/$/, '');
    if (!ok(h)) continue;
    candidates.push({ h, named: String(l.text || '').trim().toLowerCase() === h.toLowerCase() });
  }
  // Lien nommé par son pseudo (en-tête de la publication), sinon pseudo cité dans le texte de la page, sinon premier lien si le compte connecté est connu
  const text = String(result?.text || '');
  const cited = (h) => new RegExp(`(^|[^A-Za-z0-9_.])@?${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_.])`, 'i').test(text);
  const best = candidates.find(c => c.named) || candidates.find(c => cited(c.h)) || (self ? candidates[0] : null);
  return best ? `https://www.instagram.com/${best.h}/` : null;
}

/** Fiche de profil (Instagram ou TikTok) : email, abonnés, lien de bio, bio courte (IA si disponible, sinon début du texte) */
export async function extractProfile(result, url) {
  const text = String(result?.text || '');
  // Texte visible d'abord, puis liens mailto, puis emails trouvés dans le code de la page (bouton « E-mail », données intégrées)
  const email = pickEmail(extractEmails(text)) || pickEmail(extractEmails((result?.links || []).filter(l => /^mailto:/i.test(l.href)).map(l => l.href.replace(/^mailto:/i, '')).join(' '))) || pickEmail(extractEmails((result?.emails || []).join(' ')));
  const followers = followersFromText(text);
  const site = externalLinks(result?.links, ['instagram.com', 'tiktok.com', 'facebook.com', 'youtube.com', 'youtu.be', 'threads.net', 'apple.com', 'google.com', 'microsoft.com', 'linkedin.com', 'twitter.com', 'x.com', 'snapchat.com', 'pinterest.com', 'whatsapp.com', 'spotify.com', 'cloudflare.com']).find(h => !/\/(privacy|terms|legal|policies|help|about|press|copyright|contact-us|creators|advertise|developers|jobs)\b/i.test(h)) || null;
  let bio = '';
  if (aiConfig().configured) {
    try {
      const out = await generateJson({
        system: 'Tu lis le texte visible d\'un profil de réseau social. Réponds en JSON strict.',
        prompt: `Texte de la page (${url}) :\n"""\n${text.slice(0, 6000)}\n"""\nDonne : bio (la présentation du créateur en une phrase, telle qu'écrite ou résumée, ≤ 160 caractères, vide si absente), email (adresse visible, vide sinon).`,
        schema: z.object({ bio: z.string().default(''), email: z.string().default('') }),
      });
      bio = out.bio || '';
      if (!email && /@/.test(out.email)) return { email: out.email.toLowerCase(), followers, site, bio };
    } catch (err) { logger.warn(`extractProfile AI: ${err.message}`); }
  }
  if (!bio) bio = text.replace(/\s+/g, ' ').slice(0, 160);
  return { email, followers, site, bio };
}

/** Annonceurs d'une page de bibliothèque publicitaire : IA sur le texte, complétée par les liens de pages Facebook */
export async function extractAdvertisers(result, count = 15) {
  const text = String(result?.text || '');
  const fromLinks = [];
  const seen = new Set();
  for (const l of result?.links || []) {
    const m = String(l.href || '').match(/^https?:\/\/(?:www\.)?facebook\.com\/([A-Za-z0-9_.-]{2,60})\/?(?:[?#].*)?$/i);
    if (!m || /^(ads|policies|help|privacy|business|login|about|legal|watch|marketplace|groups|events|gaming|pages|profile\.php)$/i.test(m[1])) continue;
    const key = m[1].toLowerCase();
    if (seen.has(key)) continue; seen.add(key);
    fromLinks.push({ name: String(l.text || m[1]).trim().slice(0, 100), pageUrl: `https://www.facebook.com/${m[1]}/`, website: '', description: '' });
  }
  let advertisers = fromLinks;
  if (aiConfig().configured && text.length > 200) {
    try {
      const out = await generateJson({
        system: 'Tu lis le texte visible d\'une page de résultats de la bibliothèque publicitaire Meta. Réponds en JSON strict.',
        prompt: `Texte :\n"""\n${text.slice(0, 12000)}\n"""\nRelève jusqu'à ${count} annonceurs distincts (marques de taille PME, pas les grands groupes ni les revendeurs). Pour chacun : name (nom de la page), website (site indiqué dans l'annonce, vide sinon), description (une phrase sur ce qu'il vend, vide si inconnu).`,
        schema: z.object({ advertisers: z.array(z.object({ name: z.string(), website: z.string().default(''), description: z.string().default('') })).default([]) }),
      });
      const byName = new Map(advertisers.map(a => [a.name.toLowerCase(), a]));
      for (const a of out.advertisers) {
        const cur = byName.get(a.name.toLowerCase());
        if (cur) { cur.website = cur.website || a.website; cur.description = cur.description || a.description; }
        else advertisers.push({ name: a.name.slice(0, 100), pageUrl: '', website: a.website, description: a.description });
      }
    } catch (err) { logger.warn(`extractAdvertisers AI: ${err.message}`); }
  }
  return advertisers.slice(0, Math.max(count, 15));
}

/** Publications d'une page hashtag : liens /p/ et /reel/ distincts */
export function extractPosts(result, count = 20) {
  const out = []; const seen = new Set();
  for (const l of result?.links || []) {
    const m = String(l.href || '').match(/^https?:\/\/(?:www\.)?instagram\.com\/(?:[^/\s]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
    if (!m || seen.has(m[2])) continue; seen.add(m[2]);
    out.push(`https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/`);
    if (out.length >= count) break;
  }
  return out;
}

const clean = (s) => String(s || '').replace(/[;\n\r|]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Résultat d'une tâche : { url, finalUrl, title, text, links: [{href,text}], blocked: 'login'|'captcha'|'restricted'|null }
 * Retourne { outcome } ; crée les tâches filles et importe les prospects.
 */
export async function submitTaskResult(id, result) {
  const task = await BrowserTask.findById(id);
  if (!task) throw Object.assign(new Error('Tâche introuvable'), { status: 404 });
  if (task.status !== 'running') throw Object.assign(new Error(`Tâche ${task.status}, résultat ignoré`), { status: 409 });
  const batch = await BrowserTaskBatch.findById(task.batchId);
  const slim = { url: result?.url, finalUrl: result?.finalUrl, title: String(result?.title || '').slice(0, 300), text: String(result?.text || '').slice(0, 20000), links: (result?.links || []).slice(0, 400).map(l => ({ href: String(l.href || '').slice(0, 500), text: String(l.text || '').slice(0, 120) })), blocked: result?.blocked || null, emails: Array.isArray(result?.emails) ? result.emails.slice(0, 10).map(e => String(e).slice(0, 120)) : [], meta: result?.meta ? { description: String(result.meta.description || '').slice(0, 1000), ogTitle: String(result.meta.ogTitle || '').slice(0, 300), ogDescription: String(result.meta.ogDescription || '').slice(0, 1000) } : undefined, self: result?.self ? String(result.self).slice(0, 40) : null };
  task.result = slim;
  if (slim.blocked) {
    const reason = { login: 'page de connexion', captcha: 'captcha', restricted: 'restriction du réseau', consent: 'consentement aux cookies à accepter une fois dans Chrome' }[slim.blocked] || slim.blocked;
    const exhausted = task.attempts >= MAX_ATTEMPTS;
    task.status = exhausted ? 'failed' : 'pending';
    task.error = String(result?.error || '').slice(0, 500) || undefined;
    const why = slim.blocked === 'error' ? `page illisible${task.error ? ` : ${task.error}` : ''}` : `bloqué : ${reason}`;
    task.outcome = exhausted ? `abandonnée après ${MAX_ATTEMPTS} tentatives (${why})` : why;
    if (exhausted) task.finishedAt = new Date();
    await task.save();
    if (batch) {
      // Une erreur de lecture (page trop lente, onglet fermé) n'est pas un blocage du réseau : le lot n'est pas marqué bloqué
      if (slim.blocked !== 'error') { batch.blockedAt = new Date(); batch.blockedReason = reason; }
      if (exhausted) { batch.counts.failed += 1; if (batch.counts.done + batch.counts.failed >= batch.counts.total) batch.closedAt = new Date(); }
      await batch.save();
    }
    return { outcome: task.outcome, blocked: true };
  }
  let outcome = '';
  try {
    if (!slim.text.trim() && (/\b404\b|not found|introuvable|page isn.t available|page n.est pas disponible/i.test(slim.title) || !slim.links.length)) throw new Error('page vide ou introuvable');
    if (task.type === 'read_post_author') {
      const profile = extractPostAuthor(slim);
      if (!profile) throw new Error(`auteur introuvable sur la page (titre « ${slim.title.slice(0, 60)} », ${slim.text.length} caractères, ${slim.links.length} liens${slim.self ? `, compte ${slim.self}` : ', compte connecté non identifié'})`);
      task.extracted = { profile };
      await BrowserTask.create({ workspaceId: task.workspaceId, batchId: task.batchId, parentId: task._id, type: 'read_profile', input: { url: profile, leadId: task.input.leadId, postUrl: task.input.postUrl || task.input.url } });
      if (batch) { batch.counts.total += 1; }
      outcome = `auteur ${profile.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')} : profil à lire`;
    } else if (task.type === 'read_profile') {
      const url = task.input.url;
      const p = await extractProfile(slim, url);
      task.extracted = p;
      const socials = extractSocials(url);
      const handle = (url.match(/(?:instagram\.com\/|tiktok\.com\/@|youtube\.com\/@|linkedin\.com\/(?:company|in)\/|facebook\.com\/)([^/?]+)/i) || [])[1] || null;
      const postCode = (String(task.input.postUrl || '').match(/instagram\.com\/(?:[^/\s]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i) || [])[1] || null;
      const row = { line: `${task.input.postUrl || ''} ; ${url} ; ${p.email || ''} ; ${clean(p.bio)} ; ${p.site || ''}`, postCode, subscribers: p.followers || null, name: handle || url, handle: handle ? `@${handle}` : null, url, website: p.site && !/instagram\.com|tiktok\.com|youtube\.com/i.test(p.site) ? p.site : null, email: p.email || null, socials, description: clean(p.bio).slice(0, 2000) };
      const imp = await importLeads({ kind: 'creator', rows: [row], niche: batch?.niche, origin: batch?.origin || 'extension' });
      if (batch) { batch.imported.created += imp.created; batch.imported.updated += imp.updated; batch.imported.emailsAdded += imp.emailsAdded; }
      outcome = imp.created ? 'nouvelle fiche' : imp.updated ? 'fiche complétée' : 'fiche connue, rien de nouveau';
      if (p.email) outcome += ` · email trouvé`;
      else if (imp.emailsAdded) outcome += ' · email trouvé sur le site';
    } else if (task.type === 'list_ad_library') {
      const advertisers = await extractAdvertisers(slim, task.input.count || 15);
      task.extracted = { advertisers };
      const lines = advertisers.map(a => [a.name, a.pageUrl, '', [clean(a.description), 'publicités vidéo actives'].filter(Boolean).join(' · '), a.website].map(clean).join(' ; ')).join('\n');
      const imp = lines ? await importLeads({ kind: 'brand', text: lines, niche: batch?.niche, origin: batch?.origin || 'bibliothèque Meta' }) : { created: 0, updated: 0, emailsAdded: 0 };
      if (batch) { batch.imported.created += imp.created; batch.imported.updated += imp.updated; batch.imported.emailsAdded += imp.emailsAdded; }
      outcome = `${advertisers.length} annonceur(s) relevé(s), ${imp.created} nouvelle(s) marque(s), ${imp.emailsAdded} email(s)`;
    } else if (task.type === 'list_hashtag') {
      const posts = extractPosts(slim, task.input.count || 20);
      task.extracted = { posts };
      if (posts.length) {
        await BrowserTask.insertMany(posts.map(u => ({ workspaceId: task.workspaceId, batchId: task.batchId, parentId: task._id, type: 'read_post_author', input: { url: u, postUrl: u } })));
        if (batch) batch.counts.total += posts.length;
      }
      outcome = `${posts.length} publication(s) : auteurs à lire`;
    }
    task.status = 'done';
    task.outcome = outcome;
  } catch (err) {
    task.status = 'failed';
    task.error = err.message;
    task.outcome = `échec : ${err.message}`;
    logger.warn(`browser task ${task.type} failed: ${err.message}`);
  }
  task.finishedAt = new Date();
  await task.save();
  if (batch) {
    if (task.status === 'done') batch.counts.done += 1; else batch.counts.failed += 1;
    if (batch.counts.done + batch.counts.failed >= batch.counts.total) batch.closedAt = new Date();
    await batch.save();
  }
  return { outcome: task.outcome, blocked: false };
}

export async function batchDetail(id) {
  const batch = await BrowserTaskBatch.findById(id).lean();
  if (!batch) return null;
  const tasks = await BrowserTask.find({ batchId: id }).sort({ createdAt: 1 }).select('type input status attempts outcome error finishedAt').lean();
  return { batch, tasks };
}
