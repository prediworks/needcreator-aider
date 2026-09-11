import User from '../models/User.js';
import Delivery from '../models/Delivery.js';
import { config } from '../config/index.js';
import { levelFor, badgesFor } from '../utils/badges.js';
import { resolveUrl } from '../services/storage.js';
import { resolveUrlsIn } from '../services/storage.js';
import logger from '../utils/logger.js';

/**
 * Recherche de créateurs (marques) avec filtres, et liste des collaborateurs
 * ?q= &niches=a,b &minPrice &maxPrice &minRating &level=new|confirmed|expert|ambassador
 * &network=tiktok &minFollowers &collaborated=true &sort=rating|price|followers|recent &page &limit
 */
export async function searchCreators(req, res) {
  try {
    const brand = req.user;
    const { q, niches, minPrice, maxPrice, minRating, level, network, minFollowers, collaborated, sort = 'rating', page = 1, limit = 12 } = req.query;

    const query = { role: 'creator', status: 'active' };
    if (niches) query['profile.niches'] = { $in: String(niches).split(',').filter(Boolean) };
    if (minPrice || maxPrice) {
      query['profile.pricing.minPrice'] = {};
      if (minPrice) query['profile.pricing.minPrice'].$gte = parseInt(minPrice);
      if (maxPrice) query['profile.pricing.minPrice'].$lte = parseInt(maxPrice);
    }
    if (minRating) query['profile.stats.rating'] = { $gte: parseFloat(minRating) };
    if (network) query['profile.socials.network'] = network;
    if (minFollowers) query['profile.stats.totalFollowers'] = { $gte: parseInt(minFollowers) };
    if (q && String(q).trim()) {
      const regex = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ 'profile.name': regex }, { 'profile.bio': regex }, { 'profile.socials.handle': regex }];
    }
    if (level === 'ambassador') query['profile.ambassador.status'] = 'approved';
    else if (level === 'confirmed') {
      query['profile.stats.completedJobs'] = { $gte: config.badges.confirmedJobs };
      query['profile.stats.rating'] = { ...(query['profile.stats.rating'] || {}), $gte: Math.max(config.badges.confirmedRating, parseFloat(minRating) || 0) };
    } else if (level === 'expert') {
      query['profile.stats.completedJobs'] = { $gte: config.badges.expertJobs };
      query['profile.stats.rating'] = { ...(query['profile.stats.rating'] || {}), $gte: Math.max(config.badges.expertRating, parseFloat(minRating) || 0) };
    }

    // Collaborateurs : créateurs ayant une livraison avec cette marque
    let collaboratorIds = null;
    if (brand.role === 'brand') {
      collaboratorIds = await Delivery.distinct('creatorId', { brandId: brand._id });
      if (collaborated === 'true') query._id = { $in: collaboratorIds };
    }

    // Les Ambassadeurs sont mis en avant : en tête à critère égal
    const sortMap = {
      rating: { 'profile.isAmbassador': -1, 'profile.stats.rating': -1, 'profile.stats.completedJobs': -1 },
      price: { 'profile.pricing.minPrice': 1, 'profile.isAmbassador': -1 },
      followers: { 'profile.stats.totalFollowers': -1, 'profile.isAmbassador': -1 },
      recent: { createdAt: -1 },
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [creators, total] = await Promise.all([
      User.find(query)
        .select('profile.name profile.avatar profile.bio profile.niches profile.pricing profile.stats profile.socials profile.portfolio profile.realisations profile.ambassador.status profile.availability profile.academy createdAt')
        .sort(sortMap[sort] || sortMap.rating)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    const collabSet = new Set((collaboratorIds || []).map(String));
    const { default: DeliveryModel } = await import('../models/Delivery.js');
    const loadAgg = await DeliveryModel.aggregate([{ $match: { creatorId: { $in: creators.map(c => c._id) }, status: { $in: ['pending', 'revision_requested', 'submitted'] } } }, { $group: { _id: '$creatorId', n: { $sum: 1 } } }]);
    const loadMap = new Map(loadAgg.map(x => [String(x._id), x.n]));
    const out = await Promise.all(creators.map(async c => {
      const firstVideo = c.profile.portfolio?.[0];
      const until = c.profile.availability?.unavailableUntil;
      return {
        id: c._id,
        unavailableUntil: until && new Date(until) > new Date() ? until : null,
        activeMissions: loadMap.get(String(c._id)) || 0,
        name: c.profile.name,
        avatar: c.profile.avatar,
        bio: c.profile.bio,
        niches: c.profile.niches,
        minPrice: c.profile.pricing?.minPrice,
        stats: c.profile.stats,
        level: levelFor(c.profile.stats),
        badges: badgesFor(c),
        socials: (c.profile.socials || []).map(sn => ({ network: sn.network, url: sn.url, handle: sn.handle, followers: sn.followers })),
        portfolioCount: c.profile.portfolio?.length || 0,
        realisationsCount: c.profile.realisations?.length || 0,
        previewVideo: firstVideo ? await resolveUrl(firstVideo.videoUrl) : null,
        collaborated: collabSet.has(String(c._id)),
        memberSince: c.createdAt,
      };
    }));

    res.json({
      creators: out,
      collaboratorsCount: collaboratorIds ? collaboratorIds.length : 0,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    logger.error('Failed to search creators:', error);
    res.status(500).json({ error: 'Failed to search creators' });
  }
}


/**
 * Site public : créateurs inscrits ayant donné leur accord (fiche + première vidéo de portfolio).
 * ?featured=1 : Ambassadeurs ayant aussi autorisé la communication (page d'accueil).
 */
export async function publicCreators(req, res) {
  try {
    const { featured, niche, page = 1, limit = 24 } = req.query;
    const query = { role: 'creator', status: 'active', 'verification.portfolio': true, 'profile.publicConsent.site': true };
    if (featured === '1') { query['profile.isAmbassador'] = true; query['profile.publicConsent.marketing'] = true; }
    if (niche) query['profile.niches'] = String(niche);
    const pageN = Math.max(1, parseInt(page, 10) || 1);
    const limitN = Math.min(60, Math.max(1, parseInt(limit, 10) || 24));
    const [creators, total] = await Promise.all([
      User.find(query)
        .select('profile.name profile.bio profile.niches profile.stats profile.portfolio profile.isAmbassador profile.ambassador.status profile.socials createdAt')
        .sort({ 'profile.isAmbassador': -1, 'profile.stats.completedJobs': -1, 'profile.stats.rating': -1, createdAt: -1 })
        .skip((pageN - 1) * limitN).limit(limitN).lean(),
      User.countDocuments(query),
    ]);
    const out = await Promise.all(creators.map(async c => {
      const [video] = c.profile.portfolio?.length ? await resolveUrlsIn([c.profile.portfolio[0]]) : [null];
      return {
        id: c._id,
        name: c.profile.name,
        bio: c.profile.bio,
        niches: c.profile.niches,
        level: levelFor(c.profile.stats),
        badges: badgesFor(c),
        isAmbassador: !!c.profile.isAmbassador,
        completedJobs: c.profile.stats?.completedJobs || 0,
        rating: c.profile.stats?.rating || 0,
        followers: c.profile.stats?.totalFollowers || 0,
        socials: (c.profile.socials || []).map(sn => ({ network: sn.network, url: sn.url })),
        video: video ? { url: video.videoUrl, title: video.title } : null,
        portfolioCount: c.profile.portfolio?.length || 0,
      };
    }));
    res.json({ creators: out, pagination: { page: pageN, limit: limitN, total, pages: Math.ceil(total / limitN) } });
  } catch (error) {
    logger.error('publicCreators failed:', error);
    res.status(500).json({ error: 'Annuaire indisponible' });
  }
}
