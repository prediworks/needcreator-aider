import Joi from 'joi';
import { config } from '../config/index.js';
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
    country: Joi.string().length(2).uppercase().default('FR'),
    language: Joi.string().valid('fr', 'en').default('fr'),
    acceptTerms: Joi.boolean().valid(true).required().messages({ 'any.only': 'Vous devez accepter les CGU et la politique de confidentialité', 'any.required': 'Vous devez accepter les CGU et la politique de confidentialité' }),
    name: Joi.string().min(2).max(100).required(),
    bio: Joi.string().max(500).allow(''),
    niches: Joi.array().items(Joi.string()).min(1).max(5).required(),
    minPrice: Joi.number().min(config.business.minQuotePrice).max(10000), // facultatif à l'inscription : demandé dans le profil
    referralCode: Joi.string().max(20).allow(''),
  }),
  
  registerBrand: Joi.object({
    email: Joi.string().email().required(),
    country: Joi.string().length(2).uppercase().default('FR'),
    language: Joi.string().valid('fr', 'en').default('fr'),
    acceptTerms: Joi.boolean().valid(true).required().messages({ 'any.only': 'Vous devez accepter les CGU et la politique de confidentialité', 'any.required': 'Vous devez accepter les CGU et la politique de confidentialité' }),
    companyName: Joi.string().min(2).max(100).required(),
    website: Joi.string().uri().allow(''),   // facultatif à l'inscription : demandé dans le profil
    industry: Joi.string().allow(''),
    referralCode: Joi.string().max(20).allow(''),
    teamToken: Joi.string().max(60).allow(''), // invitation à rejoindre l'équipe d'une marque
  }),
  
  // Stripe Connect onboarding
  stripeConnect: Joi.object({
    returnUrl: Joi.string().uri(),
    refreshUrl: Joi.string().uri(),
  }),
  
  // Informations administratives (contrat)
  legalInfoCreator: Joi.object({
    firstName: Joi.string().trim().min(1).max(80).required(),
    lastName: Joi.string().trim().min(1).max(80).required(),
    status: Joi.string().valid('micro', 'company', 'individual').required(),
    companyName: Joi.string().trim().max(120).allow(''),
    siret: Joi.string().trim().pattern(/^[0-9 ]{14,17}$/).allow(''),
    address: Joi.object({
      line1: Joi.string().trim().min(2).max(120).required(),
      line2: Joi.string().trim().max(120).allow(''),
      postalCode: Joi.string().trim().min(4).max(10).required(),
      city: Joi.string().trim().min(1).max(80).required(),
      country: Joi.string().trim().max(60).default('France'),
    }).required(),
    individualAcknowledged: Joi.boolean().default(false),
    vatRegistered: Joi.boolean().default(false),
    vatNumber: Joi.string().trim().max(20).allow(''),
    billingMandate: Joi.boolean().default(false),
  }),
  legalInfoBrand: Joi.object({
    signatoryName: Joi.string().trim().min(2).max(120).required(),
    signatoryTitle: Joi.string().trim().max(80).allow(''),
  }),
  rightsExtensionRequest: Joi.object({ message: Joi.string().max(1000).allow('') }),
  rightsExtensionProposal: Joi.object({
    price: Joi.number().min(0).max(10000).required(),
    duration: Joi.string().valid('6m', '1y', '2y', '3y', 'unlimited').required(),
    note: Joi.string().max(1000).allow(''),
  }),

  // Envoi direct vers R2
  uploadUrl: Joi.object({
    filename: Joi.string().max(255).required(),
    contentType: Joi.string().max(100).required(),
    size: Joi.number().integer().min(1).max(500 * 1024 * 1024).required(),
  }),
  portfolioRegister: Joi.object({
    key: Joi.string().max(300).required(),
    title: Joi.string().trim().min(1).max(120).required(),
    description: Joi.string().max(500).allow(''),
    videoType: Joi.string().max(50).allow(''),
  }),
  deliveryRegister: Joi.object({
    files: Joi.array().items(Joi.object({
      key: Joi.string().max(300).required(),
      filename: Joi.string().max(255).required(),
      contentType: Joi.string().max(100).allow(''),
      size: Joi.number().integer().min(0),
    })).min(1).max(10).required(),
  }),

  ambassadorVideo: Joi.object({
    videoUrl: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
  }),

  // Vérification d'entreprise (marque)
  businessVerification: Joi.object({
    siret: Joi.string().pattern(/^[0-9 ]{14,17}$/).allow(''),
    vatNumber: Joi.string().pattern(/^[A-Za-z]{2}[A-Za-z0-9 ]{2,13}$/).allow(''),
    country: Joi.string().trim().length(2).uppercase().default('FR'),
    registrationNumber: Joi.string().trim().min(4).max(40).allow(''), // hors France : numéro au registre local, contrôle manuel
    website: Joi.string().uri().allow(''),
  }).or('siret', 'vatNumber', 'registrationNumber'),

  // Signalement
  report: Joi.object({
    targetType: Joi.string().valid('campaign', 'user', 'message', 'delivery').required(),
    targetId: Joi.string().hex().length(24).required(),
    reason: Joi.string().valid('free_work', 'off_platform', 'scam', 'inappropriate', 'spam', 'fake', 'other').required(),
    details: Joi.string().max(1000).allow(''),
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
    budget: Joi.number().min(config.business.minQuotePrice).allow(null, ''), // facultatif
    niches: Joi.array().items(Joi.string()).min(1).max(5).required(),
    applicationDeadline: Joi.date().greater('now').required(),
    deliveryTypes: Joi.array().items(Joi.string().valid('file', 'link')).min(1).default(['file', 'link']),
    platforms: Joi.array().items(Joi.string().valid('tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'website', 'other')).max(8).default([]),
    creatorsWanted: Joi.number().integer().min(1).max(20).default(1),
    productShipping: Joi.boolean().default(false),
    visibility: Joi.string().valid('public', 'private').default('public'),
    productDescription: Joi.string().max(300).allow(''),
    type: Joi.string().valid('paid', 'gifting').default('paid'),
    giftingProductName: Joi.string().max(200).allow(''),
    giftingProductValue: Joi.number().min(0).allow(null),
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
  
  // Modification d'un brouillon (mêmes champs que la création, tous optionnels)
  updateCampaign: Joi.object({
    title: Joi.string().min(10).max(100),
    description: Joi.string().min(50).max(1000),
    videoType: Joi.string().valid(
      'testimonial', 'unboxing', 'demo', 'tutorial',
      'review', 'comparison', 'lifestyle', 'behind-the-scenes',
      'interview', 'challenge', 'haul', 'vlog'
    ),
    duration: Joi.number().min(15).max(180),
    deliverables: Joi.number().min(1).max(10),
    requirements: Joi.array().items(Joi.string()).max(10),
    budget: Joi.number().min(config.business.minQuotePrice).allow(null, ''),
    niches: Joi.array().items(Joi.string()).min(1).max(5),
    applicationDeadline: Joi.date().greater('now'),
    deliveryTypes: Joi.array().items(Joi.string().valid('file', 'link')).min(1),
    platforms: Joi.array().items(Joi.string().valid('tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'website', 'other')).max(8),
    creatorsWanted: Joi.number().integer().min(1).max(20),
    productShipping: Joi.boolean(),
    visibility: Joi.string().valid('public', 'private'),
    productDescription: Joi.string().max(300).allow(''),
    type: Joi.string().valid('paid', 'gifting'),
    giftingProductName: Joi.string().max(200).allow(''),
    giftingProductValue: Joi.number().min(0).allow(null),
  }).min(1),

  // Application = devis
  quote: Joi.object({
    proposal: Joi.string().max(1000).allow(''),
    price: Joi.number().min(0).max(10000).required(), // 0 uniquement pour le gifting (contrôlé dans le contrôleur)
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
    revisions: Joi.number().integer().min(0).max(10), // vide = réglage admin « Nombre maximum de révisions »
    terms: Joi.string().max(2000).allow(''),
  }),

  // Contre-proposition de la marque sur un devis
  counterOffer: Joi.object({
    price: Joi.number().min(0).max(10000).required(),
    estimatedDeliveryDays: Joi.number().integer().min(1).max(60),
    revisions: Joi.number().integer().min(0).max(10),
    message: Joi.string().max(1000).allow(''),
  }),
  counterOfferResponse: Joi.object({
    accept: Joi.boolean().required(),
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
  openDispute: Joi.object({
    reason: Joi.string().min(20).max(2000).required(),
  }),
  disputeResponse: Joi.object({
    response: Joi.string().min(10).max(2000).required(),
  }),
  resolveDispute: Joi.object({
    outcome: Joi.string().valid('approve', 'split', 'refund_full').required(),
    creatorPercent: Joi.number().integer().min(0).max(100).when('outcome', { is: 'split', then: Joi.required() }),
    note: Joi.string().min(10).max(2000).required(),
  }),
};
