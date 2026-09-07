import User from '../models/User.js';
import Review from '../models/Review.js';
import { uploadVideo, deleteFile, keyFromUrl, resolveUrlsIn } from '../services/storage.js';
import { publicRealisations } from './deliveries.js';
import { levelFor, badgesFor } from '../utils/badges.js';
import logger from '../utils/logger.js';

/**
 * Upload portfolio video
 */
export async function uploadPortfolioVideo(req, res) {
  try {
    const creator = req.user;
    const file = req.file;
    const { title, description, videoType } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (creator.role !== 'creator') {
      return res.status(403).json({ error: 'Only creators can upload portfolio videos' });
    }

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Le titre de la vidéo est obligatoire' });
    }

    // Upload video
    const { url } = await uploadVideo(
      file.buffer,
      file.originalname,
      {
        userId: creator._id.toString(),
        title,
        videoType,
      },
      file.mimetype || 'video/mp4'
    );

    // Add to portfolio
    creator.profile.portfolio.push({
      videoUrl: url,
      thumbnail: null, // TODO: Generate thumbnail
      title,
      description,
      videoType,
      uploadedAt: new Date(),
    });

    await creator.save();

    logger.info(`Portfolio video uploaded: ${creator._id}`);

    const video = creator.profile.portfolio[creator.profile.portfolio.length - 1].toObject();
    const [resolved] = await resolveUrlsIn([video]);

    res.status(201).json({
      message: 'Video uploaded successfully',
      video: resolved,
      portfolioCount: creator.profile.portfolio.length,
    });
  } catch (error) {
    logger.error('Failed to upload portfolio video:', error);
    res.status(500).json({ error: `Échec de l'upload : ${error.message}` });
  }
}

/**
 * Delete portfolio video
 */
export async function deletePortfolioVideo(req, res) {
  try {
    const creator = req.user;
    const { videoId } = req.params;

    if (creator.role !== 'creator') {
      return res.status(403).json({ error: 'Only creators can delete portfolio videos' });
    }

    const videoIndex = creator.profile.portfolio.findIndex(
      v => v._id.toString() === videoId
    );

    if (videoIndex === -1) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const video = creator.profile.portfolio[videoIndex];

    // Delete from storage
    const key = keyFromUrl(video.videoUrl);
    if (key) {
      await deleteFile(key).catch(err =>
        logger.error('Failed to delete file from storage:', err.message)
      );
    }

    // Remove from portfolio
    creator.profile.portfolio.splice(videoIndex, 1);
    await creator.save();

    logger.info(`Portfolio video deleted: ${creator._id}, video: ${videoId}`);

    res.json({
      message: 'Video deleted successfully',
      portfolioCount: creator.profile.portfolio.length,
    });
  } catch (error) {
    logger.error('Failed to delete portfolio video:', error);
    res.status(500).json({ error: 'Failed to delete video' });
  }
}

/**
 * Get creator portfolio (public)
 */
export async function getCreatorPortfolio(req, res) {
  try {
    const { creatorId } = req.params;

    const creator = await User.findOne({
      _id: creatorId,
      role: 'creator',
      status: 'active',
    })
      .select('profile.name profile.avatar profile.bio profile.portfolio profile.stats profile.niches profile.pricing profile.ambassador.status createdAt')
      .lean();

    if (!creator) {
      return res.status(404).json({ error: 'Creator not found' });
    }

    creator.profile.portfolio = await resolveUrlsIn(creator.profile.portfolio || []);

    // Derniers avis reçus
    const reviews = await Review.find({ revieweeId: creatorId, isPublic: true })
      .populate('reviewerId', 'profile.name profile.companyName')
      .populate('campaignId', 'title')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const realisations = await publicRealisations(creatorId, req.user?._id);

    res.json({
      creator: { ...creator, id: creator._id, level: levelFor(creator.profile?.stats), badges: badgesFor(creator) },
      reviews,
      realisations,
    });
  } catch (error) {
    logger.error('Failed to get creator portfolio:', error);
    res.status(500).json({ error: 'Failed to get portfolio' });
  }
}
