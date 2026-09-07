import crypto from 'crypto';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Intégration Shopify (application publique/custom OAuth).
 * Configuration : SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SCOPES, SHOPIFY_APP_URL (URL publique du backend).
 */
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

export function shopifyConfig() {
  return {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SHOPIFY_SCOPES || 'read_products,write_products',
    appUrl: (process.env.SHOPIFY_APP_URL || '').replace(/\/$/, ''),
    configured: !!(process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET && process.env.SHOPIFY_APP_URL),
  };
}

export function normalizeShop(shop = '') {
  const s = String(shop).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const full = s.includes('.') ? s : `${s}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(full)) return null;
  return full;
}

/**
 * State signé (HMAC) pour lier le retour OAuth à l'utilisateur
 */
export function signState(payload) {
  const data = Buffer.from(JSON.stringify({ ...payload, t: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', config.security.jwtSecret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyState(state = '') {
  const [data, sig] = String(state).split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', config.security.jwtSecret).update(data).digest('base64url');
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
  if (Date.now() - payload.t > 15 * 60 * 1000) return null; // 15 min
  return payload;
}

/**
 * Vérifie le HMAC des requêtes de callback Shopify
 */
export function verifyShopifyHmac(query, secret = shopifyConfig().apiSecret) {
  const { hmac, signature, ...rest } = query;
  if (!hmac || !secret) return false;
  const message = Object.keys(rest).sort().map(k => `${k}=${Array.isArray(rest[k]) ? rest[k].join(',') : rest[k]}`).join('&');
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return digest.length === hmac.length && crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(String(hmac)));
}

export function installUrl(shop, state) {
  const c = shopifyConfig();
  const redirect = `${c.appUrl}/api/integrations/shopify/callback`;
  return `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(c.apiKey)}&scope=${encodeURIComponent(c.scopes)}&redirect_uri=${encodeURIComponent(redirect)}&state=${encodeURIComponent(state)}`;
}

export async function exchangeCodeForToken(shop, code) {
  const c = shopifyConfig();
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: c.apiKey, client_secret: c.apiSecret, code }),
  });
  if (!res.ok) throw new Error(`Shopify token exchange failed (${res.status})`);
  return res.json(); // { access_token, scope }
}

async function adminRequest(shop, token, method, endpoint, body) {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/${endpoint}`, {
    method,
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* vide */ }
  if (!res.ok) {
    logger.error(`Shopify ${method} ${endpoint} → ${res.status}: ${text.slice(0, 300)}`);
    throw new Error(data?.errors ? JSON.stringify(data.errors) : `Shopify ${res.status}`);
  }
  return data;
}

const stripHtml = (html = '') => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Liste des produits (titre, description, image, prix)
 */
export async function listProducts(shop, token, { q = '', limit = 20 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), fields: 'id,title,body_html,handle,images,variants,status' });
  if (q) params.set('title', q);
  const data = await adminRequest(shop, token, 'GET', `products.json?${params}`);
  return (data.products || []).map(p => ({
    id: p.id,
    title: p.title,
    description: stripHtml(p.body_html).slice(0, 1500),
    handle: p.handle,
    image: p.images?.[0]?.src || null,
    price: p.variants?.[0]?.price || null,
    url: `https://${shop}/products/${p.handle}`,
    status: p.status,
  }));
}

/**
 * Ajoute des vidéos UGC à la fiche produit via un metafield JSON `needcreator.ugc_videos`
 * (affichable dans le thème via {{ product.metafields.needcreator.ugc_videos }})
 */
export async function publishVideosToProduct(shop, token, productId, videos) {
  const existing = await adminRequest(shop, token, 'GET', `products/${productId}/metafields.json?namespace=needcreator&key=ugc_videos`);
  const current = existing.metafields?.[0];
  let list = [];
  if (current?.value) { try { list = JSON.parse(current.value); } catch { list = []; } }
  const merged = [...list.filter(v => !videos.some(n => n.url === v.url)), ...videos];
  const body = { metafield: { namespace: 'needcreator', key: 'ugc_videos', type: 'json', value: JSON.stringify(merged) } };
  if (current) {
    await adminRequest(shop, token, 'PUT', `metafields/${current.id}.json`, { metafield: { id: current.id, type: 'json', value: JSON.stringify(merged) } });
  } else {
    await adminRequest(shop, token, 'POST', `products/${productId}/metafields.json`, body);
  }
  return merged.length;
}
