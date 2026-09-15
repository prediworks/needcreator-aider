import logger from '../../utils/logger.js';
import { getSetting, SETTINGS } from '../../models/Setting.js';
import { findEmailOnSite } from './enrich.js';

const API = 'https://graph.facebook.com/v21.0';
export async function metaToken() { return (await getSetting(SETTINGS.metaAccessToken.key, '')) || process.env.META_ACCESS_TOKEN || ''; }
export const metaConfigured = async () => !!(await metaToken());

/**
 * Bibliothèque publicitaire Meta : marques françaises avec des publicités actives sur un mot-clé (secteur).
 * Signal fort : une marque qui paie de la publicité vidéo a besoin de contenu. Domaine repéré dans les liens des annonces.
 * Nécessite une identité confirmée chez Meta et l'autorisation ads_read.
 */
export async function searchBrands(keyword, { limit = 50 } = {}) {
  const token = await metaToken();
  if (!token) return [];
  const url = new URL(`${API}/ads_archive`);
  url.searchParams.set('search_terms', keyword);
  url.searchParams.set('ad_reached_countries', '["FR"]');
  url.searchParams.set('ad_active_status', 'ACTIVE');
  url.searchParams.set('ad_type', 'ALL');
  url.searchParams.set('limit', String(Math.min(100, limit)));
  url.searchParams.set('fields', 'page_id,page_name,ad_creative_link_captions,ad_creative_link_titles,ad_creative_bodies,ad_snapshot_url,publisher_platforms');
  url.searchParams.set('access_token', token);
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) { const e = new Error(`Meta ads_archive: ${data.error.message}`); e.code = data.error.code; throw e; }
  const byPage = new Map();
  for (const ad of data.data || []) {
    if (!ad.page_id) continue;
    const cur = byPage.get(ad.page_id) || { kind: 'brand', source: 'meta', externalId: ad.page_id, name: ad.page_name, handle: ad.page_name, url: `https://www.facebook.com/${ad.page_id}`, country: 'FR', keyword, stats: { ads: 0 }, description: '', domains: new Set() };
    cur.stats.ads++;
    for (const cap of ad.ad_creative_link_captions || []) { const d = String(cap).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]; if (d && d.includes('.') && !/facebook|instagram|fb\.me|linktr|bit\.ly/.test(d)) cur.domains.add(d); }
    if (!cur.description && ad.ad_creative_bodies?.[0]) cur.description = String(ad.ad_creative_bodies[0]).slice(0, 600);
    byPage.set(ad.page_id, cur);
  }
  const out = [];
  for (const b of byPage.values()) {
    const website = [...b.domains][0] || null;
    let email = null, emailSource = null;
    if (website) { const r = await findEmailOnSite(`https://${website}`); if (r) { email = r.email; emailSource = r.source; } }
    delete b.domains;
    out.push({ ...b, website: website ? `https://${website}` : null, email, emailSource });
  }
  logger.info(`Meta « ${keyword} » : ${(data.data || []).length} annonces, ${out.length} marques, ${out.filter(o => o.email).length} avec email`);
  return out;
}
