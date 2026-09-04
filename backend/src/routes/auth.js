import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import {
  registerCreator,
  registerBrand,
  getProfile,
  updateProfile,
} from '../controllers/auth.js';

const router = express.Router();

// Registration
router.post('/register/creator', authenticate, validate(schemas.registerCreator), registerCreator);
router.post('/register/brand', authenticate, validate(schemas.registerBrand), registerBrand);

// Profile
router.get('/profile', authenticate, getProfile);
router.patch('/profile', authenticate, updateProfile);

export default router;
