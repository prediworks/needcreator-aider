import express from 'express';
import Joi from 'joi';
import { optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createScan, getScan, viewScan, briefFromScanHandler, optOutScan, recentScans } from '../controllers/adScans.js';

const router = express.Router();

// Scan concurrentiel : publicités Meta actives d'une marque, page publique sans compte ; un compte donne la lecture complète
router.get('/recent', recentScans);
router.post('/', optionalAuth, validate(Joi.object({ q: Joi.string().max(120).allow(''), pageId: Joi.string().pattern(/^\d{3,30}$/).allow(''), pageName: Joi.string().max(160).allow('') }).or('q', 'pageId')), createScan);
router.get('/:slug', optionalAuth, getScan);
router.post('/:slug/view', viewScan);
router.post('/:slug/brief', optionalAuth, validate(Joi.object({ adId: Joi.string().max(40).allow('') })), briefFromScanHandler);
router.post('/:slug/opt-out', validate(Joi.object({ email: Joi.string().email().max(160).allow(''), reason: Joi.string().max(1000).allow('') })), optOutScan);

export default router;
