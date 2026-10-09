import express from 'express';
import Joi from 'joi';
import { optionalAuth, authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createScan, getScan, viewScan, briefFromScanHandler, optOutScan, recentScans, auditScan, myScans, trackRef, subscribeScan, unsubscribeScan } from '../controllers/adScans.js';

const router = express.Router();

// Scan concurrentiel : publicités Meta actives d'une marque, page publique sans compte ; un compte donne la lecture complète
router.get('/recent', recentScans);
router.get('/mine', authenticate, myScans);
router.post('/', optionalAuth, validate(Joi.object({ q: Joi.string().max(120).allow(''), pageId: Joi.string().pattern(/^\d{3,30}$/).allow(''), pageName: Joi.string().max(160).allow('') }).or('q', 'pageId')), createScan);
router.post('/ref', optionalAuth, validate(Joi.object({ ref: Joi.string().pattern(/^[a-f0-9]{24}$/i).required(), action: Joi.string().valid('visit', 'scan', 'audit', 'brief', 'rights').required(), slug: Joi.string().max(80).allow(''), source: Joi.string().valid('lead', 'quote').default('lead') })), trackRef); // lead : email marques ; quote : outils offerts avec un devis de créateur
router.post('/unsubscribe', validate(Joi.object({ token: Joi.string().hex().length(36).required() })), unsubscribeScan); // lien des emails de rapport
router.get('/:slug', optionalAuth, getScan);
router.post('/:slug/subscribe', optionalAuth, validate(Joi.object({ email: Joi.string().email().max(160).required(), role: Joi.string().valid('brand', 'creator', '').allow('') })), subscribeScan); // rapport par email + alertes
router.post('/:slug/view', viewScan);
router.post('/:slug/brief', optionalAuth, validate(Joi.object({ adId: Joi.string().max(40).allow(''), proposal: Joi.number().integer().min(0).max(2).allow(null, '') })), briefFromScanHandler);
router.post('/:slug/audit', optionalAuth, auditScan);
router.post('/:slug/opt-out', validate(Joi.object({ email: Joi.string().email().max(160).allow(''), reason: Joi.string().max(1000).allow('') })), optOutScan);

export default router;
