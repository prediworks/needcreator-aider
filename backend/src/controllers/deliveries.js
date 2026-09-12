import Delivery from '../models/Delivery.js';
import Campaign from '../models/Campaign.js';
import Review from '../models/Review.js';
import User from '../models/User.js';
import { config } from '../config/index.js';
import { getMaxRevisions, getSetting, SETTINGS } from '../models/Setting.js';
import { notify } from '../services/notifications.js';
import { issueMissionInvoices, issuePlatformInvoice, issueCreatorInvoices } from '../services/invoices.js';
import { createPaymentIntent, confirmWithTestCard, captureAndTransfer, retrievePaymentIntent, transferToCreator, cancelOrRefundPaymentIntent } from '../services/stripe.js';
import { runComplianceCheck } from '../services/compliance.js';
import { levelFor } from '../utils/badges.js';
import { attachContract, generateAddendumPdf, contractNumber } from '../services/contract.js';
import { rightsDurationMonths, addMonths } from '../models/Delivery.js';
import { uploadMultipleFiles, resolveUrlsIn, createUploadUrl, statObject, keyFromUrl, resolveUrl, uploadFile } from '../services/storage.js';
import {
  sendDeliverySubmitted,
  sendDeliveryApproved,
  sendRevisionRequested,
  sendProductShipped,
  sendProductReceived,
  sendContractGenerated,
  sendExtensionRequested,
  sendExtensionProposed,
  sendExtensionPaid,
  sendMissionWithdrawn,
  sendApplicationAccepted,
  sendBecomeAmbassador,
  sendShareAfterMission,
} from '../services/email.js';
import { updateBrandStats } from '../utils/brandStats.js';
import logger from '../utils/logger.js';

const idOf = (c) => (c && c._id ? c._id : c)?.toString();

function platformFromUrl(url = '') {
  const u = url.toLowerCase();
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('linkedin.com')) return 'linkedin';
  if (u.includes('facebook.com') || u.includes('fb.watch')) return 'facebook';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'x';
  if (u.includes('drive.google') || u.includes('dropbox') || u.includes('wetransfer')) return 'drive';
  return 'other';
}

/**
 * Révisions autorisées sur une mission : le nombre prévu au devis du créateur, plafonné par le réglage admin
 */
async function allowedRevisionsFor(delivery) {
  const max = await getMaxRevisions();
  const campaign = await Campaign.findById(idOf(delivery.campaignId)).select('applications.creatorId applications.quote.revisions').lean();
  const app = campaign?.applications?.find(a => idOf(a.creatorId) === idOf(delivery.creatorId));
  const quoted = app?.quote?.revisions;
  return Number.isFinite(quoted) ? Math.min(quoted, max) : max;
}

function itemCount(delivery) {
  const current = (arr) => (arr || []).filter(i => !i.superseded).length;
  return current(delivery.files) + current(delivery.links);
}

function fileTypeFromMime(mimetype = '') {
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('image/')) return 'image';
  return 'document';
}

/**
 * Crée la livraison d'une campagne + autorisation de paiement Stripe.
 * Utilisé par selectCreator et par la route POST /deliveries/campaign/:id
 */
export async function createDeliveryForCampaign(campaign, brand, price, forCreatorId = null) {
  const creatorId = forCreatorId ? String(forCreatorId) : idOf(campaign.selectedCreator);
  if (!creatorId) throw new Error('Aucun créateur sélectionné');

  const existing = await Delivery.findOne({ campaignId: campaign._id, creatorId });
  if (existing) return { delivery: existing, warning: null };

  const application = campaign.applications.find(app => idOf(app.creatorId) === creatorId);
  const isGifting = campaign.type === 'gifting';
  const creatorDoc = await User.findById(creatorId).select('email profile.address profile.name profile.ambassador.status legalInfo');
  const round2 = (n) => Math.round(n * 100) / 100;
  // Gifting : la marque paie uniquement les frais de service (HT + TVA), le créateur reçoit le produit
  const giftingFeeHT = isGifting ? round2(config.gifting.feePerVideo * (campaign.brief?.deliverables || 1)) : 0;
  const amount = isGifting
    ? round2(giftingFeeHT * (1 + config.vat.rate / 100))
    : (price ?? application?.price ?? campaign.budget?.total);
  // TVA du créateur : figée au devis, sinon statut actuel du profil
  const vatRate = application?.quote?.vatRate ?? (creatorDoc?.legalInfo?.vatRegistered ? config.vat.rate : 0);
  const days = application?.estimatedDeliveryDays || 7;
  const delivery = new Delivery({
    campaignId: campaign._id,
    creatorId,
    brandId: brand._id,
    payment: { amount, currency: 'EUR' },
    status: 'pending',
    estimatedDeliveryDays: days,
    shipping: campaign.brief?.productShipping
      ? { required: true, status: 'pending', address: creatorDoc?.profile?.address || {} }
      : { required: false, status: 'none' },
    // Sans envoi de produit, le délai court dès la sélection
    productionDeadline: campaign.brief?.productShipping ? null : new Date(Date.now() + days * 86400000),
  });
  if (isGifting) {
    delivery.payment.platformFeePercent = 100;
    delivery.payment.quotePrice = 0;
    delivery.payment.vatRate = config.vat.rate;
    delivery.payment.amountHT = giftingFeeHT;
    delivery.payment.vatAmount = round2(amount - giftingFeeHT);
    delivery.payment.platformFee = amount;
    delivery.payment.platformFeeHT = giftingFeeHT;
    delivery.payment.platformFeeVat = round2(amount - giftingFeeHT);
    delivery.payment.creatorAmount = 0;
  } else {
    // Ambassadeur : commission réduite (réglage admin) si elle est plus basse que celle de la campagne
    let feePercent = campaign.platformFeePercent ?? config.stripe.platformFeePercent;
    if (creatorDoc?.profile?.ambassador?.status === 'approved') {
      const ambassadorFee = await getSetting(SETTINGS.ambassadorFeePercent.key, SETTINGS.ambassadorFeePercent.default);
      feePercent = Math.min(feePercent, ambassadorFee);
    }
    delivery.calculatePaymentAmounts(feePercent, campaign.brandDiscountPercent || 0, vatRate);
  }

  let warning = null;
  let clientSecret = null;

  if (!brand.stripeCustomerId) {
    warning = 'La marque n\'a pas de moyen de paiement Stripe configuré.';
  } else {
    try {
      const paymentIntent = await createPaymentIntent(
        delivery.payment.amount,
        delivery.payment.currency,
        brand.stripeCustomerId,
        { campaignId: campaign._id.toString(), deliveryId: delivery._id.toString() }
      );
      delivery.payment.stripePaymentIntentId = paymentIntent.id;
      clientSecret = paymentIntent.client_secret;

      if (config.business.autoConfirmTestPayments) {
        // Mode test : on confirme avec une carte de test pour bloquer le montant
        const confirmed = await confirmWithTestCard(paymentIntent.id);
        if (confirmed.status === 'requires_capture') {
          delivery.payment.status = 'held';
          delivery.payment.heldAt = new Date();
        } else {
          warning = `Paiement en statut ${confirmed.status}`;
        }
      } else {
        // La marque confirme le paiement avec l'écran Stripe (Payment Element) sur la page de livraison
        delivery.payment.status = 'pending';
      }
    } catch (err) {
      logger.error('Stripe payment intent failed:', err.message);
      warning = `Le paiement n'a pas pu être initialisé : ${err?.raw?.message || err.message}`;
    }
  }

  // Contrat de mission et cession de droits (photographie du devis et des parties)
  try {
    await attachContract(delivery, { campaign, application, brand, creator: creatorDoc });
  } catch (err) {
    logger.error('Contract generation failed:', err);
    warning = warning ? `${warning} Contrat non généré : ${err.message}` : `Contrat non généré : ${err.message}`;
  }

  await delivery.save();
  logger.info(`Delivery created: ${delivery._id} for campaign ${campaign._id} (payment ${delivery.payment.status})`);

  if (delivery.contract?.number) {
    const title = campaign.title;
    sendContractGenerated(brand.email, brand.profile?.companyName || brand.profile?.name, title, delivery.contract.number, delivery._id).catch(() => {});
    if (creatorDoc?.email) sendContractGenerated(creatorDoc.email, creatorDoc.profile?.name, title, delivery.contract.number, delivery._id).catch(() => {});
    notify(brand._id, { type: 'contract', title: `Contrat ${delivery.contract.number} disponible`, text: title, href: `/deliveries/${delivery._id}` }).catch(() => {});
    if (creatorDoc?._id) notify(creatorDoc._id, { type: 'contract', title: `Contrat ${delivery.contract.number} disponible`, text: title, href: `/deliveries/${delivery._id}` }).catch(() => {});
  }

  return { delivery, warning, clientSecret };
}

/**
 * Client secret du paiement (marque) — pour afficher l'écran de saisie de carte
 */
