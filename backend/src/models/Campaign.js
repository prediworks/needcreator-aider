import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema({
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  
  description: {
    type: String,
    required: true,
    maxlength: 1000,
  },
  
  brief: {
    videoType: {
      type: String,
      required: true,
      enum: [
        'testimonial', 'unboxing', 'demo', 'tutorial',
        'review', 'comparison', 'lifestyle', 'behind-the-scenes',
        'interview', 'challenge', 'haul', 'vlog'
      ]
    },
    duration: {
      type: Number, // seconds
      required: true,
      min: 15,
      max: 180,
    },
    deliverables: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    requirements: [String],
    // Modes de livraison acceptés et réseaux de diffusion visés
    deliveryTypes: {
      type: [{ type: String, enum: ['file', 'link'] }],
      default: ['file', 'link'],
    },
    platforms: [{ type: String, enum: ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'website', 'other'] }],
    // Un produit physique doit être envoyé au créateur avant la production
    productShipping: { type: Boolean, default: false },
    productDescription: String,
    dosDonts: {
      dos: [String],
      donts: [String],
    },
    examples: [String], // URLs
    brandAssets: [{
      name: String,
      url: String,
      type: String, // 'logo', 'product-image', 'guideline', etc.
    }],
    script: String, // Optional pre-written script
    hashtags: [String],
    mentions: [String],
  },
  
  // Type : rémunérée (paid) ou produit offert (gifting)
  type: { type: String, enum: ['paid', 'gifting'], default: 'paid', index: true },
  gifting: {
    productName: String,
    productValue: Number, // valeur du produit offert (€)
  },

  // Commission plateforme appliquée à cette campagne (peut être réduite par un parrainage ou l'abonnement Pro)
  platformFeePercent: Number,
  brandDiscountPercent: { type: Number, default: 0 }, // remise parrainage sur le prix payé par la marque

  // Budget facultatif : sans budget, le créateur propose son prix dans son devis
  budget: {
    total: {
      type: Number,
      min: 50,
    },
    perVideo: Number,
    currency: {
      type: String,
      default: 'EUR',
    }
  },
  
  status: {
    type: String,
    enum: ['draft', 'active', 'in_progress', 'completed', 'cancelled'],
    default: 'draft',
    index: true,
  },
  
  matching: {
    niches: [{
      type: String,
      required: true,
    }],
    minRating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    // Nombre de créateurs recherchés (campagne multi-créateurs)
    creatorsWanted: {
      type: Number,
      min: 1,
      max: 20,
      default: 1,
    },
    preferredCreators: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    excludedCreators: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    targetAudience: {
      ageRange: String,
      gender: String,
      location: [String],
    }
  },
  
  invitations: [{
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    invitedAt: { type: Date, default: Date.now },
    message: String,
  }],

  notifications: {
    ambassadorsNotifiedAt: Date,
    allNotifiedAt: Date,
  },

  timeline: {
    publishedAt: Date,
    applicationDeadline: Date,
    productionDeadline: Date,
    estimatedDelivery: Date,
  },
  
  applications: [{
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'withdrawn'],
      default: 'pending',
    },
    proposal: String,
    price: {
      type: Number,
      required: true,
    },
    estimatedDeliveryDays: Number,
    matchScore: Number, // AI matching score (0-100)
    // Devis : prix + conditions contractuelles, modifiable tant qu'il n'est pas accepté
    quote: {
      version: { type: Number, default: 1 },
      updatedAt: Date,
      acceptedAt: Date,
      rights: {
        duration: { type: String, enum: ['6m', '1y', '2y', '3y', 'unlimited'], default: '1y' },
        supports: [{ type: String, enum: ['social_organic', 'paid_ads', 'website', 'email', 'marketplace', 'tv', 'other'] }],
        territories: { type: String, default: 'France' },
        exclusivity: { type: Boolean, default: false },
        exclusivityMonths: Number,
      },
      deliveryTypes: [{ type: String, enum: ['file', 'link'] }],
      platforms: [{ type: String, enum: ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'website', 'other'] }],
      revisions: { type: Number, default: 2 },
      terms: String, // conditions libres du créateur
      history: [{
        version: Number,
        price: Number,
        estimatedDeliveryDays: Number,
        rights: Object,
        terms: String,
        savedAt: Date,
      }],
    },
  }],
  
  // Premier créateur sélectionné (compatibilité) + liste complète (campagne multi-créateurs)
  selectedCreator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  selectedCreators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],

  selectedAt: Date,
  
  // Analytics
  analytics: {
    views: {
      type: Number,
      default: 0,
    },
    applications: {
      type: Number,
      default: 0,
    },
    avgMatchScore: Number,
  },
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
campaignSchema.index({ status: 1, 'timeline.publishedAt': -1 });
campaignSchema.index({ 'matching.niches': 1, status: 1 });
campaignSchema.index({ brandId: 1, status: 1 });

