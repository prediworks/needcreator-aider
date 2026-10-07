import logger from '../../utils/logger.js';
import { getSetting, SETTINGS } from '../../models/Setting.js';

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
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
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
  // L'email est cherché sur le site plus tard, seulement pour les marques retenues (sinon 50 sites visités par mot-clé, plus d'une heure par recherche)
  const out = [];
  for (const b of byPage.values()) {
    const website = [...b.domains][0] || null;
    delete b.domains;
    out.push({ ...b, website: website ? `https://${website}` : null, email: null, emailSource: null });
  }
  logger.info(`Meta « ${keyword} » : ${(data.data || []).length} annonces, ${out.length} marques`);
  return out;
}

const AD_FIELDS = 'id,page_id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_creative_link_captions,publisher_platforms,ad_delivery_start_time,ad_delivery_stop_time,eu_total_reach,target_ages,target_gender,target_locations,languages';

/**
 * Publicités actives (France) : par mot-clé (`search_terms`) ou par page (`search_page_ids`). Suit la pagination jusqu'à `max` publicités.
 * Mêmes conditions d'accès que searchBrands. Erreur Meta remontée avec son code (10 : identité non vérifiée, 190 : jeton expiré).
 */
export async function fetchAds({ terms, pageIds, max = 200, country = 'FR' } = {}) {
  const token = await metaToken();
  if (!token) throw Object.assign(new Error('Meta non configuré'), { code: 'NO_TOKEN' });
  const out = [];
  let url = new URL(`${API}/ads_archive`);
  if (terms) url.searchParams.set('search_terms', terms);
  if (pageIds?.length) url.searchParams.set('search_page_ids', JSON.stringify(pageIds.map(String)));
  url.searchParams.set('ad_reached_countries', JSON.stringify([country]));
  url.searchParams.set('ad_active_status', 'ACTIVE');
  url.searchParams.set('ad_type', 'ALL');
  url.searchParams.set('limit', String(Math.min(100, max)));
  url.searchParams.set('fields', AD_FIELDS);
  url.searchParams.set('access_token', token);
  for (let page = 0; page < 5 && url && out.length < max; page++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const data = await res.json();
    if (data.error) { const e = new Error(`Meta ads_archive: ${data.error.message}`); e.code = data.error.code; throw e; }
    out.push(...(data.data || []));
    url = data.paging?.next ? new URL(data.paging.next) : null;
  }
  return out.slice(0, max);
}