export async function getPaymentIntent(req, res) {
  try {
    const delivery = await Delivery.findOne({ _id: req.params.deliveryId, brandId: req.user._id });
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (!delivery.payment.stripePaymentIntentId) {
      return res.status(400).json({ error: 'Aucun paiement Stripe associé à cette livraison' });
    }
    const pi = await retrievePaymentIntent(delivery.payment.stripePaymentIntentId);
    res.json({
      clientSecret: pi.client_secret,
      status: pi.status,
      amount: delivery.payment.amount,
      currency: delivery.payment.currency,
      paymentStatus: delivery.payment.status,
    });
  } catch (error) {
    logger.error('Failed to get payment intent:', error);
    res.status(500).json({ error: 'Impossible de préparer le paiement' });
  }
}

/**
 * Synchronise le statut du paiement après confirmation côté navigateur
 */
export async function confirmPayment(req, res) {
  try {
    const delivery = await Delivery.findOne({ _id: req.params.deliveryId, brandId: req.user._id });
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (!delivery.payment.stripePaymentIntentId) {
      return res.status(400).json({ error: 'Aucun paiement Stripe associé à cette livraison' });
    }
    const pi = await retrievePaymentIntent(delivery.payment.stripePaymentIntentId);
    if (pi.status === 'requires_capture' || pi.status === 'succeeded') {
      if (delivery.payment.status === 'pending' || delivery.payment.status === 'failed') {
        delivery.payment.status = pi.status === 'succeeded' ? 'captured' : 'held';
        delivery.payment.heldAt = new Date();
        await delivery.save();
      }
      return res.json({ message: 'Paiement confirmé', paymentStatus: delivery.payment.status, delivery });
    }
    res.status(400).json({
      error: `Le paiement n'est pas confirmé (statut Stripe : ${pi.status})`,
      stripeStatus: pi.status,
    });
  } catch (error) {
    logger.error('Failed to confirm payment:', error);
    res.status(500).json({ error: 'Impossible de vérifier le paiement' });
  }
}

/**
 * Create delivery (after creator selection)
 */
export async function createDelivery(req, res) {
  try {
    const { campaignId } = req.params;
    const brand = req.user;

    const campaign = await Campaign.findOne({
      _id: campaignId,
      brandId: brand._id,
    });

    if (!campaign || !campaign.selectedCreator) {
      return res.status(404).json({ error: 'Campaign or creator not found' });
    }

    const existingDelivery = await Delivery.findOne({ campaignId });
    if (existingDelivery) {
      return res.status(400).json({ error: 'Delivery already exists', delivery: existingDelivery });
    }

    const { delivery, warning, clientSecret } = await createDeliveryForCampaign(campaign, brand);

    res.status(201).json({
      message: 'Delivery created successfully',
      delivery,
      warning,
      paymentIntent: delivery.payment.stripePaymentIntentId
        ? { id: delivery.payment.stripePaymentIntentId, clientSecret }
        : null,
    });
  } catch (error) {
    logger.error('Failed to create delivery:', error);
    res.status(500).json({ error: 'Failed to create delivery' });
  }
}

/**
 * Upload deliverables (creator)
 */
export async function uploadDeliverables(req, res) {
  try {
    const { deliveryId } = req.params;
    const creator = req.user;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const delivery = await Delivery.findOne({
      _id: deliveryId,
      creatorId: creator._id,
    });

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    if (delivery.status !== 'pending' && delivery.status !== 'revision_requested') {
      return res.status(400).json({ error: 'Cannot upload files in current status' });
    }

    const campaignForCount = await Campaign.findById(delivery.campaignId).select('brief.deliverables brief.deliveryTypes');
    const expected = campaignForCount?.brief?.deliverables || 1;
    if (campaignForCount?.brief?.deliveryTypes?.length && !campaignForCount.brief.deliveryTypes.includes('file')) {
      return res.status(400).json({ error: 'Cette campagne attend une livraison par lien, pas par fichier' });
    }
    if (itemCount(delivery) + files.length > expected) {
      return res.status(400).json({
        error: `Cette campagne attend ${expected} vidéo(s) : vous en avez déjà ${itemCount(delivery)}. Supprimez-en avant d'en ajouter.`,
      });
    }

    // Upload files to storage
    const uploadedFiles = await uploadMultipleFiles(files, 'deliverables');

    // Add to delivery
    uploadedFiles.forEach((file, i) => {
      const original = files[i];
      delivery.files.push({
        url: file.url,
        type: fileTypeFromMime(original?.mimetype),
        filename: original?.originalname || file.filename,
        size: original?.size,
        metadata: { format: original?.mimetype },
      });
    });

    await delivery.save();

    logger.info(`Files uploaded to delivery ${delivery._id}: ${uploadedFiles.length} files`);

    const out = delivery.toObject({ virtuals: true });
    out.files = await resolveUrlsIn(out.files);

    res.json({
      message: 'Files uploaded successfully',
      files: out.files,
      delivery: out,
    });
  } catch (error) {
    logger.error('Failed to upload deliverables:', error);
    res.status(500).json({ error: 'Failed to upload deliverables' });
  }
}

/**
 * Envoi direct : lien signé pour déposer un fichier de livraison dans R2
 */
