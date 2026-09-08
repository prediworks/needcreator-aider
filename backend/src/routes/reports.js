import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { createReport } from '../controllers/reports.js';

const router = express.Router();
router.post('/', authenticate, authorize('brand', 'creator'), validate(schemas.report), createReport);
export default router;
