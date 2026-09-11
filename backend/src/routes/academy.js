import express from 'express';
import { listAcademy } from '../controllers/creatorTools.js';

const router = express.Router();
router.get('/', listAcademy); // guides + quiz (sans les réponses), public

export default router;