export async function getDeliveryUploadUrl(req, res) {
  try {
    const { deliveryId } = req.params;
    const { filename, contentType } = req.body;
    if (!/^(video|image)\//.test(contentType)) return res.status(400).json({ error: 'Seuls les fichiers vidéo ou image sont acceptés' });
    const delivery = await Delivery.findOne({ _id: deliveryId, creatorId: req.user._id }).select('_id status');
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (delivery.status !== 'pending' && delivery.status !== 'revision_requested') return res.status(400).json({ error: 'Cannot upload files in current status' });
    const out = await createUploadUrl({ folder: `deliverables/${delivery._id}`, originalName: filename, contentType });
    res.json(out);
  } catch (error) {
    logger.error('getDeliveryUploadUrl failed:', error);
    res.status(500).json({ error: `Préparation de l'envoi impossible : ${error.message}` });
  }
}

/**
 * Envoi direct : enregistre les fichiers déposés dans R2 (mêmes règles que l'upload classique)
 */
export async function registerDeliverables(req, res) {
  try {
    const { deliveryId } = req.params;
    const creator = req.user;
    const { files } = req.body;

    const delivery = await Delivery.findOne({ _id: deliveryId, creatorId: creator._id });
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (delivery.status !== 'pending' && delivery.status !== 'revision_requested') return res.status(400).json({ error: 'Cannot upload files in current status' });

    const campaignForCount = await Campaign.findById(delivery.campaignId).select('brief.deliverables brief.deliveryTypes');
    const expected = campaignForCount?.brief?.deliverables || 1;
    if (campaignForCount?.brief?.deliveryTypes?.length && !campaignForCount.brief.deliveryTypes.includes('file')) {
      return res.status(400).json({ error: 'Cette campagne attend une livraison par lien, pas par fichier' });
    }
    if (itemCount(delivery) + files.length > expected) {
      return res.status(400).json({ error: `Cette campagne attend ${expected} vidéo(s) : vous en avez déjà ${itemCount(delivery)}. Supprimez-en avant d'en ajouter.` });
    }

    const prefix = `deliverables/${delivery._id}/`;
    for (const f of files) {
      if (!f.key.startsWith(prefix)) return res.status(400).json({ error: 'Clé de fichier invalide' });
      if (delivery.files.some(existing => keyFromUrl(existing.url) === f.key)) return res.status(409).json({ error: `Fichier déjà enregistré : ${f.filename}` });
      const stat = await statObject(f.key);
      if (!stat) return res.status(400).json({ error: `Fichier introuvable (${f.filename}) : l'envoi n'a pas abouti, réessayez` });
      delivery.files.push({
        url: `${process.env.CLOUDFLARE_PUBLIC_URL}/${f.key}`,
        type: fileTypeFromMime(f.contentType || stat.contentType),
        filename: f.filename,
        size: stat.size ?? f.size,
        metadata: { format: f.contentType || stat.contentType },
      });
    }
    await delivery.save();

    logger.info(`Files registered on delivery ${delivery._id} (direct upload): ${files.length}`);
    const out = delivery.toObject({ virtuals: true });
    out.files = await resolveUrlsIn(out.files);
    res.json({ message: 'Files uploaded successfully', files: out.files, delivery: out });
  } catch (error) {
    logger.error('registerDeliverables failed:', error);
    res.status(500).json({ error: `Enregistrement impossible : ${error.message}` });
  }
}

/**
 * Submit delivery (creator)
 */
export async function submitDelivery(req, res) {
  try {
    const { deliveryId } = req.params;
    const creator = req.user;
    const { notes } = req.body;

    const delivery = await Delivery.findOne({
      _id: deliveryId,
      creatorId: creator._id,
    }).populate('campaignId', 'title')
      .populate('brandId', 'email profile.companyName profile.name');

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    if (itemCount(delivery) === 0) {
      return res.status(400).json({ error: 'Ajoutez au moins une vidéo (fichier ou lien) avant de soumettre' });
    }
    const expectedCount = await Campaign.findById(delivery.campaignId).select('brief.deliverables').then(c => c?.brief?.deliverables || 1);
    if (itemCount(delivery) > expectedCount) {
      return res.status(400).json({ error: `La campagne attend ${expectedCount} vidéo(s) maximum, vous en avez ${itemCount(delivery)}` });
    }

    if (!['pending', 'revision_requested'].includes(delivery.status)) {
      return res.status(400).json({ error: 'Delivery already submitted' });
    }

    delivery.submit();
    if (notes) delivery.notes.creator = notes;
    delivery.compliance = { status: 'pending', items: [] };
    await delivery.save();
    setImmediate(() => runComplianceCheck(delivery._id).catch(err => logger.error('Compliance job crashed:', err)));

    // Notify brand (non bloquant)
    sendDeliverySubmitted(
      delivery.brandId.email,
      delivery.brandId.profile.companyName || delivery.brandId.profile.name,
      delivery.campaignId.title,
      delivery._id
    ).catch(err => logger.error('Failed to send notification:', err.message));
    notify(idOf(delivery.brandId), { type: 'delivery', title: 'Vidéos livrées, à valider', text: delivery.campaignId.title, href: `/deliveries/${delivery._id}` }).catch(() => {});

    logger.info(`Delivery submitted: ${delivery._id}`);

    res.json({
      message: 'Delivery submitted successfully',
      delivery,
    });
  } catch (error) {
    logger.error('Failed to submit delivery:', error);
    res.status(500).json({ error: 'Failed to submit delivery' });
  }
}

/**
 * Ajoute des liens de livraison (créateur)
 */
export async function addLinks(req, res) {
  try {
    const { deliveryId } = req.params;
    const { links } = req.body;
    const delivery = await Delivery.findOne({ _id: deliveryId, creatorId: req.user._id });
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (!['pending', 'revision_requested'].includes(delivery.status)) {
      return res.status(400).json({ error: 'Impossible d\'ajouter des liens dans ce statut' });
    }
    const campaign = await Campaign.findById(delivery.campaignId).select('brief.deliverables brief.deliveryTypes');
    const expected = campaign?.brief?.deliverables || 1;
    if (campaign?.brief?.deliveryTypes?.length && !campaign.brief.deliveryTypes.includes('link')) {
      return res.status(400).json({ error: 'Cette campagne attend une livraison par fichier, pas par lien' });
    }
    if (itemCount(delivery) + links.length > expected) {
      return res.status(400).json({
        error: `Cette campagne attend ${expected} vidéo(s) : vous en avez déjà ${itemCount(delivery)}.`,
      });
    }
    links.forEach(l => {
      delivery.links.push({
        url: l.url,
        title: l.title,
        platform: l.platform || platformFromUrl(l.url),
        visibility: { creator: l.public !== false, brand: true },
      });
    });
    await delivery.save();
    logger.info(`Links added to delivery ${delivery._id}: ${links.length}`);
    res.json({ message: 'Liens ajoutés', links: delivery.links, delivery: delivery.toObject({ virtuals: true }) });
  } catch (error) {
    logger.error('Failed to add links:', error);
    res.status(500).json({ error: 'Failed to add links' });
  }
}

/**
 * Supprime un fichier ou un lien avant soumission (créateur)
 */
export async function removeItem(req, res) {
  try {
    const { deliveryId, itemId } = req.params;
    const delivery = await Delivery.findOne({ _id: deliveryId, creatorId: req.user._id });
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (!['pending', 'revision_requested'].includes(delivery.status)) {
      return res.status(400).json({ error: 'Impossible de supprimer dans ce statut' });
    }
    const file = delivery.files.id(itemId);
    const link = delivery.links.id(itemId);
    if (!file && !link) return res.status(404).json({ error: 'Élément introuvable' });
    if (file) file.deleteOne(); else link.deleteOne();
    await delivery.save();
    res.json({ message: 'Élément supprimé', delivery: delivery.toObject({ virtuals: true }) });
  } catch (error) {
    logger.error('Failed to remove item:', error);
    res.status(500).json({ error: 'Failed to remove item' });
  }
}

/**
 * Visibilité d'un lien : chaque partie (créateur / marque) donne ou retire son accord.
 * Le lien est public uniquement si les deux sont d'accord.
 */
export async function setLinkVisibility(req, res) {
  try {
    const { deliveryId, linkId } = req.params;
    const { public: isPublic } = req.body;
    const user = req.user;
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    const isBrand = idOf(delivery.brandId) === user._id.toString();
    const isCreator = idOf(delivery.creatorId) === user._id.toString();
    if (!isBrand && !isCreator) return res.status(403).json({ error: 'Access denied' });
    const link = delivery.links.id(linkId);
    if (!link) return res.status(404).json({ error: 'Lien introuvable' });
    if (isBrand) link.visibility.brand = isPublic; else link.visibility.creator = isPublic;
    await delivery.save();
    res.json({ message: 'Visibilité mise à jour', link, isPublic: link.visibility.brand && link.visibility.creator });
  } catch (error) {
    logger.error('Failed to set link visibility:', error);
    res.status(500).json({ error: 'Failed to update visibility' });
  }
}

/**
 * Lance le traitement du pack en arrière-plan
 */
async function runReadyPack(deliveryId) {
  const { processVideo } = await import('../services/video.js');
  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) return;
  delivery.readyPack.status = 'processing';
  await delivery.save();
  const outputs = [];
  let failed = 0;
  const sources = (delivery.files || []).filter(f => !f.superseded && f.type === 'video');
  for (const f of sources) {
    try {
      const result = await processVideo(f.url, delivery.readyPack.options, `ready-pack/${delivery._id}`);
      result.outputs.forEach(o => outputs.push({ ...o, itemId: String(f._id), sourceName: f.filename }));
    } catch (err) {
      failed++;
      logger.error(`Ready pack failed for ${f.filename}:`, err.message);
      outputs.push({ itemId: String(f._id), sourceName: f.filename, kind: 'video', error: err.message });
    }
  }
  delivery.readyPack.outputs = outputs;
  delivery.readyPack.status = failed === sources.length && sources.length > 0 ? 'failed' : 'done';
  delivery.readyPack.completedAt = new Date();
  if (failed) delivery.readyPack.error = `${failed} vidéo(s) n'ont pas pu être traitées`;
  await delivery.save();
  logger.info(`Ready pack ${delivery.readyPack.status} for delivery ${delivery._id} (${outputs.length} fichiers)`);
}

/**
 * Commande du pack "prêt à diffuser" (marque, livraison approuvée)
 * Si un prix est configuré : PaymentIntent à confirmer par carte, puis /ready-pack/confirm lance le traitement
 */
export async function requestReadyPack(req, res) {
  try {
    const { deliveryId } = req.params;
    const brand = req.user;
    const delivery = await Delivery.findOne({ _id: deliveryId, brandId: brand._id });
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (!['approved', 'auto_approved'].includes(delivery.status)) {
      return res.status(400).json({ error: 'Le pack se commande après validation de la livraison' });
    }
    if (['queued', 'processing'].includes(delivery.readyPack?.status)) {
      return res.status(400).json({ error: 'Un traitement est déjà en cours' });
    }
    const videos = (delivery.files || []).filter(f => !f.superseded && f.type === 'video');
    if (videos.length === 0) {
      return res.status(400).json({ error: 'Le pack nécessite des vidéos livrées en fichier (les liens ne peuvent pas être retraités)' });
    }
    const { formats, subtitles, thumbnail } = req.body;
    const priceHT = Math.round(config.readyPack.pricePerVideo * videos.length * 100) / 100;
    const price = Math.round(priceHT * (1 + config.vat.rate / 100) * 100) / 100; // TTC payé par la marque
    delivery.readyPack.options = { formats, subtitles, thumbnail };
    delivery.readyPack.priceHT = priceHT;
    delivery.readyPack.price = price;
    delivery.readyPack.requestedAt = new Date();
    delivery.readyPack.outputs = [];
    delivery.readyPack.error = null;

    let clientSecret = null;
    if (price > 0 && brand.stripeCustomerId) {
      const { stripe } = await import('../services/stripe.js');
      const pi = await stripe.paymentIntents.create({
        amount: Math.round(price * 100), currency: 'eur', customer: brand.stripeCustomerId,
        payment_method_types: ['card'], description: `Pack prêt à diffuser — ${videos.length} vidéo(s)`,
        metadata: { deliveryId: String(delivery._id), kind: 'ready_pack' },
      });
      delivery.readyPack.stripePaymentIntentId = pi.id;
      delivery.readyPack.paymentStatus = 'pending';
      delivery.readyPack.status = 'awaiting_payment';
      clientSecret = pi.client_secret;
      await delivery.save();
      return res.json({ message: 'Pack créé, paiement à confirmer', price, clientSecret, readyPack: delivery.readyPack });
    }

    delivery.readyPack.paymentStatus = price > 0 ? 'pending' : 'none';
    delivery.readyPack.status = 'queued';
    await delivery.save();
    setImmediate(() => runReadyPack(delivery._id).catch(err => logger.error('Ready pack job crashed:', err)));
    res.json({ message: 'Traitement lancé', price, readyPack: delivery.readyPack });
  } catch (error) {
    logger.error('Failed to request ready pack:', error);
    res.status(500).json({ error: `Impossible de commander le pack : ${error?.raw?.message || error.message}` });
  }
}

