import Campaign from '../models/Campaign.js';
import User from '../models/User.js';
import { sendNewCampaignNotification, sendApplicationReceived } from '../services/email.js';
import logger from '../utils/logger.js';

/**
 * Create new campaign
 */
export async function createCampaign(req, res) {
  try {
    const brand = req.user;
    
    if (!brand.canCreateCampaign()) {
      return res.status(403).json({ 
        error: 'Complete your profile and payment setup first' 
      });
    }
    
    const {
      title,
      description,
      videoType,
      duration,
      deliverables,
      requirements,
      budget,
      niches,
      applicationDeadline,
    } = req.body;
    
    const campaign = new Campaign({
      brandId: brand._id,
      title,
      description,
      brief: {
        videoType,
        duration,
        deliverables,
        requirements: requirements || [],
      },
      budget: {
        total: budget,
        perVideo: Math.round(budget / deliverables),
      },
      matching: {
        niches,
      },
      timeline: {
        applicationDeadline: new Date(applicationDeadline),
      },
      status: 'draft',
    });
    
    await campaign.save();
    
    logger.info(`Campaign created: ${campaign._id} by brand ${brand._id}`);
    
    res.status(201).json({
      message: 'Campaign created successfully',
      campaign,
    });
  } catch (error) {
    logger.error('Failed to create campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
}

/**
 * Publish campaign (draft → active)
 */
export async function publishCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const brand = req.user;
    
    const campaign = await Campaign.findOne({
      _id: campaignId,
      brandId: brand._id,
    });
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.status !== 'draft') {
      return res.status(400).json({ error: 'Campaign already published' });
    }
    
    campaign.status = 'active';
    campaign.timeline.publishedAt = new Date();
    await campaign.save();
    
    // Notify matching creators
    const matchingCreators = await User.find({
      role: 'creator',
      status: 'active',
      'profile.niches': { $in: campaign.matching.niches },
    }).limit(100);
    
    const notificationPromises = matchingCreators.map(creator =>
      sendNewCampaignNotification(
        creator.email,
        creator.profile.name,
        campaign.title,
        campaign._id
      ).catch(err => logger.error('Failed to send notification:', err))
    );
    
    await Promise.allSettled(notificationPromises);
    
    logger.info(`Campaign published: ${campaign._id}, notified ${matchingCreators.length} creators`);
    
    res.json({
      message: 'Campaign published successfully',
      campaign,
      notifiedCreators: matchingCreators.length,
    });
  } catch (error) {
    logger.error('Failed to publish campaign:', error);
    res.status(500).json({ error: 'Failed to publish campaign' });
  }
}

/**
 * Get campaigns (with filters)
 */
