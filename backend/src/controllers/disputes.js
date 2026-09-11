import Delivery from '../models/Delivery.js';
import Campaign from '../models/Campaign.js';
import User from '../models/User.js';
import { getSetting, SETTINGS, getMaxRevisions } from '../models/Setting.js';
import { capturePartial, cancelOrRefundPaymentIntent, transferToCreator, chargeIdOf } from '../services/stripe.js';
import { finalizeApproval } from './deliveries.js';
import { sendDisputeOpened, sendDisputeResponse, sendDisputeResolved } from '../services/email.js';
import { notifyAdmins } from '../services/adminAlerts.js';
import { notify } from '../services/notifications.js';
import { issueMissionInvoices, creditDeliveryInvoices } from '../services/invoices.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Litiges : la marque refuse définitivement une livraison quand les révisions prévues au devis sont épuisées.
 * La validation automatique est suspendue, l'admin tranche : paiement intégral, partage, ou remboursement intégral.
 */

const idOf = (v) => (v && v._id ? v._id : v)?.toString();
const populated = (q) => q.populate('campaignId', 'title').populate('brandId', 'email profile.companyName profile.name').populate('creatorId', 'email profile.name profile.stats stripeAccountId profile.stripeConnect');

async function allowedRevisions(delivery) {
  const max = await getMaxRevisions();
  const campaign = await Campaign.findById(idOf(delivery.campaignId)).select('applications.creatorId applications.quote.revisions').lean();
  const app = campaign?.applications?.find(a => idOf(a.creatorId) === idOf(delivery.creatorId));
  const quoted = app?.quote?.revisions;
  return Number.isFinite(quoted) ? Math.min(quoted, max) : max;
}

/** Marque : ouvre un litige (refus définitif) */
export async function openDispute(req, res) {
  try {
    const delivery = await populated(Delivery.findOne({ _id: req.params.deliveryId, brandId: req.user._id }));
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (delivery.status !== 'submitted') return res.status(400).json({ error: 'Un refus définitif ne peut porter que sur une livraison soumise.' });
    const allowed = await allowedRevisions(delivery);
    if ((delivery.revisions?.length || 0) < allowed) {
      return res.status(400).json({ error: `Demandez d'abord les révisions prévues au devis (${allowed - (delivery.revisions?.length || 0)} restante(s)) avant un refus définitif.`, code: 'REVISIONS_REMAINING' });
    }
    delivery.status = 'disputed';
    delivery.dispute = {
      status: 'open', openedAt: new Date(), reason: req.body.reason,
      autoApprovalDateBefore: delivery.autoApprovalDate || null,
    };
    delivery.autoApprovalDate = undefined;
    await delivery.save();

    const title = delivery.campaignId?.title || 'la mission';
    const brandName = delivery.brandId?.profile?.companyName || delivery.brandId?.profile?.name;
    sendDisputeOpened(delivery.creatorId.email, delivery.creatorId.profile?.name, brandName, title, req.body.reason, delivery._id).catch(() => {});
    notify(idOf(delivery.creatorId), { type: 'dispute', title: `Refus définitif demandé sur « ${title} »`, text: 'La marque a ouvert un litige. Vous pouvez répondre, notre équipe tranchera.', href: `/deliveries/${delivery._id}` }).catch(() => {});
    notifyAdmins(`Litige ouvert sur « ${title} »`, `<h1>Litige à trancher</h1><p>${brandName} refuse définitivement la livraison de ${delivery.creatorId.profile?.name} (${delivery.payment?.amount} €).</p><p>Motif : ${req.body.reason}</p><p><a href="${config.cors.origin}/admin?tab=disputes">Trancher le litige</a></p>`).catch(() => {});
    logger.info(`Dispute opened on delivery ${delivery._id} by brand ${req.user._id}`);
    res.json({ message: 'Litige ouvert : notre équipe va examiner la livraison et trancher.', delivery });
  } catch (error) {
    logger.error('openDispute failed:', error);
    res.status(500).json({ error: 'Failed to open dispute' });
  }
}

