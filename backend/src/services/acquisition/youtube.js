import logger from '../../utils/logger.js';
import { extractEmails, pickEmail, findEmailViaLinks, extractSocials } from './enrich.js';

const API = 'https://www.googleapis.com/youtube/v3';
const key = () => process.env.YOUTUBE_API_KEY || '';
export const youtubeConfigured = () => !!key();

async function yt(path, params) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', key());
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`YouTube ${path}: ${data.error.message}`);
  return data;
}

/**
 * Recherche des chaînes par mot-clé (FR), puis détails (statistiques, description, pays), extraction de l'email
 * de la description ou des liens. Coût : 100 unités par recherche + 1 par lot de 50 chaînes (quota 10 000 / jour).
 */
/**
 * Rubrique « Liens » de la chaîne (Instagram, TikTok…) : absente de l'API Data, mais présente dans la page publique « À propos ».
 * Une lecture par chaîne, avec le cookie de consentement européen ; aucune connexion.
 */
export async function channelLinks(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`${String(url).replace(/\/$/, '')}/about`, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', 'Accept-Language': 'fr-FR,fr;q=0.9', Cookie: 'SOCS=CAI; CONSENT=YES+cb' } }).finally(() => clearTimeout(t));
    if (!res.ok) return {};
    const html = await res.text();
    // Les liens externes passent par youtube.com/redirect?q=<url encodée>
    const decoded = [...html.matchAll(/[?&]q=(https?%3A%2F%2F[^&"\\]+)/g)].map(m => { try { return decodeURIComponent(m[1]); } catch { return ''; } }).join('\n');
    return extractSocials(`${decoded}\n${html}`);
  } catch { return {}; }
}

export async function searchCreators(keyword, { maxResults = 25, minSubscribers = 1000, maxSubscribers = 300000 } = {}) {
  const search = await yt('search', { part: 'snippet', type: 'channel', q: keyword, maxResults: String(Math.min(50, maxResults)), regionCode: 'FR', relevanceLanguage: 'fr' });
  const ids = (search.items || []).map(i => i.snippet?.channelId).filter(Boolean);
  if (!ids.length) return [];
  const details = await yt('channels', { part: 'snippet,statistics,brandingSettings,contentDetails', id: ids.join(','), maxResults: '50' });
  const out = [];
  for (const c of details.items || []) {
    const subs = parseInt(c.statistics?.subscriberCount || '0', 10);
    if (c.statistics?.hiddenSubscriberCount) continue;
    if (subs < minSubscribers || subs > maxSubscribers) continue;
    const description = `${c.snippet?.description || ''}\n${c.brandingSettings?.channel?.description || ''}`.trim();
    const country = c.snippet?.country || c.brandingSettings?.channel?.country || null;
    const links = [...description.matchAll(/https?:\/\/[^\s)]+/g)].map(m => m[0]);
    const url = `https://www.youtube.com/${c.snippet?.customUrl || `channel/${c.id}`}`;
    const socials = { ...extractSocials(description), youtube: url };
    let email = pickEmail(extractEmails(description)), emailSource = email ? 'bio' : null;
    if (!email && links.length) { const r = await findEmailViaLinks(links); if (r) { if (r.email) { email = r.email; emailSource = r.source; } for (const [k, v] of Object.entries(r.socials || {})) if (!socials[k]) socials[k] = v; } }
    if (!socials.instagram && !socials.tiktok) { for (const [k, v] of Object.entries(await channelLinks(url))) if (!socials[k]) socials[k] = v; }
    out.push({
      kind: 'creator', source: 'youtube', externalId: c.id,
      name: c.snippet?.title, handle: c.snippet?.customUrl || null, url, socials,
      website: links.find(l => !/youtube\.com|youtu\.be|instagram\.com|tiktok\.com/.test(l)) || null,
      country, language: c.snippet?.defaultLanguage || null, description: description.slice(0, 2000),
      email, emailSource, keyword,
      stats: { subscribers: subs, videos: parseInt(c.statistics?.videoCount || '0', 10), views: parseInt(c.statistics?.viewCount || '0', 10) },
      links,
    });
  }
  logger.info(`YouTube « ${keyword} » : ${ids.length} chaînes, ${out.length} dans la fourchette, ${out.filter(o => o.email).length} avec email`);
  return out;
}
