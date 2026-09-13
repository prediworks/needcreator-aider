import express from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.js';
import { listContents, createContent, updateContent, deleteContent, addUsage, removeUsage, requestRenewal, importContents, exportContents } from '../controllers/contents.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Registre « Contenus & droits » de la marque (équipe incluse : req.user = propriétaire)
router.get('/', authenticate, authorize('brand'), listContents);
router.get('/export', authenticate, authorize('brand'), exportContents);
router.post('/', authenticate, authorize('brand'), createContent);
router.post('/import', authenticate, authorize('brand'), upload.single('file'), importContents);
router.patch('/:id', authenticate, authorize('brand'), updateContent);
router.delete('/:id', authenticate, authorize('brand'), deleteContent);
router.post('/:id/usages', authenticate, authorize('brand'), addUsage);
router.delete('/:id/usages/:usageId', authenticate, authorize('brand'), removeUsage);
router.post('/:id/renew', authenticate, authorize('brand'), requestRenewal);

export default router;
