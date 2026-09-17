import express from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createProductBrief, getProductBrief, claimProductBrief } from '../controllers/productBriefs.js';

const router = express.Router();

// Brief depuis une URL produit : page publique sans compte, repris à l'inscription ou par une marque connectée
router.post('/', validate(Joi.object({ url: Joi.string().uri({ scheme: ['http', 'https'] }).max(2000).required() })), createProductBrief);
router.get('/:id', getProductBrief);
router.post('/:id/claim', authenticate, authorize('brand'), claimProductBrief);

export default router;