// Virtual for days until deadline
campaignSchema.virtual('daysUntilDeadline').get(function() {
  if (!this.timeline.applicationDeadline) return null;
  const now = new Date();
  const deadline = new Date(this.timeline.applicationDeadline);
  const diffTime = deadline - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Methods
campaignSchema.methods.canApply = function(creatorId) {
  // Check if already applied (creatorId peut être peuplé ou non)
  const idOf = (c) => (c && c._id ? c._id : c)?.toString();
  const hasApplied = (this.applications || []).some(
    app => idOf(app.creatorId) === creatorId.toString()
  );
  
  // Check if excluded
  const isExcluded = this.matching.excludedCreators?.some(
    id => id.toString() === creatorId.toString()
  );
  
  // Check deadline
  const isPastDeadline = this.timeline.applicationDeadline && 
    new Date() > new Date(this.timeline.applicationDeadline);
  
  const wanted = this.matching?.creatorsWanted || 1;
  const selectedCount = (this.selectedCreators?.length) || (this.selectedCreator ? 1 : 0);

  return (
    this.status === 'active' &&
    !hasApplied &&
    !isExcluded &&
    !isPastDeadline &&
    selectedCount < wanted
  );
};

campaignSchema.methods.remainingSlots = function() {
  const wanted = this.matching?.creatorsWanted || 1;
  const selectedCount = (this.selectedCreators?.length) || (this.selectedCreator ? 1 : 0);
  return Math.max(0, wanted - selectedCount);
};

/**
 * Sélectionne un créateur. La campagne reste ouverte tant que tous les postes ne sont pas pourvus,
 * puis passe en production.
 */
campaignSchema.methods.selectCreator = function(creatorId) {
  const idOf = (c) => (c && c._id ? c._id : c)?.toString();
  if (!this.selectedCreators) this.selectedCreators = [];
  if (!this.selectedCreators.some(id => idOf(id) === creatorId.toString())) {
    this.selectedCreators.push(creatorId);
  }
  if (!this.selectedCreator) this.selectedCreator = creatorId;
  this.selectedAt = new Date();

  const wanted = this.matching?.creatorsWanted || 1;
  if (this.selectedCreators.length >= wanted) {
    this.status = 'in_progress';
  }

  // Candidature acceptée ; les autres sont refusées seulement quand tous les postes sont pourvus
  this.applications.forEach(app => {
    if (idOf(app.creatorId) === creatorId.toString()) app.status = 'accepted';
    else if (this.status === 'in_progress' && app.status === 'pending') app.status = 'rejected';
  });
};

// Statics
campaignSchema.statics.findMatchingForCreator = function(creatorProfile) {
  const query = {
    status: 'active',
    'matching.niches': { $in: creatorProfile.niches },
    'matching.minRating': { $lte: creatorProfile.stats.rating },
    selectedCreator: null,
  };
  
  // Exclude if creator is in excludedCreators
  if (creatorProfile._id) {
    query['matching.excludedCreators'] = { $ne: creatorProfile._id };
  }
  
  return this.find(query)
    .populate('brandId', 'profile.companyName profile.avatar')
    .sort({ 'timeline.publishedAt': -1 });
};

export default mongoose.model('Campaign', campaignSchema);
