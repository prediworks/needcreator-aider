import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  // Firebase UID
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  
  role: {
    type: String,
    enum: ['creator', 'brand', 'admin'],
    required: true,
  },
  
  // Common profile fields
  profile: {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    avatar: String,
    bio: String,
    
    // Creator-specific fields
    portfolio: [{
      videoUrl: String,
      thumbnail: String,
      title: String,
      description: String,
      videoType: String, // 'testimonial', 'unboxing', 'demo', etc.
      stats: {
        views: Number,
        engagement: Number,
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      }
    }],
    
    niches: [{
      type: String,
      enum: [
        'beauty', 'fashion', 'tech', 'food', 'travel', 
        'fitness', 'gaming', 'lifestyle', 'parenting', 'pets',
        'home', 'business', 'education', 'health'
      ]
    }],
    
    pricing: {
      minPrice: Number,
      avgPrice: Number,
      currency: {
        type: String,
        default: 'EUR'
      }
    },
    
    stats: {
      completedJobs: {
        type: Number,
        default: 0,
      },
      rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      totalReviews: {
        type: Number,
        default: 0,
      },
      responseTimeHours: Number, // Average response time
      onTimeDeliveryRate: Number, // Percentage
    },
    
    // Brand-specific fields
    companyName: String,
    website: String,
    industry: String,
    companySize: {
      type: String,
      enum: ['1-10', '11-50', '51-200', '201-500', '500+']
    },
  },
  
  // Stripe accounts
  stripeAccountId: String, // For creators (Connect)
  stripeCustomerId: String, // For brands
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended', 'banned'],
    default: 'pending',
  },
  
  // Verification
  verification: {
    email: {
      type: Boolean,
      default: false,
    },
    phone: {
      type: Boolean,
      default: false,
    },
    identity: {
      type: Boolean,
      default: false,
    },
    portfolio: {
      type: Boolean,
      default: false,
    },
  },
  
  // Preferences
  preferences: {
    emailNotifications: {
      type: Boolean,
      default: true,
    },
    pushNotifications: {
      type: Boolean,
      default: true,
    },
    language: {
      type: String,
      default: 'fr',
    },
  },
  
  // Metadata
  lastLoginAt: Date,
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
userSchema.index({ 'profile.niches': 1 });
userSchema.index({ 'profile.stats.rating': -1 });
userSchema.index({ role: 1, status: 1 });

// Virtual for full profile completion percentage
userSchema.virtual('profileCompletion').get(function() {
  let completion = 0;
  const fields = [
    this.profile.name,
    this.profile.avatar,
    this.profile.bio,
  ];
  
  if (this.role === 'creator') {
    fields.push(
      this.profile.portfolio?.length >= 3,
      this.profile.niches?.length > 0,
      this.profile.pricing?.minPrice,
      this.stripeAccountId
    );
  } else if (this.role === 'brand') {
    fields.push(
      this.profile.companyName,
      this.profile.website,
      this.profile.industry,
      this.stripeCustomerId
    );
  }
  
  completion = (fields.filter(Boolean).length / fields.length) * 100;
  return Math.round(completion);
});

// Methods
userSchema.methods.canApplyToCampaign = function() {
  return (
    this.role === 'creator' &&
    this.status === 'active' &&
    this.verification.portfolio &&
    this.profile.portfolio?.length >= 3 &&
    this.stripeAccountId
  );
};

userSchema.methods.canCreateCampaign = function() {
  return (
    this.role === 'brand' &&
    this.status === 'active' &&
    this.stripeCustomerId
  );
};

export default mongoose.model('User', userSchema);
