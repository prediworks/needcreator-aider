import logger from '../../utils/logger.js';
import { extractEmails, pickEmail, findEmailViaLinks } from './enrich.js';
import { metaToken } from './meta.js';
import { getSetting, SETTINGS } from '../../models/Setting.js';

const API = 'https://graph.facebook.com/v21.0';
const cache = { igUserId: null, key: '', at: 0, oembedBlocked: false };

async function graph(path, params, token) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  url.searchParams.set('access_token', token);
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) { const e = new Error(`Instagram ${path}: ${data.error.message}`); e.code = data.error.code; throw e; }
  return data;
}

/**
 * Compte Instagram professionnel relié à une page Facebook (nécessaire pour la recherche par hashtag).
 * Priorité au réglage « ID de la page Facebook » (la liste « mes pages » de Meta omet parfois une page pourtant accessible), sinon première page du jeton reliée à Instagram.
 */
export async function instagramAccount() {
  const token = await metaToken();
  if (!token) return null;
  const pageId = String(await getSetting(SETTINGS.metaPageId.key, '') || '').trim();
  const key = `${pageId}|${token.slice(-12)}`;
  if (cache.key === key && Date.now() - cache.at < 3600000) return cache.igUserId;
  let igUserId = null;
  if (pageId) {
    const page = await graph(pageId, { fields: 'id,name,instagram_business_account' }, token);
    igUserId = page.instagram_business_account?.id || null;
  }
  if (!igUserId) {
    const d = await graph('me/accounts', { fields: 'id,name,instagram_business_account' }, token);
    igUserId = (d.data || []).find(p => p.instagram_business_account?.id)?.instagram_business_account?.id || null;
  }
  cache.igUserId = igUserId; cache.key = key; cache.at = Date.now();
  return igUserId;
}
export const instagramConfigured = async () => { try { return !!(await instagramAccount()); } catch { return false; } };

/**
 * Publications récentes d'un hashtag (API officielle : 30 hashtags uniques par 7 jours). Les publications ne donnent pas l'auteur :
 * l'agent lit la légende (email, prénom, liens) ; l'auteur est complété via oEmbed quand la fonctionnalité « oEmbed Read » est approuvée.
 */
export async function searchHashtag(tag, { limit = 40 } = {}) {
  const token = await metaToken();
  const igUserId = await instagramAccount();
  if (!token || !igUserId) return [];
  const clean = String(tag).replace(/^#/, '').trim().toLowerCase();
  const found = await graph('ig_hashtag_search', { user_id: igUserId, q: clean }, token);
  const hashtagId = found.data?.[0]?.id;
  if (!hashtagId) return [];
  const media = await graph(`${hashtagId}/recent_media`, { user_id: igUserId, fields: 'id,caption,permalink,media_type,timestamp,like_count,comments_count', limit: Math.min(50, limit) }, token);
  const out = [];
  for (const m of media.data || []) {
    const caption = String(m.caption || '');
    if (!caption.trim()) continue;
    let author = null;
    if (!cache.oembedBlocked) {
      try { const o = await graph('instagram_oembed', { url: m.permalink, fields: 'author_name,author_url' }, token); author = o.author_name || null; }
      catch (err) { if (err.code === 10) cache.oembedBlocked = true; }
    }
    const links = [...caption.matchAll(/https?:\/\/[^\s)]+/g)].map(x => x[0]);
    let email = pickEmail(extractEmails(caption)), emailSource = email ? 'légende' : null;
    if (!email && links.length) { const r = await findEmailViaLinks(links); if (r) { email = r.email; emailSource = r.source; } }
    const firstLine = caption.split('\n').map(l => l.trim()).find(l => l.length > 3) || '';
    out.push({
      kind: 'creator', source: 'instagram', externalId: m.id,
      name: author ? `@${author}` : firstLine.slice(0, 60), handle: author ? `@${author}` : null, url: author ? `https://www.instagram.com/${author}/` : m.permalink,
      website: links.find(l => !/instagram\.com|tiktok\.com|youtube\.com/.test(l)) || null, country: null, language: 'fr',
      description: caption.slice(0, 2000), email, emailSource, keyword: `#${clean}`,
      stats: { likes: m.like_count || 0, comments: m.comments_count || 0, postedAt: m.timestamp ? new Date(m.timestamp) : null },
      links,
    });
  }
  logger.info(`Instagram #${clean} : ${(media.data || []).length} publications, ${out.length} avec légende, ${out.filter(o => o.email).length} avec email${cache.oembedBlocked ? ' (auteur indisponible : oEmbed non approuvé)' : ''}`);
  return out;
}
export const oembedBlocked = () => cache.oembedBlocked;
