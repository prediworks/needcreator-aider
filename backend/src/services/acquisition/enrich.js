import logger from '../../utils/logger.js';

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const IGNORED = /(example\.|sentry|wixpress|@2x|\.png|\.jpg|\.svg|noreply|no-reply|donotreply|@facebook|@instagram|@youtube|@google|@apple|@tiktok|privacy@|dpo@|abuse@)/i;

/** Extrait les emails plausibles d'un texte (bio, page web) */
export function extractEmails(text) {
  const out = new Set();
  for (const m of String(text || '').match(EMAIL_RE) || []) {
    const e = m.toLowerCase().replace(/^[._-]+/, '');
    if (!IGNORED.test(e) && e.length < 80) out.add(e);
  }
  return [...out];
}

/** Meilleur email d'une liste : préfère les adresses nominatives ou « collab », évite les génériques techniques */
export function pickEmail(list) {
  const score = (e) => (/^(contact|hello|bonjour|collab|partenariat|pro|business|booking)@/.test(e) ? 2 : /^(info|admin|support|sales|commercial|marketing|presse|press)@/.test(e) ? 1 : 3);
  return [...list].sort((a, b) => score(b) - score(a))[0] || null;
}

const FETCH_TIMEOUT = 8000;
const MAX_BYTES = 400 * 1024;

/** Télécharge une page (HTML texte seulement, taille bornée, délai court) */
export async function fetchPage(url, { maxBytes = MAX_BYTES } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NeedCreatorBot/1.0; +https://needcreator.com)', Accept: 'text/html,*/*;q=0.5' } });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!/text\/html|text\/plain|application\/json/.test(type)) return null;
    const reader = res.body.getReader();
    let received = 0; const chunks = [];
    while (received < maxBytes) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); received += value.length; }
    try { reader.cancel(); } catch {}
    return Buffer.concat(chunks).toString('utf8');
  } catch (err) {
    return null;
  } finally { clearTimeout(t); }
}

const decode = (html) => String(html || '').replace(/&#64;|&commat;/g, '@').replace(/\s?\[at\]\s?|\s\(at\)\s|\s+at\s+(?=[a-z0-9-]+\s?(\.|\[dot\]|\(dot\))\s?[a-z]{2,})/gi, '@').replace(/\s?\[dot\]\s?|\s\(dot\)\s/gi, '.');
const stripTags = (html) => decode(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const SOCIAL_PATTERNS = {
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})\/?(?![\w.])/gi,
  tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]{2,30})/gi,
  youtube: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)([A-Za-z0-9_.-]{2,40})/gi,
  linkedin: /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/([A-Za-z0-9_.%-]{2,60})/gi,
  facebook: /https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|share|dialog|plugins|login|policies|privacy|tr\b)([A-Za-z0-9_.-]{3,60})/gi,
};
const SOCIAL_IGNORED = { instagram: /^(p|reel|reels|explore|accounts|stories|share|tv|about|legal|developer|api|directory)$/i, tiktok: /^(discover|tag|foryou|explore|search)$/i, youtube: /^(watch|shorts|results|feed|playlist)$/i, facebook: /^(profile\.php|groups|events|pages|photo|watch|marketplace|hashtag|help|business|about|legal)$/i };
/** Comptes réseaux sociaux cités dans un texte, une bio ou une page HTML (profils uniquement : pas de publications ni de boutons de partage) */
export function extractSocials(text) {
  const out = {};
  for (const [net, re] of Object.entries(SOCIAL_PATTERNS)) {
    for (const m of String(text || '').matchAll(re)) {
      const handle = m[1].replace(/\.$/, '');
      if (SOCIAL_IGNORED[net]?.test(handle)) continue;
      out[net] = net === 'youtube' ? `https://www.youtube.com/${/^UC[\w-]{20,}$/.test(handle) ? 'channel/' : m[0].includes('/c/') ? 'c/' : m[0].includes('/user/') ? 'user/' : '@'}${handle.replace(/^@/, '')}`
        : net === 'tiktok' ? `https://www.tiktok.com/@${handle}` : net === 'instagram' ? `https://www.instagram.com/${handle}/`
        : net === 'linkedin' ? `https://www.linkedin.com/${m[0].includes('/in/') ? 'in' : 'company'}/${handle}/` : `https://www.facebook.com/${handle}`;
      break;
    }
  }
  // Pseudos @tiktok / @instagram écrits dans une bio : « TikTok : @moncompte »
  for (const m of String(text || '').matchAll(/\b(tiktok|instagram|insta|ig)\s*[:：]?\s*@([A-Za-z0-9_.]{2,30})/gi)) {
    const net = /tiktok/i.test(m[1]) ? 'tiktok' : 'instagram';
    const h = m[2].replace(/\.$/, "");
    if (!out[net]) out[net] = net === 'tiktok' ? `https://www.tiktok.com/@${h}` : `https://www.instagram.com/${h}/`;
  }
  return out;
}

