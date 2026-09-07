import Delivery from '../models/Delivery.js';
import Campaign from '../models/Campaign.js';
import Review from '../models/Review.js';
import User from '../models/User.js';
import { config } from '../config/index.js';
import { createPaymentIntent, confirmWithTestCard, captureAndTransfer, retrievePaymentIntent } from '../services/stripe.js';
import { uploadMultipleFiles, resolveUrlsIn } from '../services/storage.js';
import {
  sendDeliverySubmitted,
  sendDeliveryApproved,
  sendRevisionRequested
} from '../services/email.js';
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
export async function createDeliveryForCampaign(campaign, brand, price) {
  const creatorId = idOf(campaign.selectedCreator);
  if (!creatorId) throw new Error('Aucun créateur sélectionné');

  const existing = await Delivery.findOne({ campaignId: campaign._id });
  if (existing) return { delivery: existing, warning: null };

  const application = campaign.applications.find(app => idOf(app.creatorId) === creatorId);
  const amount = price ?? application?.price ?? campaign.budget.total;

  const delivery = new Delivery({
    campaignId: campaign._id,
    creatorId,
    brandId: brand._id,
    payment: { amount, currency: 'EUR' },
    status: 'pending',
  });
  delivery.calculatePaymentAmounts();

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

  await delivery.save();
  logger.info(`Delivery created: ${delivery._id} for campaign ${campaign._id} (payment ${delivery.payment.status})`);

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
    await delivery.save();

    // Notify brand (non bloquant)
    sendDeliverySubmitted(
      delivery.brandId.email,
      delivery.brandId.profile.companyName || delivery.brandId.profile.name,
      delivery.campaignId.title,
      delivery._id
    ).catch(err => logger.error('Failed to send notification:', err.message));

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

  // Clôture la campagne
  await Campaign.updateOne({ _id: idOf(delivery.campaignId) }, { $set: { status: 'completed' } });

  // Stats créateur : missions complétées + taux de livraison à temps
  if (creator) {
    await User.updateOne({ _id: creator._id }, { $inc: { 'profile.stats.completedJobs': 1 } });
  }

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

    if (!delivery.canRequestRevision) {
      return res.status(400).json({
        error: `Nombre maximum de révisions atteint (${config.business.maxRevisions}) ou statut invalide`
      });
    }

    delivery.requestRevision(feedback);
    await delivery.save();

    // Notify creator (non bloquant)
    sendRevisionRequested(
      delivery.creatorId.email,
      delivery.creatorId.profile.name,
      delivery.campaignId.title,
      feedback,
      delivery._id
    ).catch(err => logger.error('Failed to send notification:', err.message));

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

    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let [deliveries, total] = await Promise.all([
      Delivery.find(query)
        .populate('campaignId', 'title')
        .populate('creatorId', 'profile.name profile.avatar')
        .populate('brandId', 'profile.companyName profile.avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Delivery.countDocuments(query),
    ]);
    deliveries = deliveries.map(d => d.toObject({ virtuals: true }));

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

    // Avis déjà laissés sur cette campagne (pour afficher/masquer le formulaire)
    const reviews = await Review.find({ campaignId: idOf(delivery.campaignId) })
      .populate('reviewerId', 'profile.name role')
      .lean();
    delivery.myReview = reviews.find(r => idOf(r.reviewerId) === user._id.toString()) || null;
    delivery.receivedReview = reviews.find(r => idOf(r.revieweeId) === user._id.toString()) || null;
    delivery.canReview = ['approved', 'auto_approved'].includes(delivery.status) && !delivery.myReview;

    res.json({ delivery });
  } catch (error) {
    logger.error('Failed to get delivery:', error);
    res.status(500).json({ error: 'Failed to get delivery' });
  }
}
