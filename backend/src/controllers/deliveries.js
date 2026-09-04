import Delivery from '../models/Delivery.js';
import Campaign from '../models/Campaign.js';
import { createPaymentIntent, captureAndTransfer } from '../services/stripe.js';
import { uploadMultipleFiles } from '../services/storage.js';
import { 
  sendDeliverySubmitted, 
  sendDeliveryApproved, 
  sendRevisionRequested 
} from '../services/email.js';
import logger from '../utils/logger.js';

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
    }).populate('selectedCreator', 'stripeAccountId');
    
    if (!campaign || !campaign.selectedCreator) {
      return res.status(404).json({ error: 'Campaign or creator not found' });
    }
    
    // Check if delivery already exists
    const existingDelivery = await Delivery.findOne({ campaignId });
    if (existingDelivery) {
      return res.status(400).json({ error: 'Delivery already exists' });
    }
    
    // Get application to get price
    const application = campaign.applications.find(
      app => app.creatorId.toString() === campaign.selectedCreator._id.toString()
    );
    
    const delivery = new Delivery({
      campaignId: campaign._id,
      creatorId: campaign.selectedCreator._id,
      brandId: brand._id,
      payment: {
        amount: application.price,
        currency: 'EUR',
      },
      status: 'pending',
    });
    
    delivery.calculatePaymentAmounts();
    
    // Create Stripe payment intent (hold)
    const paymentIntent = await createPaymentIntent(
      delivery.payment.amount,
      delivery.payment.currency,
      brand.stripeCustomerId,
      {
        campaignId: campaign._id.toString(),
        deliveryId: delivery._id.toString(),
      }
    );
    
    delivery.payment.stripePaymentIntentId = paymentIntent.id;
    delivery.payment.status = 'held';
    delivery.payment.heldAt = new Date();
    
    await delivery.save();
    
    logger.info(`Delivery created: ${delivery._id} for campaign ${campaign._id}`);
    
    res.status(201).json({
      message: 'Delivery created successfully',
      delivery,
      paymentIntent: {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
      },
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
    
    // Upload files to storage
    const uploadedFiles = await uploadMultipleFiles(files, 'deliverables');
    
    // Add to delivery
    uploadedFiles.forEach(file => {
      delivery.files.push({
        url: file.url,
        type: 'video', // TODO: detect from mimetype
        filename: file.filename,
        size: files.find(f => f.originalname === file.filename)?.size,
      });
    });
    
    await delivery.save();
    
    logger.info(`Files uploaded to delivery ${delivery._id}: ${uploadedFiles.length} files`);
    
    res.json({
      message: 'Files uploaded successfully',
      files: uploadedFiles,
      delivery,
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
    
    if (delivery.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    if (delivery.status === 'submitted' || delivery.status === 'approved') {
      return res.status(400).json({ error: 'Delivery already submitted' });
    }
    
    delivery.submit();
    if (notes) delivery.notes.creator = notes;
    await delivery.save();
    
    // Notify brand
    await sendDeliverySubmitted(
      delivery.brandId.email,
      delivery.brandId.profile.companyName || delivery.brandId.profile.name,
      delivery.campaignId.title,
      delivery._id
    ).catch(err => logger.error('Failed to send notification:', err));
    
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
      .populate('creatorId', 'email profile.name stripeAccountId');
    
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }
    
    if (delivery.status !== 'submitted') {
      return res.status(400).json({ error: 'Delivery not submitted yet' });
    }
    
    // Capture payment and transfer to creator
    await captureAndTransfer(
      delivery.payment.stripePaymentIntentId,
      delivery.creatorId.stripeAccountId,
      delivery.payment.amount,
      delivery.payment.platformFee
    );
    
    delivery.approve(false);
    await delivery.save();
    
    // Update campaign status
    const campaign = await Campaign.findById(delivery.campaignId);
    if (campaign) {
      campaign.status = 'completed';
      await campaign.save();
    }
    
    // Notify creator
    await sendDeliveryApproved(
      delivery.creatorId.email,
      delivery.creatorId.profile.name,
      delivery.campaignId.title,
      delivery.payment.creatorAmount
    ).catch(err => logger.error('Failed to send notification:', err));
    
    logger.info(`Delivery approved: ${delivery._id}`);
    
    res.json({
      message: 'Delivery approved successfully',
      delivery,
    });
  } catch (error) {
    logger.error('Failed to approve delivery:', error);
    res.status(500).json({ error: 'Failed to approve delivery' });
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
        error: 'Maximum revisions reached or invalid status' 
      });
    }
    
    delivery.requestRevision(feedback);
    await delivery.save();
    
    // Notify creator
    await sendRevisionRequested(
      delivery.creatorId.email,
      delivery.creatorId.profile.name,
      delivery.campaignId.title,
      feedback,
      delivery._id
    ).catch(err => logger.error('Failed to send notification:', err));
    
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
    
    const [deliveries, total] = await Promise.all([
      Delivery.find(query)
        .populate('campaignId', 'title')
        .populate('creatorId', 'profile.name profile.avatar')
        .populate('brandId', 'profile.companyName profile.avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Delivery.countDocuments(query),
    ]);
    
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
    
    const delivery = await Delivery.findById(deliveryId)
      .populate('campaignId')
      .populate('creatorId', 'profile.name profile.avatar profile.stats')
      .populate('brandId', 'profile.companyName profile.avatar')
      .lean();
    
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }
    
    // Check access rights
    const hasAccess = 
      delivery.brandId._id.toString() === user._id.toString() ||
      delivery.creatorId._id.toString() === user._id.toString();
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({ delivery });
  } catch (error) {
    logger.error('Failed to get delivery:', error);
    res.status(500).json({ error: 'Failed to get delivery' });
  }
}