/** Cherche un email sur une page, puis sur ses pages contact / mentions légales (même domaine) ; relève aussi les réseaux sociaux affichés */
export async function findEmailOnSite(startUrl, { maxPages = 4 } = {}) {
  if (!startUrl) return null;
  let base;
  try { base = new URL(startUrl.startsWith('http') ? startUrl : `https://${startUrl}`); } catch { return null; }
  const visited = new Set();
  const queue = [base.href];
  const candidates = [];
  const socials = {};
  const contactWords = /contact|mentions|legal|legales|impressum|about|a-propos|apropos|qui-sommes|collab|partenariat|presse|press/i;
  while (queue.length && visited.size < maxPages) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    const html = await fetchPage(url, { maxBytes: 6 * 1024 * 1024 }); // boutiques en ligne : pages d'accueil de 1 à 4 Mo, le pied de page (contact, mentions légales) est tout à la fin
    if (!html) continue;
    for (const [k, v] of Object.entries(extractSocials(html))) if (!socials[k]) socials[k] = v;
    // mailto: en priorité
    for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) candidates.push(...extractEmails(decodeURIComponent(m[1])));
    candidates.push(...extractEmails(stripTags(html)));
    if (candidates.length) break;
    // liens vers contact / mentions légales du même domaine
    for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
      let href;
      try { href = new URL(m[1], base.href); } catch { continue; }
      if (href.hostname !== base.hostname || !contactWords.test(href.pathname)) continue;
      if (!visited.has(href.href) && queue.length < 6) queue.push(href.href);
    }
    // Aucun lien repéré sur l'accueil (menu chargé en JavaScript) : adresses habituelles des pages légales et de contact, Shopify en tête
    if (visited.size === 1 && !queue.length && maxPages > 2) for (const path of ['/policies/legal-notice', '/policies/contact-information', '/pages/contact', '/contact', '/mentions-legales', '/pages/mentions-legales']) queue.push(new URL(path, base.href).href);
  }
  const email = pickEmail([...new Set(candidates)]);
  if (email) logger.debug(`Email found on ${base.hostname}: ${email}`);
  if (!email && !Object.keys(socials).length) return null;
  return { email: email || null, source: email ? (visited.size > 1 ? 'site:contact' : 'site') : null, socials };
}

/** Lien de bio (Linktree, Beacons, site perso…) : la page liste souvent un email ou un mailto */
export async function findEmailViaLinks(links = []) {
  const socials = {};
  for (const l of links.slice(0, 3)) {
    const r = await findEmailOnSite(l, { maxPages: 2 });
    for (const [k, v] of Object.entries(r?.socials || {})) if (!socials[k]) socials[k] = v;
    if (r?.email) return { email: r.email, source: 'lien-bio', socials };
  }
  return Object.keys(socials).length ? { email: null, source: null, socials } : null;
}

const BARE_DOMAIN = /(?<![@\w.-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:fr|com|co|io|shop|store|paris|eu|net|org|bio|care|me|be|ch|ca|lu|bzh|app|studio|club|life|world|beauty|fashion|boutique))(?![\w@-])(?:\/[^\s;,|"']*)?/gi;
const NOT_A_SITE = /^(?:www\.)?(?:instagram|tiktok|youtube|youtu|linkedin|facebook|fb|twitter|x|pinterest|snapchat|linktr|beacons|gmail|outlook|hotmail|yahoo|orange|free|laposte|wanadoo|sfr|icloud|proton|protonmail|google|apple|amazon|cdiscount|etsy|vinted)\.[a-z.]+$/i;
/** Site écrit sans « https:// » dans un texte (« respire.co », « www.cabaia.fr/pages/contact ») : renvoie l'adresse complète du premier site plausible */
export function findBareDomain(text) {
  for (const m of String(text || '').matchAll(BARE_DOMAIN)) {
    const host = m[1].toLowerCase();
    if (NOT_A_SITE.test(host) || host.split('.').length < 2 || /^\d+(\.\d+)*$/.test(host)) continue;
    return `https://${host}`;
  }
  return null;
}

/**
 * Complète l'email (et les réseaux) d'un prospect à partir de son site : page d'accueil, contact, mentions légales.
 * Retourne true si un email a été trouvé. Ne touche pas un email déjà présent.
 */
export async function enrichLeadFromSite(lead) {
  let site = lead.website || (lead.url && !/instagram\.com|tiktok\.com|youtube\.com|youtu\.be|linkedin\.com|facebook\.com/i.test(lead.url) ? lead.url : null);
  // Site écrit sans « https:// » et resté dans la description ou le nom (imports anciens) : on le range dans le champ « site »
  if (!site) { site = findBareDomain(`${lead.description || ''} ${lead.name || ''}`); if (site) lead.website = site; }
  if (!site) return false;
  const r = await findEmailOnSite(site, { maxPages: 4 });
  if (!r) return false;
  const cur = lead.socials?.toObject?.() || lead.socials || {};
  const merged = { ...r.socials, ...Object.fromEntries(Object.entries(cur).filter(([, v]) => v)) };
  if (Object.keys(merged).length) lead.socials = merged;
  if (r.email && !lead.email) { lead.email = r.email; lead.emailSource = r.source; return true; }
  return false;
}
