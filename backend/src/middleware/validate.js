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
    bio: Joi.string().max(500),
    niches: Joi.array().items(Joi.string()).min(1).max(5).required(),
    minPrice: Joi.number().min(50).max(10000).required(),
  }),
  
  registerBrand: Joi.object({
    email: Joi.string().email().required(),
    companyName: Joi.string().min(2).max(100).required(),
    website: Joi.string().uri().required(),
    industry: Joi.string().required(),
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
    budget: Joi.number().min(50).required(),
    niches: Joi.array().items(Joi.string()).min(1).max(5).required(),
    applicationDeadline: Joi.date().greater('now').required(),
  }),
  
  // Application
  applyToCampaign: Joi.object({
    proposal: Joi.string().max(500),
    price: Joi.number().min(50).max(10000).required(),
    estimatedDeliveryDays: Joi.number().min(1).max(30).required(),
  }),
  
  // Review
  createReview: Joi.object({
    rating: Joi.number().min(1).max(5).required(),
    comment: Joi.string().max(500),
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
