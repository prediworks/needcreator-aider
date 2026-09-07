import User from '../models/User.js';
import Delivery from '../models/Delivery.js';
import { config } from '../config/index.js';
import {
  shopifyConfig, normalizeShop, signState, verifyState, verifyShopifyHmac,
  installUrl, exchangeCodeForToken, listProducts, publishVideosToProduct,
} from '../services/shopify.js';
import { resolveUrl } from '../services/storage.js';
import logger from '../utils/logger.js';

const idOf = (c) => (c && c._id ? c._id : c)?.toString();

function shopifyOf(user) {
  return user.integrations?.shopify?.accessToken ? user.integrations.shopify : null;
}

export function shopifyStatus(req, res) {
  const c = shopifyConfig();
  const s = shopifyOf(req.user);
  res.json({ configured: c.configured, connected: !!s, shop: s?.shop || null, installedAt: s?.installedAt || null });
}

/**
 * Démarre l'installation : renvoie l'URL d'autorisation Shopify
 */
export function shopifyInstall(req, res) {
  const c = shopifyConfig();
  if (!c.configured) {
    return res.status(503).json({ error: 'Intégration Shopify non configurée : renseignez SHOPIFY_API_KEY, SHOPIFY_API_SECRET et SHOPIFY_APP_URL dans backend/.env (application créée sur partners.shopify.com)' });
  }
  const shop = normalizeShop(req.query.shop || req.body?.shop);
  if (!shop) return res.status(400).json({ error: 'Adresse de boutique invalide (ex : ma-boutique.myshopify.com)' });
  const state = signState({ uid: req.user._id.toString(), shop });
  res.json({ url: installUrl(shop, state), shop });
}

/**
 * Retour OAuth Shopify : vérifie la signature, échange le code, enregistre le jeton
 */
export async function shopifyCallback(req, res) {
  const frontend = config.cors.origin;
  try {
    const { code, shop, state } = req.query;
    if (!verifyShopifyHmac(req.query)) return res.redirect(`${frontend}/profile?shopify=error&reason=hmac`);
    const payload = verifyState(state);
    const normalized = normalizeShop(shop);
    if (!payload || !normalized || payload.shop !== normalized) return res.redirect(`${frontend}/profile?shopify=error&reason=state`);
    const token = await exchangeCodeForToken(normalized, code);
    await User.updateOne({ _id: payload.uid }, {
      $set: { 'integrations.shopify': { shop: normalized, accessToken: token.access_token, scopes: token.scope, installedAt: new Date() } },
    });
    logger.info(`Shopify connected for brand ${payload.uid} (${normalized})`);
    res.redirect(`${frontend}/profile?shopify=connected`);
  } catch (error) {
    logger.error('Shopify callback failed:', error);
    res.redirect(`${frontend}/profile?shopify=error&reason=exchange`);
  }
}

export async function shopifyDisconnect(req, res) {
  await User.updateOne({ _id: req.user._id }, { $unset: { 'integrations.shopify': 1 } });
  res.json({ message: 'Boutique déconnectée' });
}

export async function shopifyProducts(req, res) {
  try {
    const s = shopifyOf(req.user);
    if (!s) return res.status(400).json({ error: 'Aucune boutique Shopify connectée' });
    const products = await listProducts(s.shop, s.accessToken, { q: req.query.q || '' });
    res.json({ products, shop: s.shop });
  } catch (error) {
    logger.error('Shopify products failed:', error);
    res.status(502).json({ error: `Shopify : ${error.message}` });
  }
}

/**
 * Publie les vidéos d'une livraison validée sur une fiche produit (metafield JSON)
 */
export async function shopifyPublishDelivery(req, res) {
  try {
    const s = shopifyOf(req.user);
    if (!s) return res.status(400).json({ error: 'Aucune boutique Shopify connectée' });
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: 'productId manquant' });
    const delivery = await Delivery.findOne({ _id: req.params.deliveryId, brandId: req.user._id })
      .populate('creatorId', 'profile.name').populate('campaignId', 'title');
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (!['approved', 'auto_approved'].includes(delivery.status)) return res.status(400).json({ error: 'La livraison doit être validée' });

    const videos = [];
    for (const l of (delivery.links || []).filter(x => !x.superseded)) {
      videos.push({ url: l.url, platform: l.platform, title: l.title || delivery.campaignId?.title, creator: delivery.creatorId?.profile?.name, source: 'needcreator' });
    }
    // Sorties du pack prêt à diffuser (URL publiques si le bucket est public, sinon lien signé 7 jours)
    for (const o of (delivery.readyPack?.outputs || []).filter(x => x.kind === 'video' && x.url)) {
      videos.push({ url: await resolveUrl(o.url), format: o.format, title: `${delivery.campaignId?.title} (${o.format})`, creator: delivery.creatorId?.profile?.name, source: 'needcreator' });
    }
    if (videos.length === 0) return res.status(400).json({ error: 'Aucune vidéo publiable : livrez par lien ou générez le pack prêt à diffuser' });

    const total = await publishVideosToProduct(s.shop, s.accessToken, productId, videos);
    delivery.set('shopifyPublishedAt', new Date());
    res.json({ message: `${videos.length} vidéo(s) ajoutée(s) à la fiche produit (${total} au total)`, total });
  } catch (error) {
    logger.error('Shopify publish failed:', error);
    res.status(502).json({ error: `Shopify : ${error.message}` });
  }
}
