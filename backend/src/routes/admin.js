import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getDashboardStats,
  getPendingCreators,
  approveCreator,
  rejectCreator,
  getUsers,
  suspendUser,
  reactivateUser,
  resetStripeConnect,
  runJobs,
  getAdminCampaigns,
  getAdminDeliveries,
  getUserDetail,
  getPendingAmbassadors,
  reviewAmbassador,
  getPendingBusinesses,
  reviewBusiness,
  getSettings,
  updateSetting,
} from '../controllers/admin.js';
import { listReports, resolveReport } from '../controllers/reports.js';

const router = express.Router();

// All admin routes require admin role
router.use(authenticate, authorize('admin'));

// Dashboard
router.get('/stats', getDashboardStats);

// Creator approval
router.get('/creators/pending', getPendingCreators);
router.post('/creators/:userId/approve', approveCreator);
router.post('/creators/:userId/reject', rejectCreator);

// User management
router.get('/users', getUsers);
router.get('/users/:userId', getUserDetail);
router.post('/users/:userId/suspend', suspendUser);
router.post('/users/:userId/reactivate', reactivateUser);
router.post('/users/:userId/stripe-connect/reset', resetStripeConnect);

// Ambassadeurs
router.get('/ambassadors/pending', getPendingAmbassadors);
router.post('/ambassadors/:userId/approve', reviewAmbassador);
router.post('/ambassadors/:userId/reject', reviewAmbassador);

// Réglages
router.get('/settings', getSettings);
router.put('/settings/:key', updateSetting);

// Vérification des entreprises (marques)
router.get('/businesses/pending', getPendingBusinesses);
router.post('/businesses/:userId/approve', reviewBusiness);
router.post('/businesses/:userId/reject', reviewBusiness);

// Signalements
router.get('/reports', listReports);
router.post('/reports/:reportId/resolve', resolveReport);

// Supervision
router.get('/campaigns', getAdminCampaigns);
router.get('/deliveries', getAdminDeliveries);

// Lance manuellement les tâches planifiées (auto-approbation, rappels) — utile pour tester
router.post('/jobs/run', runJobs);

export default router;
