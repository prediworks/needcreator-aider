import express from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import {
  createDelivery,
  uploadDeliverables,
  submitDelivery,
  approveDelivery,
  requestRevision,
  getDeliveries,
  getDelivery,
  getPaymentIntent,
  confirmPayment,
} from '../controllers/deliveries.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
});

// Delivery CRUD
router.post('/campaign/:campaignId', authenticate, authorize('brand'), createDelivery);
router.get('/', authenticate, getDeliveries);
router.get('/:deliveryId', authenticate, getDelivery);

// Delivery actions
router.post('/:deliveryId/upload', authenticate, authorize('creator'), upload.array('files', 10), uploadDeliverables);
router.post('/:deliveryId/submit', authenticate, authorize('creator'), submitDelivery);
router.post('/:deliveryId/approve', authenticate, authorize('brand'), approveDelivery);
router.get('/:deliveryId/payment-intent', authenticate, authorize('brand'), getPaymentIntent);
router.post('/:deliveryId/confirm-payment', authenticate, authorize('brand'), confirmPayment);
router.post('/:deliveryId/revision', authenticate, authorize('brand'), validate(schemas.requestRevision), requestRevision);

export default router;
