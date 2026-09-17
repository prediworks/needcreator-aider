import express from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createProductBrief, getProductBrief, claimProductBrief } from '../controllers/productBriefs.js';

const router = express.Router();

// Brief depuis une URL produit : page publique sans compte, repris à l'inscription ou par une marque connectée
router.post('/', validate(Joi.object({
  url: Joi.string().uri({ scheme: ['http', 'https'] }).max(2000).required(),
  // Repli manuel quand la page ne peut pas être lue
  name: Joi.string().max(150).allow(''),
  brand: Joi.string().max(80).allow(''),
  description: Joi.string().min(40).max(3000).allow(''),
  price: Joi.number().min(0).allow(null, ''),
})), createProductBrief);
router.get('/:id', getProductBrief);
router.post('/:id/claim', authenticate, authorize('brand'), claimProductBrief);

export default router;