/**
 * Client secret du paiement du pack (pour l'écran de carte)
 */
export async function readyPackPaymentIntent(req, res) {
  try {
    const delivery = await Delivery.findOne({ _id: req.params.deliveryId, brandId: req.user._id });
    if (!delivery?.readyPack?.stripePaymentIntentId) return res.status(400).json({ error: 'Aucun paiement de pack en attente' });
    const { retrievePaymentIntent } = await import('../services/stripe.js');
    const pi = await retrievePaymentIntent(delivery.readyPack.stripePaymentIntentId);
    res.json({ clientSecret: pi.client_secret, status: pi.status, amount: delivery.readyPack.price, currency: 'EUR' });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de préparer le paiement du pack' });
  }
}

/**
 * Confirme le paiement du pack puis lance le traitement
 */
export async function confirmReadyPack(req, res) {
  try {
    const delivery = await Delivery.findOne({ _id: req.params.deliveryId, brandId: req.user._id });
    if (!delivery?.readyPack?.stripePaymentIntentId) return res.status(400).json({ error: 'Aucun paiement de pack en attente' });
    const { retrievePaymentIntent } = await import('../services/stripe.js');
    const pi = await retrievePaymentIntent(delivery.readyPack.stripePaymentIntentId);
    if (pi.status !== 'succeeded') {
      return res.status(400).json({ error: `Paiement non confirmé (statut Stripe : ${pi.status})` });
    }
    delivery.readyPack.paymentStatus = 'paid';
    delivery.readyPack.status = 'queued';
    await delivery.save();
    const brandForInvoice = await User.findById(delivery.brandId).select('email profile');
    setImmediate(() => issuePlatformInvoice({ delivery, brand: brandForInvoice, label: `Pack vidéo prête à diffuser — ${(delivery.files || []).filter(f => !f.superseded && f.type === 'video').length} vidéo(s)`, ht: delivery.readyPack.priceHT ?? delivery.readyPack.price / (1 + config.vat.rate / 100), ttc: delivery.readyPack.price, source: 'ready_pack' }).catch(() => {}));
    setImmediate(() => runReadyPack(delivery._id).catch(err => logger.error('Ready pack job crashed:', err)));
    res.json({ message: 'Paiement confirmé, traitement lancé', readyPack: delivery.readyPack });
  } catch (error) {
    logger.error('Failed to confirm ready pack:', error);
    res.status(500).json({ error: 'Impossible de confirmer le pack' });
  }
}

/**
 * Contrat : lien de téléchargement (signé si le bucket est privé), droits, avenants
 */
export async function getContract(req, res) {
  try {
    const delivery = await Delivery.findOne({ _id: req.params.deliveryId, $or: [{ brandId: req.user._id }, { creatorId: req.user._id }] }).select('contract rightsExtension');
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (!delivery.contract?.number) return res.status(404).json({ error: 'Aucun contrat pour cette mission' });
    const c = delivery.contract.toObject();
    c.url = await resolveUrl(c.url);
    c.addenda = await Promise.all((c.addenda || []).map(async (a) => ({ ...a, url: await resolveUrl(a.url) })));
    res.json({ contract: c, rightsExtension: delivery.rightsExtension });
  } catch (error) {
    logger.error('getContract failed:', error);
    res.status(500).json({ error: 'Contrat indisponible' });
  }
}

const EXT_DURATIONS = { '6m': '6 mois', '1y': '1 an', '2y': '2 ans', '3y': '3 ans', unlimited: 'une durée illimitée' };

async function loadDeliveryForExtension(deliveryId, userField, userId) {
  const delivery = await Delivery.findOne({ _id: deliveryId, [userField]: userId })
    .populate('campaignId', 'title platformFeePercent')
    .populate('brandId', 'email profile.companyName profile.name stripeCustomerId')
    .populate('creatorId', 'email profile.name profile.stripeConnect stripeAccountId');
  if (!delivery) return { error: 'Delivery not found', status: 404 };
  if (!delivery.contract?.number) return { error: 'Aucun contrat pour cette mission', status: 400 };
  if (!['approved', 'auto_approved'].includes(delivery.status)) return { error: 'La prolongation se demande après validation de la livraison', status: 400 };
  return { delivery };
}

/** Marque : demande une prolongation des droits au créateur */
export async function requestRightsExtension(req, res) {
  try {
    const { delivery, error, status } = await loadDeliveryForExtension(req.params.deliveryId, 'brandId', req.user._id);
    if (error) return res.status(status).json({ error });
    if (['proposed', 'awaiting_payment'].includes(delivery.rightsExtension?.status)) return res.status(400).json({ error: 'Une proposition est déjà en cours' });
    delivery.rightsExtension = { status: 'requested', requestMessage: req.body.message || '', requestedAt: new Date() };
    await delivery.save();
    sendExtensionRequested(delivery.creatorId.email, delivery.creatorId.profile?.name, delivery.campaignId.title, req.body.message, delivery._id).catch(() => {});
    notify(idOf(delivery.creatorId), { type: 'rights', title: 'Demande de prolongation des droits', text: delivery.campaignId.title, href: `/deliveries/${delivery._id}` }).catch(() => {});
    res.json({ message: 'Demande envoyée au créateur', rightsExtension: delivery.rightsExtension });
  } catch (error) {
    logger.error('requestRightsExtension failed:', error);
    res.status(500).json({ error: 'Demande impossible' });
  }
}

/** Créateur : propose un prix et une durée (peut aussi le faire sans demande préalable) */
export async function proposeRightsExtension(req, res) {
  try {
    const { delivery, error, status } = await loadDeliveryForExtension(req.params.deliveryId, 'creatorId', req.user._id);
    if (error) return res.status(status).json({ error });
    if (delivery.rightsExtension?.status === 'awaiting_payment') return res.status(400).json({ error: 'Une proposition est en attente de paiement' });
    const { price, duration, note } = req.body;
    // Même commission que la mission (Ambassadeur inclus) ; gifting (100 % = frais de service) → commission de la campagne
    const missionFee = delivery.payment?.platformFeePercent;
    const feePercent = missionFee != null && missionFee < 100 ? missionFee : (delivery.campaignId?.platformFeePercent ?? config.stripe.platformFeePercent);
    const r2 = (n) => Math.round(n * 100) / 100;
    const vatRate = delivery.payment?.vatRate || 0; // même régime que la mission (prix HT + TVA si créateur assujetti)
    const amount = r2(price * (1 + vatRate / 100)); // payé par la marque (TTC)
    const creatorAmount = r2(price * (1 - feePercent / 100) * (1 + vatRate / 100));
    const platformFee = r2(amount - creatorAmount);
    delivery.rightsExtension = {
      ...(delivery.rightsExtension?.toObject?.() || {}),
      status: 'proposed', price, vatRate, amount, duration, note: note || '', proposedAt: new Date(),
      platformFee, creatorAmount,
      stripePaymentIntentId: null, paidAt: null,
    };
    await delivery.save();
    sendExtensionProposed(delivery.brandId.email, delivery.brandId.profile?.companyName || delivery.brandId.profile?.name, delivery.campaignId.title, price, EXT_DURATIONS[duration], delivery._id).catch(() => {});
    notify(idOf(delivery.brandId), { type: 'rights', title: `Proposition de prolongation : ${price} €`, text: delivery.campaignId.title, href: `/deliveries/${delivery._id}` }).catch(() => {});
    res.json({ message: 'Proposition envoyée à la marque', rightsExtension: delivery.rightsExtension });
  } catch (error) {
    logger.error('proposeRightsExtension failed:', error);
    res.status(500).json({ error: 'Proposition impossible' });
  }
}

/** Refus (marque ou créateur) */
export async function declineRightsExtension(req, res) {
  try {
    const field = req.user.role === 'brand' ? 'brandId' : 'creatorId';
    const { delivery, error, status } = await loadDeliveryForExtension(req.params.deliveryId, field, req.user._id);
    if (error) return res.status(status).json({ error });
    if (!['requested', 'proposed', 'awaiting_payment'].includes(delivery.rightsExtension?.status)) return res.status(400).json({ error: 'Rien à refuser' });
    delivery.rightsExtension.status = 'declined';
    await delivery.save();
    res.json({ message: 'Proposition refusée', rightsExtension: delivery.rightsExtension });
  } catch (error) {
    res.status(500).json({ error: 'Action impossible' });
  }
}

