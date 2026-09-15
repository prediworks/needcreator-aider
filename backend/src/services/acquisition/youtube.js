import logger from '../../utils/logger.js';
import { extractEmails, pickEmail, findEmailViaLinks } from './enrich.js';

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
    let email = pickEmail(extractEmails(description)), emailSource = email ? 'bio' : null;
    if (!email && links.length) { const r = await findEmailViaLinks(links); if (r) { email = r.email; emailSource = r.source; } }
    out.push({
      kind: 'creator', source: 'youtube', externalId: c.id,
      name: c.snippet?.title, handle: c.snippet?.customUrl || null, url: `https://www.youtube.com/${c.snippet?.customUrl || `channel/${c.id}`}`,
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
