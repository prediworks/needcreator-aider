import User from '../models/User.js';
import Campaign from '../models/Campaign.js';
import Delivery from '../models/Delivery.js';
import Review from '../models/Review.js';
import { sendCreatorApproved, sendAmbassadorApproved } from '../services/email.js';
import { runScheduledJobs } from '../jobs/autoApproval.js';
import { resolveUrlsIn } from '../services/storage.js';

/**
 * Détail d'un utilisateur (portfolio lisible, même si le créateur est en attente)
 */
export async function getUserDetail(req, res) {
  try {
    const user = await User.findById(req.params.userId).select('-__v').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.profile?.portfolio?.length) {
      user.profile.portfolio = await resolveUrlsIn(user.profile.portfolio);
    }
    res.json({ user: { ...user, id: user._id } });
  } catch (error) {
    logger.error('Failed to get user detail:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
}
import logger from '../utils/logger.js';

/**
 * Ambassadeurs : vidéos en attente de validation
 */
export async function getPendingAmbassadors(req, res) {
  try {
    const creators = await User.find({ role: 'creator', 'profile.ambassador.status': 'pending' })
      .select('email profile.name profile.ambassador profile.niches createdAt')
      .sort({ 'profile.ambassador.submittedAt': 1 })
      .lean();
    res.json({ creators });
  } catch (error) {
    logger.error('Failed to get pending ambassadors:', error);
    res.status(500).json({ error: 'Failed to get pending ambassadors' });
  }
}

export async function reviewAmbassador(req, res) {
  try {
    const { userId } = req.params;
    const approve = req.path.endsWith('/approve');
    const user = await User.findById(userId);
    if (!user || user.role !== 'creator') return res.status(404).json({ error: 'Creator not found' });
    if (!user.profile.ambassador?.videoUrl) return res.status(400).json({ error: 'Aucune vidéo soumise' });
    user.set('profile.ambassador.status', approve ? 'approved' : 'rejected');
    user.set('profile.ambassador.reviewedAt', new Date());
    user.set('profile.ambassador.note', req.body?.reason || null);
    await user.save();
    if (approve) {
      sendAmbassadorApproved(user.email, user.profile.name).catch(err => logger.error('Ambassador email failed:', err.message));
    }
    logger.info(`Ambassador ${approve ? 'approved' : 'rejected'}: ${user._id}`);
    res.json({ message: approve ? 'Badge Ambassadeur attribué' : 'Vidéo refusée', ambassador: user.profile.ambassador });
  } catch (error) {
    logger.error('Failed to review ambassador:', error);
    res.status(500).json({ error: 'Failed to review ambassador' });
  }
}

/**
 * Lance les tâches planifiées à la demande
 */
export async function runJobs(req, res) {
  try {
    const result = await runScheduledJobs();
    res.json({ message: 'Jobs executed', ...result });
  } catch (error) {
    logger.error('Failed to run jobs:', error);
    res.status(500).json({ error: 'Failed to run jobs' });
  }
}

/**
 * Liste toutes les campagnes (supervision)
 */
export async function getAdminCampaigns(req, res) {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const query = status ? { status } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [campaigns, total] = await Promise.all([
      Campaign.find(query)
        .populate('brandId', 'profile.companyName email')
        .populate('selectedCreator', 'profile.name email')
        .select('title status budget timeline analytics brandId selectedCreator createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Campaign.countDocuments(query),
    ]);
    res.json({ campaigns, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (error) {
    logger.error('Failed to get admin campaigns:', error);
    res.status(500).json({ error: 'Failed to get campaigns' });
  }
}

/**
 * Liste toutes les livraisons (supervision / litiges)
 */
export async function getAdminDeliveries(req, res) {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const query = status ? { status } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [deliveries, total] = await Promise.all([
      Delivery.find(query)
        .populate('campaignId', 'title')
        .populate('brandId', 'profile.companyName email')
        .populate('creatorId', 'profile.name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Delivery.countDocuments(query),
    ]);
    res.json({ deliveries, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (error) {
    logger.error('Failed to get admin deliveries:', error);
    res.status(500).json({ error: 'Failed to get deliveries' });
  }
}

/**
 * Get dashboard stats
 */
export async function getDashboardStats(req, res) {
  try {
    const [
      totalUsers,
      totalCreators,
      totalBrands,
      pendingCreators,
      totalCampaigns,
      activeCampaigns,
      completedCampaigns,
      totalDeliveries,
      totalRevenue,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'creator' }),
      User.countDocuments({ role: 'brand' }),
      User.countDocuments({ role: 'creator', status: 'pending' }),
      Campaign.countDocuments(),
      Campaign.countDocuments({ status: 'active' }),
      Campaign.countDocuments({ status: 'completed' }),
      Delivery.countDocuments(),
      Delivery.aggregate([
        { $match: { 'payment.status': 'released' } },
        { $group: { _id: null, total: { $sum: '$payment.platformFee' } } },
      ]),
    ]);
    
    res.json({
      users: {
        total: totalUsers,
        creators: totalCreators,
        brands: totalBrands,
        pendingCreators,
      },
      campaigns: {
        total: totalCampaigns,
        active: activeCampaigns,
        completed: completedCampaigns,
      },
      deliveries: {
        total: totalDeliveries,
      },
      revenue: {
        total: totalRevenue[0]?.total || 0,
      },
    });
  } catch (error) {
    logger.error('Failed to get dashboard stats:', error);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
}

/**
 * Get pending creators for approval
 */
export async function getPendingCreators(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [creators, total] = await Promise.all([
      User.find({ role: 'creator', status: 'pending' })
        .select('email profile createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments({ role: 'creator', status: 'pending' }),
    ]);
    
    res.json({
      creators,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Failed to get pending creators:', error);
    res.status(500).json({ error: 'Failed to get pending creators' });
  }
}

/**
 * Approve creator
 */
export async function approveCreator(req, res) {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.role !== 'creator') {
      return res.status(400).json({ error: 'User is not a creator' });
    }
    
    if (user.status === 'active') {
      return res.status(400).json({ error: 'User is already active' });
    }
    
    user.status = 'active';
    user.verification.portfolio = true;
    await user.save();
    
    // Send approval email
    await sendCreatorApproved(user.email, user.profile.name)
      .catch(err => logger.error('Failed to send approval email:', err));
    
    logger.info(`Creator approved: ${user._id}`);
    
    res.json({
      message: 'Creator approved successfully',
      user,
    });
  } catch (error) {
    logger.error('Failed to approve creator:', error);
    res.status(500).json({ error: 'Failed to approve creator' });
  }
}

/**
 * Reject creator
 */
export async function rejectCreator(req, res) {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.role !== 'creator') {
      return res.status(400).json({ error: 'User is not a creator' });
    }
    
    user.status = 'suspended';
    await user.save();
    
    logger.info(`Creator rejected: ${user._id}, reason: ${reason}`);
    
    res.json({
      message: 'Creator rejected successfully',
      user,
    });
  } catch (error) {
    logger.error('Failed to reject creator:', error);
    res.status(500).json({ error: 'Failed to reject creator' });
  }
}

/**
 * Get all users with filters
 */
export async function getUsers(req, res) {
  try {
    const { role, status, search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let query = {};
    
    if (role) query.role = role;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { 'profile.name': { $regex: search, $options: 'i' } },
        { 'profile.companyName': { $regex: search, $options: 'i' } },
      ];
    }
    
    const [users, total] = await Promise.all([
      User.find(query)
        .select('-__v')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query),
    ]);
    
    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Failed to get users:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
}

/**
 * Suspend user
 */
export async function suspendUser(req, res) {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.status = 'suspended';
    await user.save();
    
    logger.info(`User suspended: ${user._id}, reason: ${reason}`);
    
    res.json({
      message: 'User suspended successfully',
      user,
    });
  } catch (error) {
    logger.error('Failed to suspend user:', error);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
}

/**
 * Reactivate user
 */
export async function reactivateUser(req, res) {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.status = 'active';
    await user.save();
    
    logger.info(`User reactivated: ${user._id}`);
    
    res.json({
      message: 'User reactivated successfully',
      user,
    });
  } catch (error) {
    logger.error('Failed to reactivate user:', error);
    res.status(500).json({ error: 'Failed to reactivate user' });
  }
}
