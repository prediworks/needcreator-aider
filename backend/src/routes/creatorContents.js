import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { listCreatorContents, createCreatorContent, updateCreatorContent, deleteCreatorContent, proposeRenewal } from '../controllers/creatorContents.js';

const router = express.Router();
router.use(authenticate, authorize('creator'));
router.get('/', listCreatorContents);
router.post('/', createCreatorContent);
router.patch('/:id', updateCreatorContent);
router.delete('/:id', deleteCreatorContent);
router.post('/:id/renew', proposeRenewal);
export default router;
