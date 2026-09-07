import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { searchCreators } from '../controllers/creators.js';

const router = express.Router();

// Annuaire des créateurs (marques et admin)
router.get('/', authenticate, authorize('brand', 'admin'), searchCreators);

export default router;
