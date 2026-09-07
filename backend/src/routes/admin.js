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
  runJobs,
  getAdminCampaigns,
  getAdminDeliveries,
  getUserDetail,
  getPendingAmbassadors,
  reviewAmbassador,
} from '../controllers/admin.js';

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

// Ambassadeurs
router.get('/ambassadors/pending', getPendingAmbassadors);
router.post('/ambassadors/:userId/approve', reviewAmbassador);
router.post('/ambassadors/:userId/reject', reviewAmbassador);

// Supervision
router.get('/campaigns', getAdminCampaigns);
router.get('/deliveries', getAdminDeliveries);

// Lance manuellement les tâches planifiées (auto-approbation, rappels) — utile pour tester
router.post('/jobs/run', runJobs);

export default router;
