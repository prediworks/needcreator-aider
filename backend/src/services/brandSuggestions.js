import { z } from 'zod';
import BrandSuggestion from '../models/BrandSuggestion.js';
import Lead from '../models/Lead.js';
import User from '../models/User.js';
import { getSetting, SETTINGS } from '../models/Setting.js';
import { generateJson, aiConfig } from './ai.js';
import { notify } from './notifications.js';
import { notifyAdmins } from './adminAlerts.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Marques suggérées par les créateurs : ils possèdent le produit, ils proposent la marque. L'équipe valide avant tout tournage.
 * Taille : trois niveaux (accessible, grande, très grande) d'après la liste des marques toujours refusées, le nombre d'annonces actives (Meta)
 * et ce que l'IA sait de la marque. Les seuils sont des réglages : ils s'ajustent avec les résultats.
 */
export const MAX_PENDING_SUGGESTIONS = 3;
export const RESERVED_DAYS = 10;
const DAY = 86400000;
const SITE = () => config.cors.origin;
const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** Adresse de site remise en forme (https://…), ou chaîne vide */
export function cleanWebsite(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try { const u = new URL(url); if (!/\.[a-z]{2,}$/i.test(u.hostname) || /instagram\.com|tiktok\.com|facebook\.com|linkedin\.com|youtube\.com/i.test(u.hostname)) return ''; return `https://${u.hostname.toLowerCase()}${u.pathname === '/' ? '' : u.pathname}`.slice(0, 300); } catch { return ''; }
}

/** Profil Instagram remis en forme (https://www.instagram.com/pseudo/), depuis une adresse ou un @pseudo */
export function cleanInstagram(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const m = raw.match(/instagram\.com\/([A-Za-z0-9._]{2,30})/i) || raw.match(/^@?([A-Za-z0-9._]{2,30})$/);
  if (!m || /^(p|reel|reels|explore|stories|accounts)$/i.test(m[1])) return '';
  return `https://www.instagram.com/${m[1].toLowerCase()}/`;
}

/** Clé de dédoublonnage : domaine du site, sinon pseudo Instagram, sinon nom */
export function suggestionKey({ name, website, instagram }) {
  if (website) { try { return `d:${new URL(website).hostname.replace(/^www\./, '')}`; } catch { /* adresse illisible */ } }
  if (instagram) return `i:${instagram.replace(/^https:\/\/www\.instagram\.com\//, '').replace(/\/$/, '')}`;
  return `n:${norm(name)}`;
}

/** Niveau de taille à partir des indices disponibles (fonction pure, couverte par les tests) */
export function tierOf({ blocked = false, ads = null, ai = '', followers = null } = {}, { largeAds = 50, hugeAds = 300, largeFollowers = 100000, hugeFollowers = 500000 } = {}) {
  if (blocked || ai === 'huge' || (ads != null && ads >= hugeAds) || (followers != null && followers >= hugeFollowers)) return 'huge';
  if (ai === 'large' || (ads != null && ads >= largeAds) || (followers != null && followers >= largeFollowers)) return 'large';
  return 'ok';
}

// Nom exact, ou suivi d'un pays ou d'une mention officielle (« nike france », « sephora_officiel ») : pas de simple début de mot, « dovetail » n'est pas « dove »
const SUFFIX = ['', 'france', 'fr', 'paris', 'official', 'officiel', 'officielle', 'europe', 'beauty', 'store', 'shop'];
/** La marque (nom ou pseudo) figure-t-elle dans la liste des marques toujours refusées ? */
export function isBlockedBrand(list, name, handle = '') {
  const names = String(list || '').split(/[,\n]/).map(norm).filter(n => n.length >= 2);
  const n = norm(name); const h = norm(String(handle || '').replace(/^https:\/\/www\.instagram\.com\//, ''));
  return names.some(b => SUFFIX.some(x => (n && n === b + x) || (h && h === b + x)));
}

/** Seuils et liste réglés dans l'admin (Réglages → Prospection) */
export async function sizeSettings() {
  const get = (k) => getSetting(SETTINGS[k].key, SETTINGS[k].default);
  const [largeAds, hugeAds, largeFollowers, hugeFollowers, blockedList] = await Promise.all([get('suggestLargeAds'), get('suggestHugeAds'), get('brandLargeFollowers'), get('brandHugeFollowers'), get('suggestBlockedBrands')]);
  return { largeAds, hugeAds, largeFollowers, hugeFollowers, blockedList };
}

/** Taille d'une marque trouvée par la prospection, d'après ce qu'on sait déjà d'elle (aucun appel extérieur) */
export async function brandTier({ name, handle = '', followers = null, ads = null }, settings = null) {
  const st = settings || await sizeSettings();
  const blocked = isBlockedBrand(st.blockedList, name, handle);
  return { tier: tierOf({ blocked, ads, followers }, st), blocked };
}

const sizeSchema = z.object({ size: z.enum(['unknown', 'small', 'medium', 'large', 'huge']), group: z.string().max(80), reason: z.string().max(200) });
const withTimeout = (p, ms) => Promise.race([p, new Promise(resolve => setTimeout(() => resolve(null), ms))]);

/** Indices de taille : liste des marques toujours refusées, annonces actives (Meta), connaissance de l'IA. Chaque indice peut manquer. */
export async function estimateSize({ name, website, instagram }) {
  const st = await sizeSettings();
  const blocked = isBlockedBrand(st.blockedList, name, instagram);
  const size = { blocked, ads: null, ai: '', group: '', reason: '' };
  if (!blocked) {
    const [meta, ai] = await Promise.all([
      withTimeout(import('./browserTasks.js').then(m => m.lookupBrandOnMeta(name)).catch(() => null), 12000),
      !aiConfig().configured ? null : withTimeout(generateJson({
        system: 'Tu estimes la taille d\'une marque grand public pour une plateforme française de vidéos UGC. Tu réponds en JSON, sans inventer : si tu ne connais pas la marque, size = "unknown".',
        prompt: `Marque : « ${name} »${website ? `, site ${website}` : ''}${instagram ? `, Instagram ${instagram}` : ''}.\n\nRéponds avec :\n- size : unknown (tu ne la connais pas), small (jeune marque, vente en ligne, fondateur joignable), medium (marque installée mais indépendante), large (marque nationale très connue, vendue en grande distribution ou en grandes enseignes), huge (marque mondiale ou filiale phare d'un grand groupe coté)\n- group : le groupe propriétaire s'il est connu, sinon chaîne vide\n- reason : une phrase factuelle`,
        schema: sizeSchema, normalize: (o) => ({ size: ['unknown', 'small', 'medium', 'large', 'huge'].includes(o.size) ? o.size : 'unknown', group: String(o.group || '').slice(0, 80), reason: String(o.reason || '').slice(0, 200) }),
      }).catch(err => { logger.warn(`Brand size estimate ${name}: ${err.message}`); return null; }), 20000),
    ]);
    if (meta) size.ads = meta.ads || 0;
    if (ai) { size.ai = ai.size; size.group = ai.group; size.reason = ai.reason; }
  } else size.reason = 'Marque de la liste des marques toujours refusées';
  return { size, tier: tierOf(size, st) };
}

/** Prospect marque déjà connu pour cette suggestion (site, Instagram ou nom) */
async function existingLead({ name, website, instagram }) {
  const esc = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const or = [{ name: new RegExp(`^\\s*${esc(name.trim())}\\s*$`, 'i') }];
  if (website) { try { or.push({ website: new RegExp(`^https?://(www\\.)?${esc(new URL(website).hostname.replace(/^www\./, ''))}(/|$)`, 'i') }); } catch { /* adresse illisible */ } }
  if (instagram) or.push({ 'socials.instagram': new RegExp(`instagram\\.com/${esc(instagram.replace(/^https:\/\/www\.instagram\.com\//, '').replace(/\/$/, ''))}/?$`, 'i') });
  return Lead.findOne({ kind: 'brand', $or: or }).sort({ createdAt: 1 });
}

const HUGE_TEXT = 'Cette marque est trop grande pour une candidature spontanée : elle travaille avec des agences et des créateurs sous contrat, et ne répond pas aux propositions directes. Choisissez une marque plus petite, dont vous possédez aussi un produit : vos chances y sont bien meilleures.';
const LARGE_TEXT = 'Cette marque est grande : ce type de marque répond rarement aux propositions directes, vos chances sont faibles. Vous pouvez la proposer quand même, ou choisir une marque plus petite.';

/**
 * Suggestion d'un créateur. Retourne { outcome, message, … } :
 * existing (la marque est déjà dans la liste), confirm (grande marque : à confirmer), refused (très grande marque), pending (en attente de validation).
 */
export async function suggestBrand(creator, input = {}) {
  const name = String(input.name || '').trim().slice(0, 120);
  const product = String(input.product || '').trim().slice(0, 120);
  const website = cleanWebsite(input.website);
  const instagram = cleanInstagram(input.instagram);
  const missing = [name.length < 2 && 'le nom de la marque', product.length < 2 && 'le produit que vous possédez', !website && !instagram && 'le site ou le profil Instagram de la marque'].filter(Boolean);
  if (missing.length) throw fail(400, `Il manque : ${missing.join(', ')}`);
  const key = suggestionKey({ name, website, instagram });
  // Déjà un prospect : proposé tel quel s'il est actif, sinon explication
  const lead = await existingLead({ name, website, instagram });
  if (lead) {
    if (lead.status === 'registered') throw fail(409, `${lead.name} est déjà inscrite sur NeedCreator : surveillez ses campagnes plutôt que de lui envoyer une candidature spontanée.`);
    if (['rejected', 'excluded'].includes(lead.status)) throw fail(409, `${lead.name} a déjà été contactée et ne souhaite pas recevoir de proposition. Choisissez une autre marque.`);
    if (lead.reservedUntil && lead.reservedUntil > new Date() && String(lead.suggestedBy) !== String(creator._id)) throw fail(409, `${lead.name} vient d'être suggérée par un autre créateur, qui a la priorité jusqu'au ${lead.reservedUntil.toLocaleDateString('fr-FR')}.`);
    if (lead.status === 'new') { lead.status = 'qualified'; await lead.save(); }
    return { outcome: 'existing', message: `${lead.name} est déjà dans la liste : elle est sélectionnée, vous pouvez déposer votre vidéo.`, brand: { id: lead._id, name: lead.name, website: lead.website || null, niche: lead.niche || null } };
  }
  const same = await BrandSuggestion.findOne({ key, status: 'pending' }).lean();
  if (same) throw fail(409, String(same.creatorId) === String(creator._id) ? 'Vous avez déjà suggéré cette marque : elle est en cours de validation.' : 'Cette marque vient d\'être suggérée par un autre créateur : elle est en cours de validation.');
  const pending = await BrandSuggestion.countDocuments({ creatorId: creator._id, status: 'pending' });
  if (pending >= MAX_PENDING_SUGGESTIONS) throw fail(400, `Vous avez déjà ${MAX_PENDING_SUGGESTIONS} suggestions en attente de validation : attendez une réponse avant d'en proposer une autre.`);
  const { size, tier } = await estimateSize({ name, website, instagram });
  if (tier === 'huge') {
    const s = await BrandSuggestion.create({ creatorId: creator._id, key, name, website, instagram, product, tier, size, status: 'refused', auto: true, reason: HUGE_TEXT, decidedAt: new Date() });
    return { outcome: 'refused', message: HUGE_TEXT, suggestion: serialize(s) };
  }
  if (tier === 'large' && !input.confirm) return { outcome: 'confirm', message: LARGE_TEXT, tier };
  const s = await BrandSuggestion.create({ creatorId: creator._id, key, name, website, instagram, product, tier, size });
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  notifyAdmins(`Marque suggérée par un créateur : ${name}`, `<h1>Nouvelle marque suggérée</h1><p><strong>${esc(creator.profile?.name || 'Un créateur')}</strong> possède « ${esc(product)} » et propose de tourner une vidéo pour <strong>${esc(name)}</strong>${website ? ` (${esc(website)})` : ''}${instagram ? ` · ${esc(instagram)}` : ''}.</p><p>Taille estimée : ${tier === 'large' ? 'grande marque (le créateur a été prévenu)' : 'accessible'}${size.ads != null ? ` · ${size.ads} annonce(s) active(s)` : ''}${size.reason ? ` · ${esc(size.reason)}` : ''}</p><p><a href="${SITE()}/admin?tab=acquisition">Valider ou refuser dans l'admin (bouton « Marques suggérées »)</a></p>`).catch(() => {});
  return { outcome: 'pending', message: `${name} est proposée à l'équipe NeedCreator. Vous serez prévenu dès sa validation, en général sous 48 heures : attendez-la avant de tourner.`, suggestion: serialize(s) };
}

export function serialize(s) {
  return { id: s._id, name: s.name, website: s.website || null, instagram: s.instagram || null, product: s.product, tier: s.tier, status: s.status, reason: s.reason || '', leadId: s.leadId || null, createdAt: s.createdAt, decidedAt: s.decidedAt || null };
}

export async function listMySuggestions(creatorId) {
  const list = await BrandSuggestion.find({ creatorId }).sort({ createdAt: -1 }).limit(20).lean();
  return { suggestions: list.map(serialize), pending: list.filter(s => s.status === 'pending').length, max: MAX_PENDING_SUGGESTIONS };
}

/** Admin : suggestions en attente d'abord, puis les dernières décidées */
export async function listSuggestionsForAdmin({ limit = 100 } = {}) {
  const list = await BrandSuggestion.find({}).sort({ status: -1, createdAt: -1 }).limit(limit).populate('creatorId', 'profile.name profile.niches email').lean();
  const order = { pending: 0, approved: 1, refused: 2 };
  return list.sort((a, b) => (order[a.status] - order[b.status]) || (new Date(b.createdAt) - new Date(a.createdAt))).map(s => ({ ...serialize(s), size: s.size || {}, auto: !!s.auto, creatorName: s.creatorId?.profile?.name || '', creatorNiches: s.creatorId?.profile?.niches || [] }));
}

/** Validation : la fiche prospect est créée (qualifiée en arrière-plan), réservée au créateur, qui est prévenu par notification et email */
export async function approveSuggestion(id, { niche = '', email = '' } = {}) {
  const s = await BrandSuggestion.findById(id);
  if (!s) throw fail(404, 'Suggestion introuvable');
  if (s.status !== 'pending') throw fail(400, 'Cette suggestion a déjà été traitée');
  const creator = await User.findById(s.creatorId).select('email profile.name profile.niches preferences').lean();
  const to = String(email || '').trim().toLowerCase();
  if (to && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw fail(400, 'Adresse email invalide');
  const reservedUntil = new Date(Date.now() + RESERVED_DAYS * DAY);
  let lead = await existingLead(s);
  if (lead) { lead.suggestedBy = lead.suggestedBy || s.creatorId; lead.reservedUntil = reservedUntil; if (['new', 'rejected', 'excluded'].includes(lead.status)) lead.status = 'qualified'; if (to && !lead.email) { lead.email = to; lead.emailSource = 'manuel'; } await lead.save(); }
  else {
    lead = await Lead.create({
      kind: 'brand', source: 'manual', externalId: `suggestion-${s.key}`, name: s.name, website: s.website || undefined, url: s.website || s.instagram || undefined, country: 'FR',
      socials: s.instagram ? { instagram: s.instagram } : {}, niche: String(niche || creator?.profile?.niches?.[0] || '').trim() || undefined,
      description: `Marque suggérée par un créateur NeedCreator qui possède le produit « ${s.product} ».`, status: 'qualified', score: 50, email: to || undefined, emailSource: to ? 'manuel' : undefined,
      stats: s.size?.ads != null ? { ads: s.size.ads } : undefined, notes: `Suggérée par ${creator?.profile?.name || 'un créateur'} (produit possédé : ${s.product})`, suggestedBy: s.creatorId, reservedUntil,
    });
    // Qualification (secteur, accroches, message) et recherche de l'email sur le site : en arrière-plan, la validation n'attend pas
    const leadId = lead._id;
    setImmediate(async () => {
      try {
        const l = await Lead.findById(leadId); if (!l) return;
        const { qualifyOne } = await import('./acquisition/index.js');
        await qualifyOne(l, []);
        if (l.status === 'rejected') { l.status = 'qualified'; await l.save(); } // l'équipe a validé : la note de l'IA n'écarte pas la marque
        if (!l.email && l.website) { const { enrichLeadFromSite } = await import('./acquisition/enrich.js'); await enrichLeadFromSite(l).catch(() => false); await l.save(); }
      } catch (err) { logger.warn(`Suggested brand ${leadId} not enriched: ${err.message}`); }
    });
  }
  s.status = 'approved'; s.leadId = lead._id; s.decidedAt = new Date(); await s.save();
  const href = `/vitrine?marque=${lead._id}`;
  const until = reservedUntil.toLocaleDateString('fr-FR');
  await notify(s.creatorId, { type: 'application', title: `${s.name} est validée : à vous de tourner`, text: `Produit : ${s.product}. La marque vous est réservée jusqu'au ${until}.`, href });
  if (creator?.email && creator.preferences?.emailNotifications !== false) {
    const { sendBrandSuggestionApproved } = await import('./email.js');
    sendBrandSuggestionApproved(creator.email, creator.profile?.name || '', s, `${SITE()}${href}`, until, creator.preferences?.language === 'en' ? 'en' : 'fr').catch(err => logger.warn(`Suggestion approved email ${s._id}: ${err.message}`));
  }
  return { suggestion: serialize(s), lead };
}

/** Refus par l'équipe : le créateur est prévenu avec le motif */
export async function refuseSuggestion(id, reason = '') {
  const s = await BrandSuggestion.findById(id);
  if (!s) throw fail(404, 'Suggestion introuvable');
  if (s.status !== 'pending') throw fail(400, 'Cette suggestion a déjà été traitée');
  s.status = 'refused'; s.reason = String(reason || '').trim().slice(0, 300) || 'Cette marque ne correspond pas aux marques que nous pouvons démarcher pour l\'instant.'; s.decidedAt = new Date();
  await s.save();
  await notify(s.creatorId, { type: 'application', title: `${s.name} n'a pas été retenue`, text: `${s.reason} Vous pouvez suggérer une autre marque.`, href: '/vitrine' });
  return { suggestion: serialize(s) };
}
