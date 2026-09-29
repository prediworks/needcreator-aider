import express from 'express';
import multer from 'multer';
import { authenticate, authorize, requireVerifiedEmail } from '../middleware/auth.js';
import { listShowcaseBrands, createShowcase, listMyShowcases, withdrawShowcase, getShowcaseUploadUrl } from '../controllers/showcase.js';
import { validate, schemas } from '../middleware/validate.js';

/** Vidéos vitrine (côté créateur) : marques à filmer, dépôt, liste, retrait */
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 }, fileFilter: (req, file, cb) => (/^video\//.test(file.mimetype) ? cb(null, true) : cb(new Error('Seuls les fichiers vidéo sont acceptés'))) });

router.use(authenticate, authorize('creator'));
router.get('/brands', listShowcaseBrands);
router.get('/', listMyShowcases);
router.post('/upload-url', requireVerifiedEmail, validate(schemas.uploadUrl), getShowcaseUploadUrl); // envoi direct navigateur → stockage
router.post('/', requireVerifiedEmail, upload.single('video'), createShowcase);
router.post('/:id/withdraw', withdrawShowcase);

export default router;
