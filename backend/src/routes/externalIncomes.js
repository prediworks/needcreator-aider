import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { listExternalIncomes, createExternalIncome, deleteExternalIncome } from '../controllers/externalIncomes.js';

const router = express.Router();
router.use(authenticate, authorize('creator'));
router.get('/', listExternalIncomes);
router.post('/', createExternalIncome);
router.delete('/:id', deleteExternalIncome);
export default router;
