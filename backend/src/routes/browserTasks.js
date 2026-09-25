import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize } from '../middleware/auth.js';
import { extensionAuth, nextTask, taskResult, extensionStatus, tokenView, tokenRotate, createBatchView, listBatchesView, batchDetailView, cancelBatchView } from '../controllers/browserTasks.js';

/**
 * File de tâches de l'extension Chrome de prospection. Deux entrées, volontairement séparées du reste :
 * - /api/browser-tasks/ext/*  : l'extension, jeton dédié (X-Extension-Token)
 * - /api/browser-tasks/*      : l'admin connecté (lots, jeton)
 */
const router = express.Router();

const extLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de requêtes' } });
router.get('/ext/status', extLimiter, extensionAuth, extensionStatus);
router.get('/ext/next', extLimiter, extensionAuth, nextTask);
router.post('/ext/:id/result', extLimiter, extensionAuth, taskResult);

router.use(authenticate, authorize('admin'));
router.get('/token', tokenView);
router.post('/token', tokenRotate);
router.get('/batches', listBatchesView);
router.post('/batches', createBatchView);
router.get('/batches/:id', batchDetailView);
router.post('/batches/:id/cancel', cancelBatchView);

export default router;
