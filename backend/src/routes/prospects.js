import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { listProspects, createProspect, updateProspect, deleteProspect } from '../controllers/prospects.js';

const router = express.Router();
router.use(authenticate, authorize('creator'));
router.get('/', listProspects);
router.post('/', createProspect);
router.patch('/:id', updateProspect);
router.delete('/:id', deleteProspect);
export default router;
