import Joi from 'joi';
import logger from '../utils/logger.js';

/**
 * Validation middleware factory
 */
export function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));
      
      logger.warn('Validation error:', errors);
      
      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }
    
    // Replace body with validated value
    req.body = value;
    next();
  };
}

/**
 * Common validation schemas
 */
export const schemas = {
  // User registration
  registerCreator: Joi.object({
    email: Joi.string().email().required(),
    name: Joi.string().min(2).max(100).required(),
    bio: Joi.string().max(500).allow(''),
    niches: Joi.array().items(Joi.string()).min(1).max(5).required(),
    minPrice: Joi.number().min(50).max(10000).required(),
    referralCode: Joi.string().max(20).allow(''),
  }),
  
  registerBrand: Joi.object({
    email: Joi.string().email().required(),
    companyName: Joi.string().min(2).max(100).required(),
    website: Joi.string().uri().required(),
    industry: Joi.string().required(),
    referralCode: Joi.string().max(20).allow(''),
  }),
  
  // Stripe Connect onboarding
  stripeConnect: Joi.object({
    returnUrl: Joi.string().uri(),
    refreshUrl: Joi.string().uri(),
  }),
  
  ambassadorVideo: Joi.object({
    videoUrl: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
  }),

  // Admin moderation
  moderationReason: Joi.object({
    reason: Joi.string().max(500).allow(''),
  }),
  
  // Campaign creation
  createCampaign: Joi.object({
    title: Joi.string().min(10).max(100).required(),
    description: Joi.string().min(50).max(1000).required(),
    videoType: Joi.string().valid(
      'testimonial', 'unboxing', 'demo', 'tutorial',
      'review', 'comparison', 'lifestyle', 'behind-the-scenes',
      'interview', 'challenge', 'haul', 'vlog'
    ).required(),
    duration: Joi.number().min(15).max(180).required(),
    deliverables: Joi.number().min(1).max(10).required(),
    requirements: Joi.array().items(Joi.string()).max(10),
    budget: Joi.number().min(50).allow(null, ''), // facultatif
    niches: Joi.array().items(Joi.string()).min(1).max(5).required(),
    applicationDeadline: Joi.date().greater('now').required(),
    deliveryTypes: Joi.array().items(Joi.string().valid('file', 'link')).min(1).default(['file', 'link']),
    platforms: Joi.array().items(Joi.string().valid('tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'website', 'other')).max(8).default([]),
    creatorsWanted: Joi.number().integer().min(1).max(20).default(1),
    productShipping: Joi.boolean().default(false),
    productDescription: Joi.string().max(300).allow(''),
  }),

  // Pack prêt à diffuser
  readyPack: Joi.object({
    formats: Joi.array().items(Joi.string().valid('9:16', '1:1', '16:9')).min(1).default(['9:16']),
    subtitles: Joi.boolean().default(false),
    thumbnail: Joi.boolean().default(true),
  }),

  // Brief IA
  aiBrief: Joi.object({
    productDescription: Joi.string().min(10).max(2000).required(),
    videoType: Joi.string().max(40).allow(''),
    platforms: Joi.array().items(Joi.string()).default([]),
    niches: Joi.array().items(Joi.string()).default([]),
    goal: Joi.string().max(300).allow(''),
    tone: Joi.string().max(100).allow(''),
    duration: Joi.number().integer().min(15).max(180).allow(null),
    deliverables: Joi.number().integer().min(1).max(10).allow(null),
  }),

  // Performances d'une vidéo livrée
  performanceUpdate: Joi.object({
    itemId: Joi.string().allow('', null),
    platform: Joi.string().valid('tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'website', 'other').default('other'),
    url: Joi.string().uri({ scheme: ['http', 'https'] }).allow(''),
    views: Joi.number().integer().min(0).default(0),
    likes: Joi.number().integer().min(0).default(0),
    comments: Joi.number().integer().min(0).default(0),
    shares: Joi.number().integer().min(0).default(0),
  }),

  // Envoi de produit
  shippingUpdate: Joi.object({
    action: Joi.string().valid('shipped', 'received', 'not_required').required(),
    carrier: Joi.string().max(60).allow(''),
    trackingNumber: Joi.string().max(80).allow(''),
    trackingUrl: Joi.string().uri({ scheme: ['http', 'https'] }).allow(''),
    note: Joi.string().max(500).allow(''),
  }),
  
  // Application = devis
  quote: Joi.object({
    proposal: Joi.string().max(1000).allow(''),
    price: Joi.number().min(50).max(10000).required(),
    estimatedDeliveryDays: Joi.number().min(1).max(60).required(),
    rights: Joi.object({
      duration: Joi.string().valid('6m', '1y', '2y', '3y', 'unlimited').default('1y'),
      supports: Joi.array().items(Joi.string().valid('social_organic', 'paid_ads', 'website', 'email', 'marketplace', 'tv', 'other')).default(['social_organic']),
      territories: Joi.string().max(200).allow('').default('France'),
      exclusivity: Joi.boolean().default(false),
      exclusivityMonths: Joi.number().integer().min(1).max(36).allow(null),
    }).default(),
    deliveryTypes: Joi.array().items(Joi.string().valid('file', 'link')).min(1).default(['file', 'link']),
    platforms: Joi.array().items(Joi.string().valid('tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'website', 'other')).default([]),
    revisions: Joi.number().integer().min(0).max(5).default(2),
    terms: Joi.string().max(2000).allow(''),
  }),

  // Liens de livraison
  deliveryLinks: Joi.object({
    links: Joi.array().items(Joi.object({
      url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
      title: Joi.string().max(200).allow(''),
      platform: Joi.string().valid('tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'drive', 'other'),
      public: Joi.boolean().default(true),
    })).min(1).max(10).required(),
  }),

  // Visibilité d'un lien (créateur ou marque)
  linkVisibility: Joi.object({
    public: Joi.boolean().required(),
  }),
  
  // Review
  createReview: Joi.object({
    rating: Joi.number().min(1).max(5).required(),
    comment: Joi.string().max(500).allow(''),
    communication: Joi.number().min(1).max(5).required(),
    quality: Joi.number().min(1).max(5).required(),
    timeliness: Joi.number().min(1).max(5).required(),
    professionalism: Joi.number().min(1).max(5).required(),
  }),
  
  // Revision request
  requestRevision: Joi.object({
    feedback: Joi.string().min(20).max(1000).required(),
  }),
};
