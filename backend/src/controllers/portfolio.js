import User from '../models/User.js';
import Review from '../models/Review.js';
import Delivery from '../models/Delivery.js';
import { uploadVideo, createUploadUrl, statObject, deleteFile, keyFromUrl, resolveUrlsIn } from '../services/storage.js';
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
 * Envoi direct : lien signé pour déposer une vidéo de portfolio dans R2 depuis le navigateur
 */
export async function getPortfolioUploadUrl(req, res) {
  try {
    const { filename, contentType } = req.body;
    if (!contentType.startsWith('video/')) return res.status(400).json({ error: 'Seuls les fichiers vidéo sont acceptés' });
    const out = await createUploadUrl({ folder: `videos/${req.user._id}`, originalName: filename, contentType });
    res.json(out);
  } catch (error) {
    logger.error('getPortfolioUploadUrl failed:', error);
    res.status(500).json({ error: `Préparation de l'envoi impossible : ${error.message}` });
  }
}

/**
 * Envoi direct : enregistre la vidéo une fois déposée dans R2
 */
export async function registerPortfolioVideo(req, res) {
  try {
    const creator = req.user;
    const { key, title, description, videoType } = req.body;
    if (!key.startsWith(`videos/${creator._id}/`)) return res.status(400).json({ error: 'Clé de fichier invalide' });
    const stat = await statObject(key);
    if (!stat) return res.status(400).json({ error: 'Fichier introuvable : l\'envoi n\'a pas abouti, réessayez' });
    if (creator.profile.portfolio.some(v => keyFromUrl(v.videoUrl) === key)) return res.status(409).json({ error: 'Vidéo déjà enregistrée' });

    creator.profile.portfolio.push({
      videoUrl: `${process.env.CLOUDFLARE_PUBLIC_URL}/${key}`,
      thumbnail: null,
      title,
      description,
      videoType,
      uploadedAt: new Date(),
    });
    await creator.save();

    const video = creator.profile.portfolio[creator.profile.portfolio.length - 1].toObject();
    const [resolved] = await resolveUrlsIn([video]);
    logger.info(`Portfolio video registered (direct upload): ${creator._id} ${key} ${stat.size}o`);
    res.status(201).json({ message: 'Video uploaded successfully', video: resolved, portfolioCount: creator.profile.portfolio.length });
  } catch (error) {
    logger.error('registerPortfolioVideo failed:', error);
    res.status(500).json({ error: `Enregistrement impossible : ${error.message}` });
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
      .select('profile.name profile.avatar profile.bio profile.portfolio profile.stats profile.niches profile.pricing profile.ambassador.status profile.socials profile.realisations profile.availability profile.academy profile.slug createdAt')
      .lean();

    if (!creator) {
      return res.status(404).json({ error: 'Creator not found' });
    }

    creator.profile.portfolio = await resolveUrlsIn(creator.profile.portfolio || []);

    // Derniers avis reçus
    const reviews = await Review.find({ revieweeId: creatorId, isPublic: true, publishedAt: { $ne: null } })
      .populate('reviewerId', 'profile.name profile.companyName')
      .populate('campaignId', 'title')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const fromDeliveries = await publicRealisations(creatorId, req.user?._id);
    const external = (creator.profile.realisations || []).map(r => ({ ...r, source: 'external', isPublic: true, date: r.addedAt }));
    const realisations = [...fromDeliveries, ...external].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    delete creator.profile.realisations;

    // Vues cumulées des vidéos livrées (performances déclarées)
    const perfAgg = await Delivery.aggregate([
      { $match: { creatorId: creator._id, 'performance.0': { $exists: true } } },
      { $unwind: '$performance' },
      { $group: { _id: null, views: { $sum: '$performance.views' }, likes: { $sum: '$performance.likes' } } },
    ]);
    creator.profile.stats = { ...(creator.profile.stats || {}), deliveredViews: perfAgg[0]?.views || 0, deliveredLikes: perfAgg[0]?.likes || 0 };

    // Collaboration passée avec la marque connectée ?
    let collaborated = false;
    if (req.user?.role === 'brand') {
      collaborated = !!(await Delivery.exists({ creatorId, brandId: req.user._id }));
    }

    const activeMissions = await Delivery.countDocuments({ creatorId: creator._id, status: { $in: ['pending', 'revision_requested', 'submitted'] } });
    const unavailableUntil = creator.profile.availability?.unavailableUntil && new Date(creator.profile.availability.unavailableUntil) > new Date() ? creator.profile.availability.unavailableUntil : null;
    const trainedCount = (creator.profile.academy || []).filter(a => a.passed).length;
    delete creator.profile.academy;
    res.json({
      creator: { ...creator, id: creator._id, level: levelFor(creator.profile?.stats), badges: badgesFor(creator), activeMissions, unavailableUntil, availabilityNote: unavailableUntil ? (creator.profile.availability?.note || '') : '', trainedCount, slug: creator.profile.slug || null },
      reviews,
      realisations,
      collaborated,
    });
  } catch (error) {
    logger.error('Failed to get creator portfolio:', error);
    res.status(500).json({ error: 'Failed to get portfolio' });
  }
}
