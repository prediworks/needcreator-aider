import Review from '../models/Review.js';
import Campaign from '../models/Campaign.js';
import User from '../models/User.js';
import Delivery from '../models/Delivery.js';
import logger from '../utils/logger.js';
import { getSetting, SETTINGS } from '../models/Setting.js';
import { sendReviewNudge, sendReviewsPublished, sendReviewResponse } from '../services/email.js';
import { notify } from '../services/notifications.js';

const idOf = (v) => (v && v._id ? v._id : v)?.toString();

/** Publie un avis et met à jour la note du destinataire */
export async function publishReview(review) {
  if (review.publishedAt) return review;
  review.publishedAt = new Date();
  await review.save();
  const stats = await Review.calculateAverageRating(review.revieweeId);
  await User.findByIdAndUpdate(review.revieweeId, { 'profile.stats.rating': stats.avgRating, 'profile.stats.totalReviews': stats.totalReviews });
  return review;
}

/** Tâche planifiée : publie les avis dont le délai d'attente de l'autre partie est écoulé */
export async function publishExpiredReviews() {
  const due = await Review.find({ publishedAt: null, publishDeadline: { $lte: new Date() } }).populate('campaignId', 'title').populate('revieweeId', 'email profile.name profile.companyName').populate('reviewerId', 'profile.name profile.companyName');
  let n = 0;
  for (const r of due) {
    try {
      await publishReview(r);
      const reviewer = r.reviewerId?.profile?.companyName || r.reviewerId?.profile?.name;
      notify(idOf(r.revieweeId), { type: 'system', title: `Avis publié : ${reviewer} vous a noté`, text: r.campaignId?.title, href: '/profile' }).catch(() => {});
      if (r.revieweeId?.email) sendReviewsPublished(r.revieweeId.email, r.revieweeId.profile?.companyName || r.revieweeId.profile?.name, reviewer, r.campaignId?.title).catch(() => {});
      n++;
    } catch (err) { logger.error(`publishExpiredReviews failed for ${r._id}: ${err.message}`); }
  }
  return n;
}

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
    
    // Determine reviewee (multi-créateurs : la marque note un créateur précis via ?creatorId=)
    let revieweeId;
    if (reviewer.role === 'brand') {
      const targetCreator = req.query.creatorId || req.body.creatorId;
      const selected = (campaign.selectedCreators || []).map(String);
      if (targetCreator && selected.includes(String(targetCreator))) revieweeId = targetCreator;
      else if (selected.length <= 1 || !targetCreator) revieweeId = campaign.selectedCreators?.[0] || campaign.selectedCreator;
      else return res.status(400).json({ error: 'Créateur invalide pour cette campagne' });
    } else if (reviewer.role === 'creator') {
      revieweeId = campaign.brandId;
    } else {
      return res.status(403).json({ error: 'Invalid role' });
    }
    if (!revieweeId) return res.status(400).json({ error: 'Aucun destinataire pour cet avis' });

    // Check if already reviewed
    const existingReview = await Review.findOne({
      campaignId,
      reviewerId: reviewer._id,
      revieweeId,
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
    
    // Double aveugle : publié tout de suite si l'autre partie a déjà noté, sinon caché jusqu'à son avis ou la date limite
    const counterpart = await Review.findOne({ campaignId, reviewerId: revieweeId, revieweeId: reviewer._id });
    const days = await getSetting(SETTINGS.reviewPublishDays.key, SETTINGS.reviewPublishDays.default);
    review.publishDeadline = new Date(Date.now() + days * 86400000);
    await review.save();
    const other = await User.findById(revieweeId).select('email profile.name profile.companyName');
    const otherName = other?.profile?.companyName || other?.profile?.name;
    const myName = reviewer.profile?.companyName || reviewer.profile?.name;
    if (counterpart) {
      await publishReview(review);
      if (!counterpart.publishedAt) await publishReview(counterpart);
      if (other?.email) sendReviewsPublished(other.email, otherName, myName, campaign.title).catch(() => {});
      notify(idOf(revieweeId), { type: 'system', title: `Avis publiés : ${myName} vous a noté`, text: campaign.title, href: '/profile' }).catch(() => {});
    } else {
      if (other?.email) sendReviewNudge(other.email, otherName, myName, campaign.title, review.publishDeadline, campaignId).catch(() => {});
      notify(idOf(revieweeId), { type: 'system', title: `${myName} a laissé un avis sur « ${campaign.title} »`, text: 'Laissez le vôtre pour le découvrir.', href: `/campaigns/${campaignId}` }).catch(() => {});
    }
    
    logger.info(`Review created: ${review._id} for campaign ${campaignId} (${counterpart ? 'published' : 'hidden until ' + review.publishDeadline.toISOString()})`);
    
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
      Review.find({ revieweeId: userId, isPublic: true, publishedAt: { $ne: null } })
        .populate('reviewerId', 'profile.name profile.avatar role')
        .populate('campaignId', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Review.countDocuments({ revieweeId: userId, isPublic: true, publishedAt: { $ne: null } }),
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
    
    if (!review.publishedAt) {
      return res.status(400).json({ error: 'Cet avis n\'est pas encore publié' });
    }
    if (review.response?.comment) {
      return res.status(400).json({ error: 'Already responded to this review' });
    }
    if (!comment || String(comment).trim().length < 5 || String(comment).length > 500) {
      return res.status(400).json({ error: 'Réponse de 5 à 500 caractères' });
    }
    
    review.response = {
      comment,
      respondedAt: new Date(),
    };
    
    await review.save();
    
    logger.info(`Response added to review ${review._id}`);
    const [reviewer, campaign] = await Promise.all([User.findById(review.reviewerId).select('email profile.name profile.companyName'), Campaign.findById(review.campaignId).select('title')]);
    const me = user.profile?.companyName || user.profile?.name;
    if (reviewer?.email) sendReviewResponse(reviewer.email, reviewer.profile?.companyName || reviewer.profile?.name, me, campaign?.title, comment).catch(() => {});
    notify(idOf(review.reviewerId), { type: 'system', title: `${me} a répondu à votre avis`, text: campaign?.title, href: '/profile' }).catch(() => {});
    
    res.json({
      message: 'Response added successfully',
      review,
    });
  } catch (error) {
    logger.error('Failed to respond to review:', error);
    res.status(500).json({ error: 'Failed to respond to review' });
  }
}
