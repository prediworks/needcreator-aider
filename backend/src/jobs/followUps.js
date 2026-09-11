import Delivery from '../models/Delivery.js';
import Campaign from '../models/Campaign.js';
import User from '../models/User.js';
import { getSetting, SETTINGS } from '../models/Setting.js';
import { cancelOrRefundPaymentIntent } from '../services/stripe.js';
import {
  sendQuotesAwaitingReminder, sendCreatorNoUploadReminder, sendProductReceivedCheck,
  sendRevisionPendingReminder, sendAutoRejected,
} from '../services/email.js';
import logger from '../utils/logger.js';
import { notify } from '../services/notifications.js';

/**
 * Relances automatiques et refus définitif automatique.
 * Tous les délais sont des réglages admin (Administration → Réglages) ; 0 = désactivé.
 * Chaque relance n'est envoyée qu'une fois par élément.
 */

const DAY = 86400000;
const idOf = (v) => (v && v._id ? v._id : v)?.toString();
const setting = (name) => getSetting(SETTINGS[name].key, SETTINGS[name].default);
const itemCount = (d) => (d.files || []).filter(f => !f.superseded).length + (d.links || []).filter(l => !l.superseded).length;
// Un email refusé (adresse invalide…) ne doit ni bloquer la relance ni la faire répéter à chaque exécution
const safeSend = (label, id) => (err) => logger.warn(`${label} non envoyée pour ${id}: ${err?.message || err}`);
const lastRevisionAt = (d) => d.revisions?.length ? new Date(d.revisions[d.revisions.length - 1].requestedAt) : null;

/** Marque : devis en attente depuis N jours (un email par campagne) */
export async function remindBrandsOnPendingQuotes() {
  const days = await setting('reminderQuoteNoAnswerDays');
  if (!days) return 0;
  const before = new Date(Date.now() - days * DAY);
  const campaigns = await Campaign.find({
    status: 'active',
    applications: { $elemMatch: { status: 'pending', appliedAt: { $lte: before }, reminderSentAt: null } },
  }).populate('brandId', 'email profile.companyName profile.name');
  let sent = 0;
  for (const campaign of campaigns) {
    const due = campaign.applications.filter(a => a.status === 'pending' && new Date(a.appliedAt) <= before && !a.reminderSentAt);
    if (!due.length || !campaign.brandId?.email) continue;
    try {
      await sendQuotesAwaitingReminder(campaign.brandId.email, campaign.brandId.profile?.companyName || campaign.brandId.profile?.name, campaign.title, due.length, campaign._id, days).catch(safeSend('Relance devis', campaign._id));
      notify(campaign.brandId._id, { type: 'reminder', title: `${due.length} devis attend${due.length > 1 ? 'ent' : ''} votre réponse`, text: campaign.title, href: `/campaigns/${campaign._id}` }).catch(() => {});
      const now = new Date();
      due.forEach(a => { a.reminderSentAt = now; });
      await campaign.save();
      sent++;
    } catch (err) {
      logger.error(`Quote reminder failed for campaign ${campaign._id}:`, err.message);
    }
  }
  return sent;
}

/** Créateur : sélectionné, aucune vidéo envoyée N jours après le départ (sélection ou réception du produit) */
export async function remindCreatorsWithoutUpload() {
  const days = await setting('reminderCreatorNoUploadDays');
  if (!days) return 0;
  const before = new Date(Date.now() - days * DAY);
  const deliveries = await Delivery.find({ status: 'pending', 'reminders.noUploadAt': null, createdAt: { $lte: before } })
    .populate('campaignId', 'title').populate('creatorId', 'email profile.name');
  let sent = 0;
  for (const d of deliveries) {
    if (itemCount(d) > 0 || !d.creatorId?.email) continue;
    // Produit à expédier : on attend la réception avant de compter
    if (d.shipping?.required) {
      if (d.shipping.status !== 'received' || !d.shipping.receivedAt || new Date(d.shipping.receivedAt) > before) continue;
    }
    try {
      await sendCreatorNoUploadReminder(d.creatorId.email, d.creatorId.profile?.name, d.campaignId?.title, d._id, d.productionDeadline).catch(safeSend('Relance mission sans vidéo', d._id));
      notify(d.creatorId._id, { type: 'reminder', title: 'Aucune vidéo envoyée sur votre mission', text: d.campaignId?.title, href: `/deliveries/${d._id}` }).catch(() => {});
      d.reminders = { ...(d.reminders?.toObject?.() || d.reminders || {}), noUploadAt: new Date() };
      await d.save();
      sent++;
    } catch (err) {
      logger.error(`No-upload reminder failed for delivery ${d._id}:`, err.message);
    }
  }
  return sent;
}

/** Créateur : produit expédié depuis N jours, réception non confirmée */
export async function remindCreatorsProductNotReceived() {
  const days = await setting('reminderProductNotReceivedDays');
  if (!days) return 0;
  const before = new Date(Date.now() - days * DAY);
  const deliveries = await Delivery.find({ status: 'pending', 'shipping.status': 'shipped', 'shipping.shippedAt': { $lte: before }, 'reminders.productReceivedAt': null })
    .populate('campaignId', 'title').populate('creatorId', 'email profile.name').populate('brandId', 'profile.companyName profile.name');
  let sent = 0;
  for (const d of deliveries) {
    if (!d.creatorId?.email) continue;
    try {
      await sendProductReceivedCheck(d.creatorId.email, d.creatorId.profile?.name, d.campaignId?.title, d.brandId?.profile?.companyName || d.brandId?.profile?.name, d._id, d.shipping.shippedAt).catch(safeSend('Relance produit non confirmé', d._id));
      notify(d.creatorId._id, { type: 'reminder', title: 'Avez-vous reçu le produit ?', text: d.campaignId?.title, href: `/deliveries/${d._id}` }).catch(() => {});
      d.reminders = { ...(d.reminders?.toObject?.() || d.reminders || {}), productReceivedAt: new Date() };
      await d.save();
      sent++;
    } catch (err) {
      logger.error(`Product-received reminder failed for delivery ${d._id}:`, err.message);
    }
  }
  return sent;
}

