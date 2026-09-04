import Review from '../models/Review.js';
import Campaign from '../models/Campaign.js';
import User from '../models/User.js';
import Delivery from '../models/Delivery.js';
import logger from '../utils/logger.js';

/**
 * Create review
 */
export async function createReview(req, res) {
  try {
    const { campaignId } = req.params;
    const reviewer = req.user;
    const { rating, comment, communication, quality, timeliness, professionalism } = req.body;
    
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.status !== 'completed') {
      return res.status(400).json({ error: 'Campaign not completed yet' });
    }
    
    // Determine reviewee
    let revieweeId;
    if (reviewer.role === 'brand') {
      revieweeId = campaign.selectedCreator;
    } else if (reviewer.role === 'creator') {
      revieweeId = campaign.brandId;
    } else {
      return res.status(403).json({ error: 'Invalid role' });
    }
    
    // Check if already reviewed
    const existingReview = await Review.findOne({
      campaignId,
      reviewerId: reviewer._id,
    });
    
    if (existingReview) {
      return res.status(400).json({ error: 'Already reviewed this campaign' });
    }
    
    const review = new Review({
      campaignId,
      reviewerId: reviewer._id,
      revieweeId,
      rating,
      comment,
      criteria: {
        communication,
        quality,
        timeliness,
        professionalism,
      },
    });
    
    await review.save();
    
    // Update user stats
    const stats = await Review.calculateAverageRating(revieweeId);
    await User.findByIdAndUpdate(revieweeId, {
      'profile.stats.rating': stats.avgRating,
      'profile.stats.totalReviews': stats.totalReviews,
    });
    
    logger.info(`Review created: ${review._id} for campaign ${campaignId}`);
    
    res.status(201).json({
      message: 'Review submitted successfully',
      review,
    });
  } catch (error) {
    logger.error('Failed to create review:', error);
    res.status(500).json({ error: 'Failed to create review' });
  }
}

/**
 * Get reviews for a user
 */
export async function getUserReviews(req, res) {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [reviews, total, stats] = await Promise.all([
      Review.find({ revieweeId: userId, isPublic: true })
        .populate('reviewerId', 'profile.name profile.avatar role')
        .populate('campaignId', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Review.countDocuments({ revieweeId: userId, isPublic: true }),
      Review.calculateAverageRating(userId),
    ]);
    
    res.json({
      reviews,
      stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Failed to get reviews:', error);
    res.status(500).json({ error: 'Failed to get reviews' });
  }
}

/**
 * Respond to review
 */
export async function respondToReview(req, res) {
  try {
    const { reviewId } = req.params;
    const { comment } = req.body;
    const user = req.user;
    
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }
    
    if (review.revieweeId.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'Can only respond to your own reviews' });
    }
    
    if (review.response?.comment) {
      return res.status(400).json({ error: 'Already responded to this review' });
    }
    
    review.response = {
      comment,
      respondedAt: new Date(),
    };
    
    await review.save();
    
    logger.info(`Response added to review ${review._id}`);
    
    res.json({
      message: 'Response added successfully',
      review,
    });
  } catch (error) {
    logger.error('Failed to respond to review:', error);
    res.status(500).json({ error: 'Failed to respond to review' });
  }
}
