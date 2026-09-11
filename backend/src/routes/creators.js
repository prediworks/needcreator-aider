import express from 'express';
import { creatorBySlug } from '../controllers/creatorTools.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { searchCreators, publicCreators } from '../controllers/creators.js';

const router = express.Router();

// Annuaire des créateurs (marques et admin)
router.get('/public', publicCreators); // site public, créateurs ayant donné leur accord
router.get('/slug/:slug', creatorBySlug); // kit média : /c/<slug>
router.get('/', authenticate, authorize('brand', 'admin'), searchCreators);

export default router;
