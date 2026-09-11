import express from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  listExternalCreators, getExternalCreator, optoutExternalCreator, inviteExternalCreator,
  adminImportExternalCreators, adminExternalCreatorsStats, adminDeleteExternalCreator, adminExportExternalCreators, adminImportUnsubscribes,
} from '../controllers/externalCreators.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Public (site) et marques
router.get('/', listExternalCreators);
router.get('/:slug', getExternalCreator);
router.post('/:slug/optout', optoutExternalCreator);
router.post('/:id/invite', authenticate, authorize('brand'), inviteExternalCreator);

// Admin
router.get('/admin/stats', authenticate, authorize('admin'), adminExternalCreatorsStats);
router.get('/admin/export', authenticate, authorize('admin'), adminExportExternalCreators);
router.post('/admin/unsubscribes', authenticate, authorize('admin'), upload.single('file'), adminImportUnsubscribes);
router.post('/admin/import', authenticate, authorize('admin'), upload.single('file'), adminImportExternalCreators);
router.delete('/admin/:id', authenticate, authorize('admin'), adminDeleteExternalCreator);

export default router;
