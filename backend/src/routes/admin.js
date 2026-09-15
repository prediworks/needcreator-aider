import express from 'express';
import { previewSeed, runSeed, listSeedBatches, deleteSeedBatch } from '../controllers/seed.js';
import { acquisitionOverview, acquisitionDashboard, mailingStatus, pushLeadsNow, syncMailingNow, replyToLead, reclassifyReply, listLeads, updateLead, bulkUpdateLeads, deleteLead, createLead, requalifyLead, startAcquisitionRun, exportLeadsCsv, importLeadsToDirectory } from '../controllers/acquisition.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getDashboardStats,
  getPendingCreators,
  approveCreator,
  rejectCreator,
  getUsers,
  suspendUser,
  reactivateUser,
  markEmailVerified,
  resetStripeConnect,
  purgeUserActivity,
  hardDeleteUser,
  runJobs,
  listBackupsAdmin,
  runBackupAdmin,
  restoreBackupAdmin,
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
import { listDisputes, resolveDispute } from '../controllers/disputes.js';
import { validate, schemas } from '../middleware/validate.js';

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
router.post('/users/:userId/verify-email', markEmailVerified); // adresse confirmée sans passer par l'email
router.post('/users/:userId/stripe-connect/reset', resetStripeConnect);
router.post('/users/:userId/purge', purgeUserActivity); // temporaire, voir ADMIN_PURGE_ENABLED
router.delete('/users/:userId/hard', hardDeleteUser); // temporaire, voir ADMIN_PURGE_ENABLED

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
router.get('/invoices', async (req, res) => {
  const { Invoice } = await import('../services/invoices.js');
  const q = req.query.deliveryId ? { deliveryId: req.query.deliveryId } : {};
  const invoices = await Invoice.find(q).sort({ issuedAt: -1 }).limit(parseInt(req.query.limit) || 200).populate('campaignId', 'title').populate('brandId', 'email profile.companyName').populate('creatorId', 'email profile.name').lean();
  res.json({ invoices });
});
router.post('/invoices/:id/credit', async (req, res) => {
  try {
    const { issueCreditNote } = await import('../services/invoices.js');
    const credit = await issueCreditNote(req.params.id, { reason: String(req.body?.reason || '').slice(0, 300), userId: req.user._id });
    res.json({ message: `Avoir ${credit.number} émis`, credit });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
router.get('/disputes', listDisputes);
router.post('/disputes/:deliveryId/resolve', validate(schemas.resolveDispute), resolveDispute);
router.get('/reports', listReports);
router.post('/reports/:reportId/resolve', resolveReport);

// Supervision
router.get('/campaigns', getAdminCampaigns);
router.get('/deliveries', getAdminDeliveries);

// Lance manuellement les tâches planifiées (auto-approbation, rappels) — utile pour tester
router.post('/jobs/run', runJobs);
router.get('/backups', listBackupsAdmin);
// Amorçage : marques et campagnes en masse
router.post('/seed/preview', previewSeed);
router.post('/seed/run', runSeed);

// Agents de prospection : prospects créateurs et marques (sourcing nocturne, qualification IA, export mailing)
router.get('/acquisition', acquisitionOverview);
router.get('/acquisition/dashboard', acquisitionDashboard);
router.get('/acquisition/mailing', mailingStatus);
router.post('/acquisition/leads/:id/reply', replyToLead);
router.post('/acquisition/leads/:id/reclassify', reclassifyReply);
router.post('/acquisition/mailing/push', pushLeadsNow);
router.post('/acquisition/mailing/sync', syncMailingNow);
router.get('/acquisition/leads', listLeads);
router.post('/acquisition/leads', createLead);
router.patch('/acquisition/leads/bulk', bulkUpdateLeads);
router.patch('/acquisition/leads/:id', updateLead);
router.post('/acquisition/leads/:id/requalify', requalifyLead);
router.delete('/acquisition/leads/:id', deleteLead);
router.post('/acquisition/run', startAcquisitionRun);
router.get('/acquisition/export.csv', exportLeadsCsv);
router.post('/acquisition/import-directory', importLeadsToDirectory);
router.get('/seed/batches', listSeedBatches);
router.delete('/seed/batches/:batch', deleteSeedBatch);
router.post('/backups/run', runBackupAdmin);
router.post('/backups/:name/restore', restoreBackupAdmin); // confirmation « RESTAURER »

export default router;