/** Marque : accepte la proposition → paiement immédiat (client secret) ou prolongation directe si gratuite */
export async function acceptRightsExtension(req, res) {
  try {
    const { delivery, error, status } = await loadDeliveryForExtension(req.params.deliveryId, 'brandId', req.user._id);
    if (error) return res.status(status).json({ error });
    const ext = delivery.rightsExtension;
    if (!['proposed', 'awaiting_payment'].includes(ext?.status)) return res.status(400).json({ error: 'Aucune proposition à accepter' });
    if (ext.price > 0) {
      if (!ext.stripePaymentIntentId) {
        const pi = await createPaymentIntent(ext.amount || ext.price, 'EUR', req.user.stripeCustomerId, { deliveryId: String(delivery._id), kind: 'rights_extension' }, { captureMethod: 'automatic' });
        ext.stripePaymentIntentId = pi.id;
      }
      ext.status = 'awaiting_payment';
      await delivery.save();
      const pi = await retrievePaymentIntent(ext.stripePaymentIntentId);
      if (config.business.autoConfirmTestPayments && pi.status === 'requires_payment_method') {
        await confirmWithTestCard(pi.id);
        return finalizeRightsExtension(delivery, res);
      }
      return res.json({ message: 'Paiement à confirmer', clientSecret: pi.client_secret, amount: ext.amount || ext.price, rightsExtension: ext });
    }
    return finalizeRightsExtension(delivery, res);
  } catch (error) {
    logger.error('acceptRightsExtension failed:', error);
    res.status(500).json({ error: `Acceptation impossible : ${error?.raw?.message || error.message}` });
  }
}

/** Client secret pour l'écran de carte de la prolongation */
export async function rightsExtensionPaymentIntent(req, res) {
  try {
    const delivery = await Delivery.findOne({ _id: req.params.deliveryId, brandId: req.user._id }).select('rightsExtension');
    if (!delivery?.rightsExtension?.stripePaymentIntentId) return res.status(400).json({ error: 'Aucun paiement de prolongation en attente' });
    const pi = await retrievePaymentIntent(delivery.rightsExtension.stripePaymentIntentId);
    res.json({ clientSecret: pi.client_secret, status: pi.status, amount: delivery.rightsExtension.amount || delivery.rightsExtension.price, currency: 'EUR' });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de préparer le paiement' });
  }
}

/** Marque : confirme le paiement de la prolongation → avenant, nouvelle date de fin, virement au créateur */
export async function confirmRightsExtension(req, res) {
  try {
    const { delivery, error, status } = await loadDeliveryForExtension(req.params.deliveryId, 'brandId', req.user._id);
    if (error) return res.status(status).json({ error });
    const ext = delivery.rightsExtension;
    if (ext?.status !== 'awaiting_payment' || !ext.stripePaymentIntentId) return res.status(400).json({ error: 'Aucun paiement de prolongation en attente' });
    const pi = await retrievePaymentIntent(ext.stripePaymentIntentId);
    if (pi.status !== 'succeeded') return res.status(400).json({ error: `Paiement non confirmé (statut Stripe : ${pi.status})` });
    return finalizeRightsExtension(delivery, res);
  } catch (error) {
    logger.error('confirmRightsExtension failed:', error);
    res.status(500).json({ error: 'Confirmation impossible' });
  }
}

async function finalizeRightsExtension(delivery, res) {
  const ext = delivery.rightsExtension;
  const contract = delivery.contract;
  const previousEndAt = contract.rightsEndAt || new Date();
  const months = rightsDurationMonths(ext.duration);
  const base = contract.rightsEndAt && new Date(contract.rightsEndAt) > new Date() ? new Date(contract.rightsEndAt) : new Date();
  const newEndAt = months ? addMonths(base, months) : null;

  const addendum = { number: contractNumber('NC-AV'), generatedAt: new Date(), price: ext.price, duration: ext.duration, previousEndAt, newEndAt };
  const pdf = await generateAddendumPdf({ contract: contract.toObject(), addendum, parties: contract.parties });
  const { url } = await uploadFile(pdf, `avenant-${addendum.number}.pdf`, 'application/pdf', `contracts/${delivery._id}`);
  contract.addenda.push({ ...addendum, url });
  contract.rightsEndAt = newEndAt;
  contract.expiryReminderSentAt = null;
  ext.status = 'paid';
  ext.paidAt = new Date();

  let warning = null;
  if (ext.price > 0 && ext.creatorAmount > 0) {
    const creator = delivery.creatorId;
    const accountId = creator?.profile?.stripeConnect?.payoutsEnabled ? (creator.profile.stripeConnect.accountId || creator.stripeAccountId) : null;
    if (accountId) {
      try {
        const t = await transferToCreator(ext.stripePaymentIntentId, accountId, ext.creatorAmount);
        ext.stripeTransferId = t.id;
      } catch (err) {
        warning = `Paiement encaissé, virement au créateur en échec : ${err.message}`;
      }
    } else {
      warning = 'Paiement encaissé. Le virement partira dès que le créateur aura connecté son compte Stripe.';
    }
  }
  await delivery.save();

  const title = delivery.campaignId?.title;
  if (ext.price > 0 && ext.stripePaymentIntentId) {
    const r2 = (n) => Math.round(n * 100) / 100;
    const feeTTC = ext.platformFee || 0, feeHT = r2(feeTTC / (1 + config.vat.rate / 100));
    setImmediate(() => issueCreatorInvoices({
      delivery, creator: delivery.creatorId, brand: delivery.brandId, campaignTitle: title, source: 'rights_extension',
      label: `Prolongation des droits d'utilisation (${EXT_DURATIONS[ext.duration] || ext.duration}) — ${title}`,
      amounts: { ht: ext.price, vatRate: ext.vatRate || 0, vat: r2((ext.amount || ext.price) - ext.price), ttc: ext.amount || ext.price, feeHT, feeVat: r2(feeTTC - feeHT), feeTTC },
    }).catch(() => {}));
  }
  sendExtensionPaid(delivery.brandId.email, delivery.brandId.profile?.companyName || delivery.brandId.profile?.name, title, addendum.number, newEndAt, delivery._id).catch(() => {});
  sendExtensionPaid(delivery.creatorId.email, delivery.creatorId.profile?.name, title, addendum.number, newEndAt, delivery._id).catch(() => {});
  notify(idOf(delivery.creatorId), { type: 'rights', title: 'Prolongation des droits payée', text: title, href: `/deliveries/${delivery._id}` }).catch(() => {});
  logger.info(`Droits prolongés sur ${delivery._id} : avenant ${addendum.number}, fin ${newEndAt ? newEndAt.toISOString() : 'illimitée'}`);
  return res.json({ message: 'Prolongation confirmée', addendum: { ...addendum, url }, rightsEndAt: newEndAt, warning });
}

/**
 * Garantie de remplacement sans remplaçant : la marque retire la mission au créateur en retard et rouvre la campagne
 * aux candidatures. Montant bloqué libéré, place libérée, retard compté sur le créateur.
 */
export async function withdrawLateDelivery(req, res) {
  try {
    const delivery = await Delivery.findOne({ _id: req.params.deliveryId, brandId: req.user._id })
      .populate('campaignId', 'title').populate('creatorId', 'email profile.name');
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (!replacementAllowed(delivery)) return res.status(400).json({ error: `Le retrait n'est possible qu'après ${config.business.replacementGraceHours} h de retard sur une mission sans livraison.` });
    const campaign = await Campaign.findById(idOf(delivery.campaignId));
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    let paymentNote = 'aucun paiement associé';
    if (delivery.payment?.stripePaymentIntentId) {
      try {
        const r = await cancelOrRefundPaymentIntent(delivery.payment.stripePaymentIntentId);
        paymentNote = r.action === 'canceled' ? 'montant bloqué libéré' : r.action === 'refunded' ? 'montant remboursé' : `paiement ${r.status}`;
        if (r.action !== 'none') delivery.payment.status = 'refunded';
      } catch (err) {
        return res.status(500).json({ error: `Impossible de libérer le paiement : ${err?.raw?.message || err.message}` });
      }
    }
    const oldCreatorId = idOf(delivery.creatorId);
    delivery.status = 'rejected';
    delivery.rejection = { at: new Date(), reason: 'Mission retirée pour retard (garantie de remplacement), campagne rouverte', auto: false };
    delivery.replacement = { ...(delivery.replacement?.toObject?.() || {}), status: 'replaced', replacedAt: new Date() };
    await delivery.save();
    await User.updateOne({ _id: oldCreatorId }, { $inc: { 'profile.stats.lateDeliveries': 1 } });

    campaign.selectedCreators = (campaign.selectedCreators || []).filter(id => idOf(id) !== oldCreatorId);
    if (idOf(campaign.selectedCreator) === oldCreatorId) campaign.selectedCreator = undefined;
    campaign.applications.forEach(a => { if (idOf(a.creatorId) === oldCreatorId) a.status = 'rejected'; });
    campaign.status = 'active'; // rouverte aux candidatures
    if (campaign.timeline) campaign.timeline.reopenedAt = new Date();
    await campaign.save();

    sendMissionWithdrawn(delivery.creatorId.email, delivery.creatorId.profile?.name, campaign.title).catch(() => {});
    notify(oldCreatorId, { type: 'replacement', title: 'Mission retirée pour retard', text: campaign.title, href: `/deliveries/${delivery._id}` }).catch(() => {});
    logger.info(`Mission ${delivery._id} retirée à ${oldCreatorId}, campagne ${campaign._id} rouverte (${paymentNote})`);
    res.json({ message: `Mission retirée (${paymentNote}). Votre campagne est de nouveau ouverte aux candidatures.`, campaignId: campaign._id });
  } catch (error) {
    logger.error('withdrawLateDelivery failed:', error);
    res.status(500).json({ error: 'Failed to withdraw delivery' });
  }
}

