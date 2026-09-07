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
  
  budget: {
    total: {
      type: Number,
      required: true,
      min: 50,
    },
    perVideo: {
      type: Number,
      required: true,
    },
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
  }],
  
  selectedCreator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
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
  
  return (
    this.status === 'active' &&
    !hasApplied &&
    !isExcluded &&
    !isPastDeadline &&
    !this.selectedCreator
  );
};

campaignSchema.methods.selectCreator = function(creatorId) {
  this.selectedCreator = creatorId;
  this.selectedAt = new Date();
  this.status = 'in_progress';
  
  // Update application status (modification en place des sous-documents)
  const idOf = (c) => (c && c._id ? c._id : c)?.toString();
  this.applications.forEach(app => {
    app.status = idOf(app.creatorId) === creatorId.toString() ? 'accepted' : 'rejected';
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