export async function getCampaigns(req, res) {
  try {
    const user = req.user;
    const { status, niche, minBudget, maxBudget, page = 1, limit = 20 } = req.query;
    
    let query = {};
    
    // Role-based filtering
    if (user.role === 'brand') {
      query.brandId = user._id;
    } else if (user.role === 'creator') {
      // Only show active campaigns for creators
      query.status = 'active';
      query.selectedCreator = null;
      
      // Match creator's niches
      if (user.profile.niches?.length > 0) {
        query['matching.niches'] = { $in: user.profile.niches };
      }
    }
    
    // Additional filters
    if (status) query.status = status;
    if (niche) query['matching.niches'] = niche;
    if (minBudget || maxBudget) {
      query['budget.total'] = {};
      if (minBudget) query['budget.total'].$gte = parseInt(minBudget);
      if (maxBudget) query['budget.total'].$lte = parseInt(maxBudget);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [campaigns, total] = await Promise.all([
      Campaign.find(query)
        .populate('brandId', 'profile.companyName profile.avatar')
        .sort({ 'timeline.publishedAt': -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Campaign.countDocuments(query),
    ]);
    
    res.json({
      campaigns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Failed to get campaigns:', error);
    res.status(500).json({ error: 'Failed to get campaigns' });
  }
}

/**
 * Get single campaign
 */
export async function getCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const user = req.user;
    
    const campaign = await Campaign.findById(campaignId)
      .populate('brandId', 'profile.companyName profile.avatar profile.website')
      .populate('applications.creatorId', 'profile.name profile.avatar profile.stats')
      .lean();
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    // Check access rights
    if (user.role === 'creator' && campaign.status !== 'active') {
      return res.status(403).json({ error: 'Campaign not available' });
    }
    
    if (user.role === 'brand' && campaign.brandId._id.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Add user-specific data
    if (user.role === 'creator') {
      const hasApplied = campaign.applications.some(
        app => app.creatorId._id.toString() === user._id.toString()
      );
      campaign.userHasApplied = hasApplied;
      campaign.canApply = Campaign.prototype.canApply.call(campaign, user._id);
    }
    
    res.json({ campaign });
  } catch (error) {
    logger.error('Failed to get campaign:', error);
    res.status(500).json({ error: 'Failed to get campaign' });
  }
}

/**
 * Apply to campaign (creator)
 */
export async function applyToCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const { proposal, price, estimatedDeliveryDays } = req.body;
    const creator = req.user;
    
    if (!creator.canApplyToCampaign()) {
      return res.status(403).json({ 
        error: 'Complete your profile and portfolio first' 
      });
    }
    
    const campaign = await Campaign.findById(campaignId)
      .populate('brandId', 'email profile.companyName profile.name');
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (!campaign.canApply(creator._id)) {
      return res.status(400).json({ error: 'Cannot apply to this campaign' });
    }
    
    // Calculate match score (simple version for MVP)
    const nicheMatch = campaign.matching.niches.filter(
      n => creator.profile.niches.includes(n)
    ).length / campaign.matching.niches.length;
    
    const matchScore = Math.round(nicheMatch * 100);
    
    campaign.applications.push({
      creatorId: creator._id,
      proposal,
      price,
      estimatedDeliveryDays,
      matchScore,
      status: 'pending',
    });
    
    campaign.analytics.applications = (campaign.analytics.applications || 0) + 1;
    
    await campaign.save();
    
    // Notify brand
    await sendApplicationReceived(
      campaign.brandId.email,
      campaign.brandId.profile.companyName || campaign.brandId.profile.name,
      creator.profile.name,
      campaign.title
    ).catch(err => logger.error('Failed to send notification:', err));
    
    logger.info(`Creator ${creator._id} applied to campaign ${campaign._id}`);
    
    res.status(201).json({
      message: 'Application submitted successfully',
      application: campaign.applications[campaign.applications.length - 1],
    });
  } catch (error) {
    logger.error('Failed to apply to campaign:', error);
    res.status(500).json({ error: 'Failed to apply to campaign' });
  }
}

/**
 * Select creator for campaign (brand)
 */
export async function selectCreator(req, res) {
  try {
    const { campaignId, creatorId } = req.params;
    const brand = req.user;
    
    const campaign = await Campaign.findOne({
      _id: campaignId,
      brandId: brand._id,
    }).populate('applications.creatorId', 'email profile.name stripeAccountId');
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.selectedCreator) {
      return res.status(400).json({ error: 'Creator already selected' });
    }
    
    const application = campaign.applications.find(
      app => app.creatorId._id.toString() === creatorId
    );
    
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }
    
    campaign.selectCreator(creatorId);
    await campaign.save();
    
    logger.info(`Creator ${creatorId} selected for campaign ${campaign._id}`);
    
    res.json({
      message: 'Creator selected successfully',
      campaign,
    });
  } catch (error) {
    logger.error('Failed to select creator:', error);
    res.status(500).json({ error: 'Failed to select creator' });
  }
}

/**
 * Update campaign
 */
export async function updateCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const brand = req.user;
    const updates = req.body;
    
    const campaign = await Campaign.findOne({
      _id: campaignId,
      brandId: brand._id,
    });
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.status !== 'draft') {
      return res.status(400).json({ 
        error: 'Cannot update published campaign' 
      });
    }
    
    // Update allowed fields
    const allowedFields = [
      'title', 'description', 'brief', 'budget', 
      'matching', 'timeline'
    ];
    
    allowedFields.forEach(field => {
      if (updates[field]) {
        campaign[field] = { ...campaign[field], ...updates[field] };
      }
    });
    
    await campaign.save();
    
    logger.info(`Campaign updated: ${campaign._id}`);
    
    res.json({
      message: 'Campaign updated successfully',
      campaign,
    });
  } catch (error) {
    logger.error('Failed to update campaign:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
}

/**
 * Cancel campaign
 */
export async function cancelCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const brand = req.user;
    
    const campaign = await Campaign.findOne({
      _id: campaignId,
      brandId: brand._id,
    });
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.selectedCreator) {
      return res.status(400).json({ 
        error: 'Cannot cancel campaign with selected creator' 
      });
    }
    
    campaign.status = 'cancelled';
    await campaign.save();
    
    logger.info(`Campaign cancelled: ${campaign._id}`);
    
    res.json({
      message: 'Campaign cancelled successfully',
      campaign,
    });
  } catch (error) {
    logger.error('Failed to cancel campaign:', error);
    res.status(500).json({ error: 'Failed to cancel campaign' });
  }
}