/**
 * Garantie de remplacement : la mission peut-elle être réattribuée ? (créateur en retard depuis > délai de grâce)
 */
function replacementAllowed(delivery) {
  if (delivery.status !== 'pending' || !delivery.productionDeadline) return false;
  return Date.now() - new Date(delivery.productionDeadline).getTime() >= config.business.replacementGraceHours * 3600000;
}

/** Marque : les meilleurs autres devis de la campagne (candidats au remplacement) */
export async function replacementCandidates(req, res) {
  try {
    const delivery = await Delivery.findOne({ _id: req.params.deliveryId, brandId: req.user._id });
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    const campaign = await Campaign.findById(delivery.campaignId).populate('applications.creatorId', 'profile.name profile.avatar profile.stats profile.niches');
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const selected = new Set((campaign.selectedCreators || []).map(id => idOf(id)));
    const candidates = campaign.applications
      // Les autres devis passent en « refusé » automatiquement quand les postes sont pourvus : ils restent de bons candidats
      .filter(a => a.creatorId && ['pending', 'rejected'].includes(a.status) && !selected.has(idOf(a.creatorId)) && idOf(a.creatorId) !== idOf(delivery.creatorId))
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
      .slice(0, 3)
      .map(a => ({
        creatorId: idOf(a.creatorId),
        name: a.creatorId.profile?.name,
        avatar: a.creatorId.profile?.avatar,
        rating: a.creatorId.profile?.stats?.rating || 0,
        completedJobs: a.creatorId.profile?.stats?.completedJobs || 0,
        level: levelFor(a.creatorId.profile?.stats),
        price: a.price,
        estimatedDeliveryDays: a.estimatedDeliveryDays,
        matchScore: a.matchScore,
        rights: a.quote?.rights,
        proposal: a.proposal,
      }));
    res.json({ allowed: replacementAllowed(delivery), graceHours: config.business.replacementGraceHours, candidates });
  } catch (error) {
    logger.error('replacementCandidates failed:', error);
    res.status(500).json({ error: 'Candidats indisponibles' });
  }
}

/** Marque : réattribue la mission à un autre candidat (libère le paiement bloqué, nouvelle livraison) */
export async function replaceCreator(req, res) {
  try {
    const { deliveryId, creatorId } = req.params;
    const brand = req.user;
    const delivery = await Delivery.findOne({ _id: deliveryId, brandId: brand._id }).populate('creatorId', 'email profile.name');
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (!replacementAllowed(delivery)) {
      return res.status(400).json({ error: `Le remplacement est possible ${config.business.replacementGraceHours} h après la date de livraison prévue, tant que rien n'a été livré` });
    }
    const campaign = await Campaign.findOne({ _id: delivery.campaignId, brandId: brand._id });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const application = campaign.applications.find(a => idOf(a.creatorId) === creatorId && ['pending', 'rejected'].includes(a.status));
    if (!application) return res.status(400).json({ error: 'Ce créateur n\'a pas de devis sur cette campagne' });
    const newCreator = await User.findById(creatorId).select('email profile.name status');
    if (!newCreator || newCreator.status !== 'active') return res.status(400).json({ error: 'Créateur indisponible' });

    // 1. Libère le paiement bloqué de la mission en retard
    let paymentNote = 'aucun paiement associé';
    if (delivery.payment?.stripePaymentIntentId) {
      try {
        const r = await cancelOrRefundPaymentIntent(delivery.payment.stripePaymentIntentId);
        paymentNote = r.action === 'canceled' ? 'montant bloqué libéré' : r.action === 'refunded' ? 'montant remboursé' : `paiement ${r.status}`;
        if (r.action !== 'none') delivery.payment.status = 'refunded';
      } catch (err) {
        logger.error('Cancel payment on replacement failed:', err);
        return res.status(500).json({ error: `Impossible de libérer le paiement : ${err?.raw?.message || err.message}` });
      }
    }

    // 2. Clôture la livraison en retard
    const oldCreatorId = idOf(delivery.creatorId);
    delivery.status = 'rejected';
    delivery.replacement = { ...(delivery.replacement?.toObject?.() || {}), status: 'replaced', replacedBy: creatorId, replacedAt: new Date() };
    await delivery.save();
    await User.updateOne({ _id: oldCreatorId }, { $inc: { 'profile.stats.lateDeliveries': 1 } });

    // 3. Retire l'ancien créateur de la campagne et sélectionne le remplaçant
    campaign.selectedCreators = (campaign.selectedCreators || []).filter(id => idOf(id) !== oldCreatorId);
    if (idOf(campaign.selectedCreator) === oldCreatorId) campaign.selectedCreator = undefined;
    campaign.applications.forEach(a => { if (idOf(a.creatorId) === oldCreatorId) a.status = 'rejected'; });
    if (campaign.status === 'in_progress') campaign.status = 'active'; // un poste se libère
    campaign.selectCreator(creatorId);
    if (application.quote) application.quote.acceptedAt = new Date();
    await campaign.save();

    // 4. Nouvelle livraison + autorisation de paiement
    const result = await createDeliveryForCampaign(campaign, brand, application.price, creatorId);
    delivery.replacement.newDeliveryId = result.delivery._id;
    await delivery.save();

    sendMissionWithdrawn(delivery.creatorId.email, delivery.creatorId.profile?.name, campaign.title).catch(() => {});
    sendApplicationAccepted(newCreator.email, newCreator.profile?.name, campaign.title, campaign._id).catch(() => {});
    logger.info(`Remplacement sur ${delivery._id} : ${oldCreatorId} → ${creatorId} (${paymentNote})`);
    res.json({
      message: `Mission confiée à ${newCreator.profile?.name} (${paymentNote})`,
      delivery: result.delivery,
      clientSecret: result.clientSecret,
      paymentRequired: !!result.delivery && result.delivery.payment.status === 'pending' && !!result.delivery.payment.stripePaymentIntentId,
      warning: result.warning,
    });
  } catch (error) {
    logger.error('replaceCreator failed:', error);
    res.status(500).json({ error: `Remplacement impossible : ${error.message}` });
  }
}

/**
 * Saisie / mise à jour des performances d'une vidéo livrée (marque ou créateur)
 */
export async function updatePerformance(req, res) {
  try {
    const { deliveryId } = req.params;
    const { itemId, platform, url, views, likes, comments, shares } = req.body;
    const user = req.user;
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    const isBrand = idOf(delivery.brandId) === user._id.toString();
    const isCreator = idOf(delivery.creatorId) === user._id.toString();
    if (!isBrand && !isCreator) return res.status(403).json({ error: 'Access denied' });
    if (!['approved', 'auto_approved'].includes(delivery.status)) {
      return res.status(400).json({ error: 'Les performances se renseignent après validation de la livraison' });
    }
    const key = itemId || url || 'global';
    let entry = delivery.performance.find(p => (p.itemId || p.url || 'global') === key);
    if (!entry) {
      delivery.performance.push({ itemId, platform, url, views, likes, comments, shares, updatedBy: user._id });
    } else {
      Object.assign(entry, { platform, url: url || entry.url, views, likes, comments, shares, updatedAt: new Date(), updatedBy: user._id });
    }
    await delivery.save();
    res.json({ message: 'Performances enregistrées', performance: delivery.performance });
  } catch (error) {
    logger.error('Failed to update performance:', error);
    res.status(500).json({ error: 'Failed to update performance' });
  }
}

/**
 * Suivi de l'envoi du produit : la marque marque "expédié", le créateur "reçu"
 */
