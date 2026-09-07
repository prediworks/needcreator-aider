import mongoose from 'mongoose';
import { config } from '../config/index.js';

const deliverySchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true,
    index: true,
  },
  
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  files: [{
    url: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['video', 'image', 'document'],
      required: true,
    },
    thumbnail: String,
    filename: String,
    size: Number, // bytes
    duration: Number, // seconds (for videos)
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      width: Number,
      height: Number,
      format: String,
    },
    superseded: { type: Boolean, default: false }, // remplacé lors d'une révision
  }],
  
  // Livraison par lien (TikTok, Instagram, YouTube, Drive...)
  links: [{
    url: { type: String, required: true },
    platform: { type: String, enum: ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'drive', 'other'], default: 'other' },
    title: String,
    addedAt: { type: Date, default: Date.now },
    // Public si le créateur ET la marque l'acceptent (par défaut oui des deux côtés)
    visibility: {
      creator: { type: Boolean, default: true },
      brand: { type: Boolean, default: true },
    },
    superseded: { type: Boolean, default: false },
  }],

  status: {
    type: String,
    enum: ['pending', 'submitted', 'revision_requested', 'approved', 'auto_approved', 'rejected'],
    default: 'pending',
    index: true,
  },
  
  revisions: [{
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    feedback: {
      type: String,
      required: true,
    },
    resolvedAt: Date,
    newFiles: [{
      url: String,
      uploadedAt: Date,
    }],
  }],
  
  payment: {
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'EUR',
    },
    platformFee: Number,
    creatorAmount: Number,
    stripePaymentIntentId: String,
    stripeTransferId: String,
    status: {
      type: String,
      enum: ['pending', 'held', 'captured', 'released', 'refunded', 'failed'],
      default: 'pending',
    },
    heldAt: Date,
    releasedAt: Date,
  },
  
  autoApprovalDate: Date,
  
  submittedAt: Date,
  approvedAt: Date,
  
  notes: {
    creator: String,
    brand: String,
    lastReminderDay: Number, // dernier rappel d'auto-approbation envoyé (jours restants)
  },
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
deliverySchema.index({ status: 1, autoApprovalDate: 1 });
deliverySchema.index({ campaignId: 1, creatorId: 1 }, { unique: true });

// Nombre de livrables (fichiers + liens) et attendu
deliverySchema.virtual('itemCount').get(function() {
  const current = (arr) => (arr || []).filter(i => !i.superseded).length;
  return current(this.files) + current(this.links);
});

// Virtual for revision count
deliverySchema.virtual('revisionCount').get(function() {
  return this.revisions?.length || 0;
});

// Virtual for can request revision
deliverySchema.virtual('canRequestRevision').get(function() {
  return (
    this.status === 'submitted' &&
    this.revisionCount < config.business.maxRevisions
  );
});

// Virtual for days until auto-approval
deliverySchema.virtual('daysUntilAutoApproval').get(function() {
  if (!this.autoApprovalDate) return null;
  const now = new Date();
  const deadline = new Date(this.autoApprovalDate);
  const diffTime = deadline - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
});

// Methods
deliverySchema.methods.submit = function() {
  this.status = 'submitted';
  this.submittedAt = new Date();
  
  // Marque la dernière révision comme résolue
  const lastRevision = this.revisions?.[this.revisions.length - 1];
  if (lastRevision && !lastRevision.resolvedAt) {
    lastRevision.resolvedAt = new Date();
  }
  
  // Set auto-approval date (7 days from now)
  const autoApprovalDate = new Date();
  autoApprovalDate.setDate(autoApprovalDate.getDate() + config.business.autoApprovalDays);
  this.autoApprovalDate = autoApprovalDate;
};

deliverySchema.methods.approve = function(isAuto = false, transferred = true) {
  this.status = isAuto ? 'auto_approved' : 'approved';
  this.approvedAt = new Date();
  // 'released' = versé au créateur ; 'captured' = encaissé, versement en attente du compte Stripe du créateur
  this.payment.status = transferred ? 'released' : 'captured';
  if (transferred) this.payment.releasedAt = new Date();
};

deliverySchema.methods.requestRevision = function(feedback) {
  if (!this.canRequestRevision) {
    throw new Error('Maximum revisions reached or invalid status');
  }
  
  this.status = 'revision_requested';
  this.revisions.push({
    requestedAt: new Date(),
    feedback,
  });
  // Les vidéos actuelles deviennent "version précédente" : le créateur en livre de nouvelles
  (this.files || []).forEach(f => { f.superseded = true; });
  (this.links || []).forEach(l => { l.superseded = true; });
  
  // Reset auto-approval date
  this.autoApprovalDate = null;
};

deliverySchema.methods.calculatePaymentAmounts = function() {
  const platformFeePercent = config.stripe.platformFeePercent;
  this.payment.platformFee = Math.round(this.payment.amount * (platformFeePercent / 100));
  this.payment.creatorAmount = this.payment.amount - this.payment.platformFee;
};

// Statics
deliverySchema.statics.findPendingAutoApprovals = function() {
  const now = new Date();
  return this.find({
    status: 'submitted',
    autoApprovalDate: { $lte: now },
  }).populate('campaignId creatorId brandId');
};

export default mongoose.model('Delivery', deliverySchema);