/** Créateur : révision demandée depuis N jours sans nouvelle version */
export async function remindCreatorsRevisionPending() {
  const days = await setting('reminderRevisionPendingDays');
  if (!days) return 0;
  const autoDays = await setting('autoRejectAfterRevisionDays');
  const before = new Date(Date.now() - days * DAY);
  const deliveries = await Delivery.find({ status: 'revision_requested', 'reminders.revisionAt': null })
    .populate('campaignId', 'title').populate('creatorId', 'email profile.name');
  let sent = 0;
  for (const d of deliveries) {
    const at = lastRevisionAt(d);
    if (!at || at > before || !d.creatorId?.email) continue;
    try {
      const autoRejectAt = autoDays ? new Date(at.getTime() + autoDays * DAY) : null;
      await sendRevisionPendingReminder(d.creatorId.email, d.creatorId.profile?.name, d.campaignId?.title, d._id, autoRejectAt).catch(safeSend('Relance révision', d._id));
      notify(d.creatorId._id, { type: 'reminder', title: 'Révision en attente de votre nouvelle version', text: d.campaignId?.title, href: `/deliveries/${d._id}` }).catch(() => {});
      d.reminders = { ...(d.reminders?.toObject?.() || d.reminders || {}), revisionAt: new Date() };
      await d.save();
      sent++;
    } catch (err) {
      logger.error(`Revision reminder failed for delivery ${d._id}:`, err.message);
    }
  }
  return sent;
}

/**
 * Refus définitif automatique : silence du créateur N jours après une demande de révision.
 * Montant bloqué libéré (ou remboursé), mission refusée, place libérée sur la campagne, les deux parties prévenues.
 */
export async function processAutoRejections() {
  const days = await setting('autoRejectAfterRevisionDays');
  if (!days) return 0;
  const before = new Date(Date.now() - days * DAY);
  const deliveries = await Delivery.find({ status: 'revision_requested' })
    .populate('campaignId', 'title').populate('creatorId', 'email profile.name').populate('brandId', 'email profile.companyName profile.name');
  let done = 0;
  for (const d of deliveries) {
    const at = lastRevisionAt(d);
    if (!at || at > before) continue;
    try {
      let paymentNote = 'aucun paiement associé';
      if (d.payment?.stripePaymentIntentId) {
        const r = await cancelOrRefundPaymentIntent(d.payment.stripePaymentIntentId);
        paymentNote = r.action === 'canceled' ? 'montant bloqué libéré' : r.action === 'refunded' ? 'montant remboursé' : `paiement ${r.status}`;
        if (r.action !== 'none') d.payment.status = 'refunded';
      }
      d.status = 'rejected';
      d.rejection = { at: new Date(), reason: `Aucune nouvelle version ${days} jours après la demande de révision`, auto: true };
      await d.save();

      const campaign = await Campaign.findById(idOf(d.campaignId));
      if (campaign) {
        const creatorId = idOf(d.creatorId);
        campaign.selectedCreators = (campaign.selectedCreators || []).filter(id => idOf(id) !== creatorId);
        if (idOf(campaign.selectedCreator) === creatorId) campaign.selectedCreator = undefined;
        campaign.applications.forEach(a => { if (idOf(a.creatorId) === creatorId) a.status = 'rejected'; });
        if (campaign.status === 'in_progress') campaign.status = 'active'; // un poste se libère
        await campaign.save();
      }
      await User.updateOne({ _id: idOf(d.creatorId) }, { $inc: { 'profile.stats.lateDeliveries': 1 } });
      await sendAutoRejected(d.brandId?.email, d.creatorId?.email, d.brandId?.profile?.companyName || d.brandId?.profile?.name, d.creatorId?.profile?.name, d.campaignId?.title, days, d._id, idOf(d.campaignId), paymentNote)
        .catch(err => logger.error('Auto-rejection emails failed:', err.message));
      notify(d.brandId?._id, { type: 'dispute', title: 'Mission refusée définitivement (créateur silencieux)', text: d.campaignId?.title, href: `/campaigns/${idOf(d.campaignId)}` }).catch(() => {});
      notify(d.creatorId?._id, { type: 'dispute', title: 'Mission refusée : aucune nouvelle version', text: d.campaignId?.title, href: `/deliveries/${d._id}` }).catch(() => {});
      logger.info(`Auto-rejected delivery ${d._id} (${paymentNote})`);
      done++;
    } catch (err) {
      logger.error(`Auto-rejection failed for delivery ${d._id}:`, err.message);
    }
  }
  return done;
}

export async function runFollowUps() {
  const [quotes, noUpload, product, revision, autoRejected] = await Promise.all([
    remindBrandsOnPendingQuotes().catch(e => { logger.error('remindBrandsOnPendingQuotes:', e); return 0; }),
    remindCreatorsWithoutUpload().catch(e => { logger.error('remindCreatorsWithoutUpload:', e); return 0; }),
    remindCreatorsProductNotReceived().catch(e => { logger.error('remindCreatorsProductNotReceived:', e); return 0; }),
    remindCreatorsRevisionPending().catch(e => { logger.error('remindCreatorsRevisionPending:', e); return 0; }),
    processAutoRejections().catch(e => { logger.error('processAutoRejections:', e); return 0; }),
  ]);
  return { quotes, noUpload, product, revision, autoRejected };
}