export async function updateShipping(req, res) {
  try {
    const { deliveryId } = req.params;
    const { action, carrier, trackingNumber, trackingUrl, note } = req.body;
    const user = req.user;
    const delivery = await Delivery.findById(deliveryId)
      .populate('campaignId', 'title')
      .populate('creatorId', 'email profile.name')
      .populate('brandId', 'email profile.companyName profile.name');
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    const isBrand = idOf(delivery.brandId) === user._id.toString();
    const isCreator = idOf(delivery.creatorId) === user._id.toString();
    if (!isBrand && !isCreator) return res.status(403).json({ error: 'Access denied' });

    if (action === 'shipped') {
      if (!isBrand) return res.status(403).json({ error: 'Seule la marque peut marquer le produit comme expédié' });
      delivery.shipping.required = true;
      delivery.shipping.status = 'shipped';
      delivery.shipping.carrier = carrier;
      delivery.shipping.trackingNumber = trackingNumber;
      delivery.shipping.trackingUrl = trackingUrl;
      delivery.shipping.note = note;
      delivery.shipping.shippedAt = new Date();
      await delivery.save();
      sendProductShipped(delivery.creatorId.email, delivery.creatorId.profile.name, delivery.brandId.profile.companyName || delivery.brandId.profile.name, delivery.campaignId.title, carrier, trackingNumber, trackingUrl, delivery._id)
        .catch(err => logger.error('Shipping email failed:', err.message));
      notify(idOf(delivery.creatorId), { type: 'delivery', title: 'Produit expédié', text: delivery.campaignId.title, href: `/deliveries/${delivery._id}` }).catch(() => {});
    } else if (action === 'received') {
      if (!isCreator) return res.status(403).json({ error: 'Seul le créateur peut confirmer la réception' });
      if (delivery.shipping.status !== 'shipped') return res.status(400).json({ error: 'Le produit n\'est pas encore marqué comme expédié' });
      delivery.shipping.status = 'received';
      delivery.shipping.receivedAt = new Date();
      // Le délai de production court à partir de la réception
      const days = delivery.estimatedDeliveryDays || 7;
      delivery.productionDeadline = new Date(Date.now() + days * 86400000);
      await delivery.save();
      sendProductReceived(delivery.brandId.email, delivery.brandId.profile.companyName || delivery.brandId.profile.name, delivery.creatorId.profile.name, delivery.campaignId.title, delivery.productionDeadline, delivery._id)
        .catch(err => logger.error('Shipping email failed:', err.message));
      notify(idOf(delivery.brandId), { type: 'delivery', title: 'Produit reçu par le créateur', text: delivery.campaignId.title, href: `/deliveries/${delivery._id}` }).catch(() => {});
    } else if (action === 'not_required') {
      if (!isBrand) return res.status(403).json({ error: 'Réservé à la marque' });
      delivery.shipping.required = false;
      delivery.shipping.status = 'none';
      const days = delivery.estimatedDeliveryDays || 7;
      if (!delivery.productionDeadline) delivery.productionDeadline = new Date(Date.now() + days * 86400000);
      await delivery.save();
    }

    logger.info(`Shipping ${action} on delivery ${delivery._id}`);
    res.json({ message: 'Envoi mis à jour', shipping: delivery.shipping, productionDeadline: delivery.productionDeadline });
  } catch (error) {
    logger.error('Failed to update shipping:', error);
    res.status(500).json({ error: 'Failed to update shipping' });
  }
}

/**
 * Réalisations publiques d'un créateur (liens de livraisons approuvées, accord des deux parties)
 */
export async function publicRealisations(creatorId, viewerId = null) {
  const deliveries = await Delivery.find({
    creatorId,
    status: { $in: ['approved', 'auto_approved'] },
    'links.0': { $exists: true },
  })
    .populate('campaignId', 'title brief.videoType')
    .populate('brandId', 'profile.companyName')
    .sort({ approvedAt: -1 })
    .lean();

  const out = [];
  for (const d of deliveries) {
    const viewerIsBrand = viewerId && idOf(d.brandId) === viewerId.toString();
    for (const l of d.links || []) {
      if (l.superseded) continue;
      const isPublic = l.visibility?.creator !== false && l.visibility?.brand !== false;
      if (isPublic || viewerIsBrand) {
        out.push({
          _id: l._id,
          url: l.url,
          platform: l.platform,
          title: l.title || d.campaignId?.title,
          campaignTitle: d.campaignId?.title,
          videoType: d.campaignId?.brief?.videoType,
          brandName: d.brandId?.profile?.companyName,
          deliveryId: d._id,
          date: d.approvedAt,
          isPublic,
          source: 'delivery',
        });
      }
    }
  }
  return out;
}

/**
 * Bonus de parrainage : versé au parrain quand son filleul livre sa première mission
 */
async function grantCreatorReferralBonus(creatorId, delivery) {
  try {
    const referee = await User.findById(creatorId).select('referral.referredBy profile.name');
    const referrerId = referee?.referral?.referredBy;
    if (!referrerId) return;
    const approvedCount = await Delivery.countDocuments({ creatorId, status: { $in: ['approved', 'auto_approved'] } });
    if (approvedCount !== 1) return; // uniquement la première
    const referrer = await User.findById(referrerId);
    if (!referrer || referrer.role !== 'creator') return;
    if (referrer.referral?.rewards?.some(r => r.type === 'creator_bonus' && String(r.sourceUserId) === String(creatorId))) return;

    const amount = config.referral.creatorBonus;
    const reward = { type: 'creator_bonus', amount, description: `Bonus parrainage : première mission livrée par ${referee.profile.name}`, sourceUserId: creatorId, campaignId: idOf(delivery.campaignId), status: 'pending' };
    const accountId = referrer.profile?.stripeConnect?.payoutsEnabled ? (referrer.profile.stripeConnect.accountId || referrer.stripeAccountId) : null;
    if (accountId) {
      try {
        const { transferToCreator } = await import('../services/stripe.js');
        const t = await transferToCreator(`referral_${creatorId}`, accountId, amount, 'eur');
        reward.status = 'paid';
        reward.stripeTransferId = t.id;
      } catch (err) {
        logger.error('Referral bonus transfer failed:', err.message);
      }
    }
    referrer.referral.rewards.push(reward);
    await referrer.save();
    logger.info(`Referral bonus ${amount}€ granted to ${referrer._id} (${reward.status})`);
  } catch (error) {
    logger.error('Failed to grant referral bonus:', error);
  }
}

/**
 * Finalise une approbation (manuelle ou automatique) :
 * encaisse le paiement, tente le virement, clôture la campagne, met à jour les stats.
 */
export async function finalizeApproval(delivery, { isAuto = false } = {}) {
  const creator = delivery.creatorId?.profile
    ? delivery.creatorId
    : await User.findById(idOf(delivery.creatorId)).select('email profile.name profile.stats stripeAccountId profile.stripeConnect');

  const creatorAccountId = creator?.profile?.stripeConnect?.payoutsEnabled
    ? (creator.profile.stripeConnect.accountId || creator.stripeAccountId)
    : null;

  let transferred = false;
  let transferId = null;
  let warning = null;

  if (delivery.payment.stripePaymentIntentId && ['held', 'captured'].includes(delivery.payment.status)) {
    const result = await captureAndTransfer(
      delivery.payment.stripePaymentIntentId,
      creatorAccountId,
      delivery.payment.amount,
      delivery.payment.platformFee
    );
    transferred = result.transferred;
    transferId = result.transfer?.id || null;
    if (!transferred) {
      if (creatorAccountId) { const { alertTransferFailed } = await import('../services/adminAlerts.js'); alertTransferFailed(delivery, result.transferError).catch(() => {}); }
      warning = creatorAccountId
        ? `Paiement encaissé, virement au créateur en échec : ${result.transferError || 'erreur inconnue'}`
        : 'Paiement encaissé. Le virement sera effectué dès que le créateur aura connecté son compte Stripe.';
    }
  } else if (!delivery.payment.stripePaymentIntentId) {
    warning = 'Aucun paiement Stripe associé à cette livraison (mode test sans paiement).';
    transferred = false;
  }

  delivery.approve(isAuto, transferred);
  if (transferId) delivery.payment.stripeTransferId = transferId;
  await delivery.save();
  // Factures (créateur → marque par mandat, commission NeedCreator ; ou frais de service gifting)
  if (delivery.payment.stripePaymentIntentId) setImmediate(() => issueMissionInvoices(delivery).catch(() => {}));

  // Clôture la campagne quand toutes les livraisons sont approuvées
  const campaignId = idOf(delivery.campaignId);
  const remaining = await Delivery.countDocuments({ campaignId, status: { $nin: ['approved', 'auto_approved', 'rejected'] } });
  const campaignDoc = await Campaign.findById(campaignId).select('selectedCreators matching.creatorsWanted');
  const allSelected = campaignDoc ? (campaignDoc.selectedCreators?.length || 1) >= (campaignDoc.matching?.creatorsWanted || 1) : true;
  if (remaining === 0 && allSelected) {
    await Campaign.updateOne({ _id: campaignId }, { $set: { status: 'completed' } });
  }

  // Stats créateur : missions complétées + taux de livraison à temps
  if (creator) {
    await User.updateOne({ _id: creator._id }, { $inc: { 'profile.stats.completedJobs': 1 } });
    // Première mission validée : moment idéal pour proposer le programme Ambassadeur
    const fresh = await User.findById(creator._id).select('email profile.name profile.slug profile.stats.completedJobs profile.ambassador.status referral.code');
    const title = delivery.campaignId?.title || (await Campaign.findById(campaignId).select('title'))?.title || 'votre campagne';
    if (fresh && fresh.profile?.stats?.completedJobs === 1 && !['approved', 'pending'].includes(fresh.profile?.ambassador?.status)) {
      sendBecomeAmbassador(fresh.email, fresh.profile.name, title).catch(() => {});
    }
    // Moment où le créateur est content : texte de publication prêt + lien de parrainage (viralité)
    if (fresh && !isAuto) {
      const code = fresh.referral?.code;
      const referralLink = code ? `${config.cors.origin}/register?role=creator&ref=${code}` : `${config.cors.origin}/createurs`;
      const mediaKitUrl = fresh.profile?.slug ? `${config.cors.origin}/c/${fresh.profile.slug}` : `${config.cors.origin}/profile`;
      sendShareAfterMission(fresh.email, fresh.profile.name, title, referralLink, mediaKitUrl, config.referral.creatorBonus).catch(() => {});
    }
  }
  // Réactivité de la marque
  updateBrandStats(idOf(delivery.brandId));

  // Parrainage créateur : bonus au parrain à la première mission livrée du filleul
  await grantCreatorReferralBonus(creator?._id || idOf(delivery.creatorId), delivery);

  return { transferred, warning };
}

