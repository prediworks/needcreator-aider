import User from '../models/User.js';
import { uploadVideo, deleteFile } from '../services/storage.js';
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
    
    // Upload video
    const { url, filename } = await uploadVideo(
      file.buffer,
      file.originalname,
      {
        userId: creator._id.toString(),
        title,
        videoType,
      }
    );
    
    // Add to portfolio
    creator.profile.portfolio.push({
      videoUrl: url,
      thumbnail: url, // TODO: Generate thumbnail
      title,
      description,
      videoType,
      uploadedAt: new Date(),
    });
    
    await creator.save();
    
    logger.info(`Portfolio video uploaded: ${creator._id}`);
    
    res.status(201).json({
      message: 'Video uploaded successfully',
      video: creator.profile.portfolio[creator.profile.portfolio.length - 1],
    });
  } catch (error) {
    logger.error('Failed to upload portfolio video:', error);
    res.status(500).json({ error: 'Failed to upload video' });
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
    const filename = video.videoUrl.split('/').pop();
    await deleteFile(`videos/${filename}`).catch(err => 
      logger.error('Failed to delete file from storage:', err)
    );
    
    // Remove from portfolio
    creator.profile.portfolio.splice(videoIndex, 1);
    await creator.save();
    
    logger.info(`Portfolio video deleted: ${creator._id}, video: ${videoId}`);
    
    res.json({
      message: 'Video deleted successfully',
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
      .select('profile.name profile.avatar profile.bio profile.portfolio profile.stats profile.niches')
      .lean();
    
    if (!creator) {
      return res.status(404).json({ error: 'Creator not found' });
    }
    
    res.json({ creator });
  } catch (error) {
    logger.error('Failed to get creator portfolio:', error);
    res.status(500).json({ error: 'Failed to get portfolio' });
  }
}
