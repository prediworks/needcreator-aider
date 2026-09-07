import mongoose from 'mongoose';
import { config } from '../config/index.js';

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
    
    stripeConnect: {
      accountId: String,
      onboardingComplete: {
        type: Boolean,
        default: false,
      },
      chargesEnabled: {
        type: Boolean,
        default: false,
      },
      payoutsEnabled: {
        type: Boolean,
        default: false,
      },
      detailsSubmitted: {
        type: Boolean,
        default: false,
      },
      requirements: {
        type: Object,
        default: {},
      },
    },
    
    // Adresse postale du créateur (envoi de produits) — visible par la marque après sélection uniquement
    address: {
      name: String,
      line1: String,
      line2: String,
      postalCode: String,
      city: String,
      country: { type: String, default: 'France' },
      phone: String,
    },

    // Réseaux sociaux (stats déclarées par le créateur)
    socials: [{
      network: { type: String, enum: ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'other'], required: true },
      url: { type: String, required: true },
      handle: String,
      followers: { type: Number, min: 0 },
      avgViews: { type: Number, min: 0 },
      updatedAt: { type: Date, default: Date.now },
    }],

    // Réalisations hors NeedCreator (liens vers des vidéos publiées)
    realisations: [{
      url: { type: String, required: true },
      platform: { type: String, enum: ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'website', 'other'], default: 'other' },
      title: String,
      description: String,
      brandName: String,
      addedAt: { type: Date, default: Date.now },
    }],

    // Vidéo "parlez de NeedCreator" → badge Ambassadeur + accès anticipé aux campagnes
    ambassador: {
      status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
      videoUrl: String,
      submittedAt: Date,
      reviewedAt: Date,
      note: String,
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
      // Réactivité des marques (visible par les créateurs)
      avgValidationDays: Number, // délai moyen soumission → validation
      avgResponseDays: Number,   // délai moyen candidature → sélection
      campaignsCompleted: Number,
      totalFollowers: Number,    // somme des abonnés déclarés (créateurs)
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
  stripeAccountId: String, // For creators (Connect) - kept for backward compatibility
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
  
  // Parrainage
  referral: {
    code: { type: String, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    referredAt: Date,
    // Marque : nombre de campagnes à commission réduite restantes
    discountedCampaignsLeft: { type: Number, default: 0 },
    // Récompenses obtenues (bonus créateur, remises marque)
    rewards: [{
      type: { type: String, enum: ['creator_bonus', 'brand_discount'] },
      amount: Number,       // € pour un bonus, % pour une remise
      description: String,
      sourceUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
      status: { type: String, enum: ['pending', 'granted', 'paid'], default: 'granted' },
      stripeTransferId: String,
      createdAt: { type: Date, default: Date.now },
    }],
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
      (this.profile.portfolio?.length || 0) >= config.business.minCreatorVideos,
      this.profile.niches?.length > 0,
      this.profile.pricing?.minPrice,
      this.profile.stripeConnect?.accountId,
      this.profile.stripeConnect?.onboardingComplete,
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

// Code de parrainage lisible (ex : LEA-7K3P2Q)
userSchema.methods.ensureReferralCode = function() {
  if (this.referral?.code) return this.referral.code;
  const base = (this.profile?.companyName || this.profile?.name || 'NC').normalize('NFD').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'NC';
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  this.set('referral.code', `${base}-${rand}`);
  return this.referral.code;
};

// Methods
userSchema.methods.canApplyToCampaign = function() {
  // Le compte Stripe n'est pas requis pour candidater : il est demandé avant le paiement
  return (
    this.role === 'creator' &&
    this.status === 'active' &&
    this.verification.portfolio &&
    (this.profile.portfolio?.length || 0) >= config.business.minCreatorVideos
  );
};

/**
 * Explique pourquoi un créateur ne peut pas candidater (pour un message clair côté UI)
 */
userSchema.methods.applyBlockers = function() {
  const blockers = [];
  if (this.status === 'pending') blockers.push('Votre profil est en attente de validation par notre équipe.');
  if (this.status === 'suspended' || this.status === 'banned') blockers.push('Votre compte est suspendu.');
  if (!this.verification.portfolio && this.status === 'active') blockers.push('Votre portfolio n\'a pas encore été validé.');
  const missing = config.business.minCreatorVideos - (this.profile.portfolio?.length || 0);
  if (missing > 0) blockers.push(`Ajoutez encore ${missing} vidéo(s) à votre portfolio (minimum ${config.business.minCreatorVideos}).`);
  return blockers;
};

userSchema.methods.canCreateCampaign = function() {
  return (
    this.role === 'brand' &&
    this.status === 'active' &&
    this.stripeCustomerId
  );
};

export default mongoose.model('User', userSchema);