/**
 * Approve delivery (brand)
 */
export async function approveDelivery(req, res) {
  try {
    const { deliveryId } = req.params;
    const brand = req.user;

    const delivery = await Delivery.findOne({
      _id: deliveryId,
      brandId: brand._id,
    }).populate('campaignId', 'title')
      .populate('creatorId', 'email profile.name profile.stats stripeAccountId profile.stripeConnect');

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    if (delivery.status !== 'submitted') {
      return res.status(400).json({ error: 'La livraison n\'a pas encore été soumise' });
    }

    if (delivery.payment.stripePaymentIntentId && !['held', 'captured', 'released'].includes(delivery.payment.status)) {
      return res.status(400).json({ error: 'Le paiement n\'a pas été confirmé. Renseignez votre carte sur cette page avant d\'approuver.' });
    }

    const { warning } = await finalizeApproval(delivery, { isAuto: false });

    // Notify creator (non bloquant)
    sendDeliveryApproved(
      delivery.creatorId.email,
      delivery.creatorId.profile.name,
      delivery.campaignId.title,
      delivery.payment.creatorAmount
    ).catch(err => logger.error('Failed to send notification:', err.message));
    notify(idOf(delivery.creatorId), { type: 'approval', title: `Vidéos validées : ${delivery.payment.creatorAmount} € en route`, text: delivery.campaignId.title, href: `/deliveries/${delivery._id}` }).catch(() => {});

    logger.info(`Delivery approved: ${delivery._id}`);

    res.json({
      message: 'Delivery approved successfully',
      delivery,
      warning,
    });
  } catch (error) {
    logger.error('Failed to approve delivery:', error);
    res.status(500).json({ error: `Échec de l'approbation : ${error?.raw?.message || error.message}` });
  }
}

/**
 * Request revision (brand)
 */
export async function requestRevision(req, res) {
  try {
    const { deliveryId } = req.params;
    const { feedback } = req.body;
    const brand = req.user;

    const delivery = await Delivery.findOne({
      _id: deliveryId,
      brandId: brand._id,
    }).populate('campaignId', 'title')
      .populate('creatorId', 'email profile.name');

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const maxRevisions = await allowedRevisionsFor(delivery);
    if (!(delivery.status === 'submitted' && delivery.revisionCount < maxRevisions)) {
      return res.status(400).json({
        error: `Nombre de révisions prévu au devis atteint (${maxRevisions}) ou statut invalide`
      });
    }

    delivery.requestRevision(feedback, maxRevisions);
    await delivery.save();

    // Notify creator (non bloquant)
    sendRevisionRequested(
      delivery.creatorId.email,
      delivery.creatorId.profile.name,
      delivery.campaignId.title,
      feedback,
      delivery._id
    ).catch(err => logger.error('Failed to send notification:', err.message));
    notify(idOf(delivery.creatorId), { type: 'revision', title: 'Révision demandée', text: delivery.campaignId.title, href: `/deliveries/${delivery._id}` }).catch(() => {});

    logger.info(`Revision requested for delivery ${delivery._id}`);

    res.json({
      message: 'Revision requested successfully',
      delivery,
    });
  } catch (error) {
    logger.error('Failed to request revision:', error);
    res.status(500).json({ error: 'Failed to request revision' });
  }
}

/**
 * Get deliveries
 */
export async function getDeliveries(req, res) {
  try {
    const user = req.user;
    const { status, page = 1, limit = 20 } = req.query;

    let query = {};

    if (user.role === 'brand') {
      query.brandId = user._id;
    } else if (user.role === 'creator') {
      query.creatorId = user._id;
    }

    // status : un statut ou une liste séparée par des virgules (onglets « Missions »)
    if (status) query.status = String(status).includes(',') ? { $in: String(status).split(',') } : status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let [deliveries, total] = await Promise.all([
      Delivery.find(query)
        .populate('campaignId', 'title brief.deliverables')
        .populate('creatorId', 'profile.name profile.avatar')
        .populate('brandId', 'profile.companyName profile.avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Delivery.countDocuments(query),
    ]);
    const now = Date.now();
    deliveries = deliveries.map(doc => {
      const d = doc.toObject({ virtuals: true });
      d.expectedCount = doc.campaignId?.brief?.deliverables || 1;
      d.itemCount = itemCount(doc);
      d.isLate = d.status === 'pending' && !!d.productionDeadline && new Date(d.productionDeadline).getTime() < now;
      return d;
    });

    res.json({
      deliveries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Failed to get deliveries:', error);
    res.status(500).json({ error: 'Failed to get deliveries' });
  }
}

/**
 * Get single delivery
 */
export async function getDelivery(req, res) {
  try {
    const { deliveryId } = req.params;
    const user = req.user;

    const deliveryDoc = await Delivery.findById(deliveryId)
      .populate('campaignId')
      .populate('creatorId', 'profile.name profile.avatar profile.stats')
      .populate('brandId', 'profile.companyName profile.avatar');

    if (!deliveryDoc) {
      return res.status(404).json({ error: 'Delivery not found' });
    }
    const delivery = deliveryDoc.toObject({ virtuals: true });

    // Check access rights
    const hasAccess =
      user.role === 'admin' ||
      idOf(delivery.brandId) === user._id.toString() ||
      idOf(delivery.creatorId) === user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // URLs lisibles pour les fichiers
    delivery.files = await resolveUrlsIn(delivery.files || []);
    if (delivery.readyPack?.outputs?.length) {
      delivery.readyPack.outputs = await resolveUrlsIn(delivery.readyPack.outputs);
    }
    delivery.readyPackPricePerVideo = config.readyPack.pricePerVideo;
    delivery.maxRevisions = await allowedRevisionsFor(delivery); // révisions prévues au devis, plafonnées par l'admin
    delivery.canRequestRevision = delivery.status === 'submitted' && (delivery.revisions?.length || 0) < delivery.maxRevisions;
    delivery.canDispute = delivery.status === 'submitted' && (delivery.revisions?.length || 0) >= delivery.maxRevisions; // refus définitif possible (révisions épuisées)
    { const { Invoice, kindFilter } = await import('../services/invoices.js'); delivery.invoices = await Invoice.find({ deliveryId: delivery._id, ...kindFilter(user.role) }).select('number kind issuedAt totals source creditedBy').sort({ issuedAt: 1 }).lean(); }
    delivery.isLate = delivery.status === 'pending' && !!delivery.productionDeadline && new Date(delivery.productionDeadline) < new Date();
    delivery.replacementAvailable = delivery.isLate && (Date.now() - new Date(delivery.productionDeadline).getTime()) >= config.business.replacementGraceHours * 3600000;
    const { transcriptionAvailable } = await import('../services/video.js');
    delivery.readyPackSubtitlesAvailable = transcriptionAvailable();

    // Avis déjà laissés sur cette campagne (pour afficher/masquer le formulaire)
    const reviews = await Review.find({ campaignId: idOf(delivery.campaignId) })
      .populate('reviewerId', 'profile.name role')
      .lean();
    const otherId = idOf(delivery.brandId) === user._id.toString() ? idOf(delivery.creatorId) : idOf(delivery.brandId);
    delivery.myReview = reviews.find(r => idOf(r.reviewerId) === user._id.toString() && idOf(r.revieweeId) === otherId) || null;
    delivery.receivedReview = reviews.find(r => idOf(r.revieweeId) === user._id.toString() && idOf(r.reviewerId) === otherId && r.publishedAt) || null;
    delivery.otherHasReviewed = reviews.some(r => idOf(r.revieweeId) === user._id.toString() && idOf(r.reviewerId) === otherId); // l'autre partie a noté (peut-être encore caché)
    delivery.canReview = ['approved', 'auto_approved'].includes(delivery.status) && !delivery.myReview;

    res.json({ delivery });
  } catch (error) {
    logger.error('Failed to get delivery:', error);
    res.status(500).json({ error: 'Failed to get delivery' });
  }
}