/** Créateur : répond au litige (une fois) */
export async function respondDispute(req, res) {
  try {
    const delivery = await populated(Delivery.findOne({ _id: req.params.deliveryId, creatorId: req.user._id }));
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (delivery.status !== 'disputed' || delivery.dispute?.status !== 'open') return res.status(400).json({ error: 'Aucun litige ouvert sur cette mission' });
    if (delivery.dispute.creatorResponse) return res.status(400).json({ error: 'Vous avez déjà répondu à ce litige' });
    delivery.dispute.creatorResponse = req.body.response;
    delivery.dispute.creatorRespondedAt = new Date();
    await delivery.save();
    const title = delivery.campaignId?.title || 'la mission';
    sendDisputeResponse(delivery.brandId.email, delivery.brandId.profile?.companyName || delivery.brandId.profile?.name, delivery.creatorId.profile?.name, title, req.body.response, delivery._id).catch(() => {});
    notify(idOf(delivery.brandId), { type: 'dispute', title: `Réponse du créateur sur « ${title} »`, text: 'Le créateur a répondu au litige. Notre équipe tranchera.', href: `/deliveries/${delivery._id}` }).catch(() => {});
    res.json({ message: 'Réponse enregistrée', delivery });
  } catch (error) {
    logger.error('respondDispute failed:', error);
    res.status(500).json({ error: 'Failed to respond to dispute' });
  }
}

/** Admin : litiges ouverts */
export async function listDisputes(req, res) {
  try {
    const status = req.query.status === 'resolved' ? 'resolved' : 'open';
    const deliveries = await populated(Delivery.find({ 'dispute.status': status }).sort({ 'dispute.openedAt': 1 }));
    const defaultPercent = await getSetting(SETTINGS.disputeCreatorSharePercent.key, SETTINGS.disputeCreatorSharePercent.default);
    res.json({ disputes: deliveries, defaultCreatorPercent: defaultPercent });
  } catch (error) {
    logger.error('listDisputes failed:', error);
    res.status(500).json({ error: 'Failed to list disputes' });
  }
}

/**
 * Admin : tranche le litige.
 *  approve      → paiement intégral au créateur (comme une validation)
 *  split        → la marque paie creatorPercent % du prix, le reste lui est rendu ; le créateur reçoit sa part nette de commission
 *  refund_full  → montant intégralement rendu à la marque, mission refusée, place libérée sur la campagne
 */
