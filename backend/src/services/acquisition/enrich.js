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
export async function fetchPage(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NeedCreatorBot/1.0; +https://needcreator.com)', Accept: 'text/html,*/*;q=0.5' } });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!/text\/html|text\/plain|application\/json/.test(type)) return null;
    const reader = res.body.getReader();
    let received = 0; const chunks = [];
    while (received < MAX_BYTES) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); received += value.length; }
    try { reader.cancel(); } catch {}
    return Buffer.concat(chunks).toString('utf8');
  } catch (err) {
    return null;
  } finally { clearTimeout(t); }
}

const decode = (html) => String(html || '').replace(/&#64;|&commat;/g, '@').replace(/\s?\[at\]\s?|\s\(at\)\s|\s+at\s+(?=[a-z0-9-]+\s?(\.|\[dot\]|\(dot\))\s?[a-z]{2,})/gi, '@').replace(/\s?\[dot\]\s?|\s\(dot\)\s/gi, '.');
const stripTags = (html) => decode(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/** Cherche un email sur une page, puis sur ses pages contact / mentions légales (même domaine) */
export async function findEmailOnSite(startUrl, { maxPages = 4 } = {}) {
  if (!startUrl) return null;
  let base;
  try { base = new URL(startUrl.startsWith('http') ? startUrl : `https://${startUrl}`); } catch { return null; }
  const visited = new Set();
  const queue = [base.href];
  const candidates = [];
  const contactWords = /contact|mentions|legal|legales|impressum|about|a-propos|apropos|qui-sommes|collab|partenariat|presse|press/i;
  while (queue.length && visited.size < maxPages) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    const html = await fetchPage(url);
    if (!html) continue;
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
  }
  const email = pickEmail([...new Set(candidates)]);
  if (email) logger.debug(`Email found on ${base.hostname}: ${email}`);
  return email ? { email, source: visited.size > 1 ? 'site:contact' : 'site' } : null;
}

/** Lien de bio (Linktree, Beacons, site perso…) : la page liste souvent un email ou un mailto */
export async function findEmailViaLinks(links = []) {
  for (const l of links.slice(0, 3)) {
    const r = await findEmailOnSite(l, { maxPages: 2 });
    if (r) return { email: r.email, source: 'lien-bio' };
  }
  return null;
}
