import express from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import {
  createDelivery,
  uploadDeliverables,
  getDeliveryUploadUrl,
  registerDeliverables,
  submitDelivery,
  approveDelivery,
  requestRevision,
  getDeliveries,
  getDelivery,
  getPaymentIntent,
  confirmPayment,
  addLinks,
  removeItem,
  setLinkVisibility,
  updateShipping,
  updatePerformance,
  requestReadyPack,
  readyPackPaymentIntent,
  getContract,
  requestRightsExtension,
  proposeRightsExtension,
  declineRightsExtension,
  acceptRightsExtension,
  rightsExtensionPaymentIntent,
  confirmRightsExtension,
  confirmReadyPack,
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
// Envoi direct navigateur → R2 (sans limite de taille du proxy)
router.post('/:deliveryId/upload-url', authenticate, authorize('creator'), validate(schemas.uploadUrl), getDeliveryUploadUrl);
router.post('/:deliveryId/files', authenticate, authorize('creator'), validate(schemas.deliveryRegister), registerDeliverables);
router.post('/:deliveryId/links', authenticate, authorize('creator'), validate(schemas.deliveryLinks), addLinks);
router.delete('/:deliveryId/items/:itemId', authenticate, authorize('creator'), removeItem);
router.patch('/:deliveryId/links/:linkId/visibility', authenticate, validate(schemas.linkVisibility), setLinkVisibility);
router.post('/:deliveryId/ready-pack', authenticate, authorize('brand'), validate(schemas.readyPack), requestReadyPack);
router.get('/:deliveryId/ready-pack/payment-intent', authenticate, authorize('brand'), readyPackPaymentIntent);
router.post('/:deliveryId/ready-pack/confirm', authenticate, authorize('brand'), confirmReadyPack);
// Contrat et prolongation des droits
router.get('/:deliveryId/contract', authenticate, getContract);
router.post('/:deliveryId/rights-extension/request', authenticate, authorize('brand'), validate(schemas.rightsExtensionRequest), requestRightsExtension);
router.post('/:deliveryId/rights-extension/propose', authenticate, authorize('creator'), validate(schemas.rightsExtensionProposal), proposeRightsExtension);
router.post('/:deliveryId/rights-extension/decline', authenticate, declineRightsExtension);
router.post('/:deliveryId/rights-extension/accept', authenticate, authorize('brand'), acceptRightsExtension);
router.get('/:deliveryId/rights-extension/payment-intent', authenticate, authorize('brand'), rightsExtensionPaymentIntent);
router.post('/:deliveryId/rights-extension/confirm', authenticate, authorize('brand'), confirmRightsExtension);
router.patch('/:deliveryId/performance', authenticate, validate(schemas.performanceUpdate), updatePerformance);
router.patch('/:deliveryId/shipping', authenticate, validate(schemas.shippingUpdate), updateShipping);
router.post('/:deliveryId/submit', authenticate, authorize('creator'), submitDelivery);
router.post('/:deliveryId/approve', authenticate, authorize('brand'), approveDelivery);
router.get('/:deliveryId/payment-intent', authenticate, authorize('brand'), getPaymentIntent);
router.post('/:deliveryId/confirm-payment', authenticate, authorize('brand'), confirmPayment);
router.post('/:deliveryId/revision', authenticate, authorize('brand'), validate(schemas.requestRevision), requestRevision);

export default router;