export async function resolveDispute(req, res) {
  try {
    const delivery = await populated(Delivery.findById(req.params.deliveryId));
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (delivery.status !== 'disputed' || delivery.dispute?.status !== 'open') return res.status(400).json({ error: 'Aucun litige ouvert sur cette livraison' });
    const { outcome, creatorPercent, note } = req.body;
    const title = delivery.campaignId?.title || 'la mission';
    const price = delivery.payment?.amount || 0;
    let paidAmount = price, refundedAmount = 0, warning = null;

    if (outcome === 'approve') {
      delivery.status = 'submitted'; // finalizeApproval attend une livraison soumise
      const r = await finalizeApproval(delivery, { isAuto: false });
      warning = r.warning;
    } else if (outcome === 'refund_full') {
      paidAmount = 0; refundedAmount = price;
      if (delivery.payment?.stripePaymentIntentId) {
        const r = await cancelOrRefundPaymentIntent(delivery.payment.stripePaymentIntentId);
        if (r.action !== 'none') delivery.payment.status = 'refunded';
      }
      delivery.status = 'rejected';
      delivery.rejection = { at: new Date(), reason: `Litige tranché : ${note}`, auto: false };
      await freeCampaignSlot(delivery);
      setImmediate(() => creditDeliveryInvoices(delivery._id, `Litige tranché : remboursement intégral (${note})`).catch(() => {}));
    } else {
      // split
      const pct = Math.max(0, Math.min(100, Number(creatorPercent)));
      paidAmount = Math.round(price * pct) / 100;
      refundedAmount = Math.round((price - paidAmount) * 100) / 100;
      const feePercent = delivery.payment?.platformFeePercent ?? config.stripe.platformFeePercent;
      const platformFee = Math.round(paidAmount * feePercent) / 100;
      const creatorAmount = Math.round((paidAmount - platformFee) * 100) / 100;
      let transferred = false;
      if (delivery.payment?.stripePaymentIntentId) {
        const pi = await capturePartial(delivery.payment.stripePaymentIntentId, paidAmount);
        const creator = delivery.creatorId;
        const accountId = creator?.profile?.stripeConnect?.payoutsEnabled ? (creator.profile.stripeConnect.accountId || creator.stripeAccountId) : null;
        if (paidAmount > 0 && creatorAmount > 0 && accountId) {
          try {
            const t = await transferToCreator(delivery.payment.stripePaymentIntentId, accountId, creatorAmount, pi.currency || 'eur', chargeIdOf(pi));
            delivery.payment.stripeTransferId = t?.id || null;
            transferred = true;
          } catch (err) {
            warning = `Montant encaissé, virement au créateur en échec : ${err.message}`;
          }
        } else if (paidAmount > 0 && creatorAmount > 0) {
          warning = 'Montant encaissé. Le virement sera effectué dès que le créateur aura connecté son compte Stripe.';
        }
      }
      delivery.payment.amount = paidAmount;
      delivery.payment.amountHT = Math.round(paidAmount / (1 + (delivery.payment.vatRate || 0) / 100) * 100) / 100;
      delivery.payment.vatAmount = Math.round((paidAmount - delivery.payment.amountHT) * 100) / 100;
      delivery.payment.platformFee = platformFee;
      delivery.payment.platformFeeHT = Math.round(platformFee / (1 + config.vat.rate / 100) * 100) / 100;
      delivery.payment.platformFeeVat = Math.round((platformFee - delivery.payment.platformFeeHT) * 100) / 100;
      delivery.payment.creatorAmount = creatorAmount;
      if (paidAmount > 0) {
        delivery.approve(false, transferred || creatorAmount <= 0);
      } else {
        delivery.status = 'rejected';
        delivery.payment.status = 'refunded';
        delivery.rejection = { at: new Date(), reason: `Litige tranché : ${note}`, auto: false };
        await freeCampaignSlot(delivery);
      }
    }

    delivery.dispute = {
      ...(delivery.dispute?.toObject?.() || delivery.dispute), status: 'resolved', resolvedAt: new Date(), resolvedBy: req.user._id,
      outcome, creatorPercent: outcome === 'split' ? Number(creatorPercent) : outcome === 'approve' ? 100 : 0, paidAmount, refundedAmount, note,
    };
    await delivery.save();
    if (outcome === 'split' && ['approved', 'auto_approved'].includes(delivery.status) && delivery.payment?.stripePaymentIntentId) setImmediate(() => issueMissionInvoices(delivery, { source: 'dispute' }).catch(() => {}));
    if (outcome === 'split' && ['approved', 'auto_approved'].includes(delivery.status)) {
      await User.updateOne({ _id: idOf(delivery.creatorId) }, { $inc: { 'profile.stats.completedJobs': 1 } }).catch(() => {});
    }

    const brandName = delivery.brandId?.profile?.companyName || delivery.brandId?.profile?.name;
    sendDisputeResolved(delivery.brandId.email, delivery.creatorId.email, brandName, delivery.creatorId.profile?.name, title, delivery.dispute, delivery._id).catch(() => {});
    const summary = outcome === 'approve' ? 'paiement intégral au créateur' : outcome === 'refund_full' ? 'remboursement intégral de la marque' : `partage : ${creatorPercent} % au créateur`;
    notify(idOf(delivery.brandId), { type: 'dispute', title: `Litige tranché sur « ${title} »`, text: summary, href: `/deliveries/${delivery._id}` }).catch(() => {});
    notify(idOf(delivery.creatorId), { type: 'dispute', title: `Litige tranché sur « ${title} »`, text: summary, href: `/deliveries/${delivery._id}` }).catch(() => {});
    logger.info(`Dispute resolved on ${delivery._id}: ${outcome} (${paidAmount} payé, ${refundedAmount} rendu)`);
    res.json({ message: `Litige tranché : ${summary}`, delivery, warning });
  } catch (error) {
    logger.error('resolveDispute failed:', error);
    res.status(500).json({ error: `Failed to resolve dispute: ${error?.raw?.message || error.message}` });
  }
}

/** Libère la place du créateur sur la campagne (mission refusée) */
async function freeCampaignSlot(delivery) {
  const campaign = await Campaign.findById(idOf(delivery.campaignId));
  if (!campaign) return;
  const creatorId = idOf(delivery.creatorId);
  campaign.selectedCreators = (campaign.selectedCreators || []).filter(id => idOf(id) !== creatorId);
  if (idOf(campaign.selectedCreator) === creatorId) campaign.selectedCreator = undefined;
  campaign.applications.forEach(a => { if (idOf(a.creatorId) === creatorId) a.status = 'rejected'; });
  if (campaign.status === 'in_progress') campaign.status = 'active';
  await campaign.save();
}
