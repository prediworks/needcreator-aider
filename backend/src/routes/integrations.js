import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  shopifyStatus, shopifyInstall, shopifyCallback, shopifyDisconnect, shopifyProducts, shopifyPublishDelivery,
} from '../controllers/integrations.js';

const router = express.Router();

// Retour OAuth (appelé par Shopify, sans jeton)
router.get('/shopify/callback', shopifyCallback);

// Le reste est réservé aux marques
router.get('/shopify/status', authenticate, authorize('brand'), shopifyStatus);
router.get('/shopify/install', authenticate, authorize('brand'), shopifyInstall);
router.post('/shopify/install', authenticate, authorize('brand'), shopifyInstall);
router.delete('/shopify', authenticate, authorize('brand'), shopifyDisconnect);
router.get('/shopify/products', authenticate, authorize('brand'), shopifyProducts);
router.post('/shopify/deliveries/:deliveryId/publish', authenticate, authorize('brand'), shopifyPublishDelivery);

export default router;
