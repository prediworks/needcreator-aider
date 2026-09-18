import { metaToken } from './acquisition/meta.js';
import logger from '../utils/logger.js';

const GRAPH = 'https://graph.facebook.com/v21.0';
const cache = new Map(); // url → { at, data }
const TTL = 3600000;

/** Réseau et identifiant d'une publication à partir de son adresse (publications uniquement, pas les profils) */
export function parseSocialUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^(www|m|vm)\./, '');
  let m;
  if (host === 'instagram.com' && (m = u.pathname.match(/^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/))) return { provider: 'instagram', id: m[2], url: `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/` };
  if (host === 'tiktok.com' && (m = u.pathname.match(/^\/@([^/]+)\/video\/(\d+)/))) return { provider: 'tiktok', id: m[2], author: m[1], url: `https://www.tiktok.com/@${m[1]}/video/${m[2]}` };
  if (host === 'youtube.com' && (m = u.pathname.match(/^\/(?:shorts|embed)\/([A-Za-z0-9_-]{6,})/))) return { provider: 'youtube', id: m[1], url: `https://www.youtube.com/watch?v=${m[1]}` };
  if (host === 'youtube.com' && u.pathname === '/watch' && u.searchParams.get('v')) return { provider: 'youtube', id: u.searchParams.get('v'), url: `https://www.youtube.com/watch?v=${u.searchParams.get('v')}` };
  if (host === 'youtu.be' && (m = u.pathname.match(/^\/([A-Za-z0-9_-]{6,})/))) return { provider: 'youtube', id: m[1], url: `https://www.youtube.com/watch?v=${m[1]}` };
  return null;
}

/** Ne garde que le balisage d'intégration : pas de script ni de gestionnaire d'événement (le script officiel est chargé par la page) */
const cleanHtml = (html) => String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/javascript:/gi, '');

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try { const r = await fetch(url, { signal: ctrl.signal }); return await r.json(); } finally { clearTimeout(t); }
}

/**
 * Aperçu intégré d'une publication. Instagram : oEmbed de Meta (fonctionnalité « oEmbed Read ») quand elle est accordée,
 * sinon repli sur l'intégration publique par permalien (sans métadonnées). TikTok : oEmbed public. YouTube : lecteur sans cookie.
 */
export async function resolveEmbed(rawUrl) {
  const p = parseSocialUrl(rawUrl);
  if (!p) return null;
  const hit = cache.get(p.url);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  let data = { provider: p.provider, id: p.id, url: p.url, source: 'fallback', html: null, authorName: p.author || null, authorUrl: p.author ? `https://www.tiktok.com/@${p.author}` : null, thumbnailUrl: null, title: null };
  try {
    if (p.provider === 'instagram') {
      const token = await metaToken();
      if (token) {
        const o = await getJson(`${GRAPH}/instagram_oembed?url=${encodeURIComponent(p.url)}&omitscript=true&maxwidth=540&access_token=${encodeURIComponent(token)}`);
        if (o?.html) data = { ...data, source: 'oembed', html: cleanHtml(o.html), authorName: o.author_name || null, authorUrl: o.author_name ? `https://www.instagram.com/${o.author_name}/` : null, thumbnailUrl: o.thumbnail_url || null, title: o.title || null };
        else if (o?.error) data.reason = o.error.code === 10 ? 'oembed_not_approved' : 'oembed_error';
      }
    } else if (p.provider === 'tiktok') {
      const o = await getJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(p.url)}`);
      if (o?.html) data = { ...data, source: 'oembed', html: cleanHtml(o.html), authorName: o.author_unique_id || o.author_name || data.authorName, authorUrl: o.author_url || data.authorUrl, thumbnailUrl: o.thumbnail_url || null, title: o.title || null };
    } else if (p.provider === 'youtube') {
      const o = await getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(p.url)}`);
      if (o?.title) data = { ...data, source: 'oembed', authorName: o.author_name || null, authorUrl: o.author_url || null, thumbnailUrl: o.thumbnail_url || null, title: o.title };
    }
  } catch (err) { logger.debug(`resolveEmbed ${p.url}: ${err.message}`); }
  cache.set(p.url, { at: Date.now(), data });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return data;
}
