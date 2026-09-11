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
    quotePrice: Number,        // prix du devis (avant remise)
    discountPercent: Number,   // remise parrainage accordée à la marque
    discountAmount: Number,
    platformFee: Number,
    platformFeePercent: Number,
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
  
  // Envoi du produit au créateur
  shipping: {
    required: { type: Boolean, default: false },
    status: { type: String, enum: ['none', 'pending', 'shipped', 'received'], default: 'none' },
    address: {
      name: String, line1: String, line2: String, postalCode: String, city: String, country: String, phone: String,
    },
    carrier: String,
    trackingNumber: String,
    trackingUrl: String,
    shippedAt: Date,
    receivedAt: Date,
    note: String,
  },
  // Pack "vidéo prête à diffuser" (déclinaisons de format, vignette, sous-titres)
  // Score de conformité au brief (calculé automatiquement à la soumission)
  compliance: {
    status: { type: String, enum: ['none', 'pending', 'done', 'unavailable'], default: 'none' },
    checkedAt: Date,
    score: Number,          // 0-100
    summary: String,
    items: [{
      key: String,          // count | duration | orientation | resolution | audio | mentions
      label: String,
      status: { type: String, enum: ['ok', 'warn', 'fail', 'skip'] },
      detail: String,
      file: String,         // nom du fichier concerné
    }],
    transcript: String,
  },
  // Garantie de remplacement (créateur en retard)
  replacement: {
    status: { type: String, enum: ['none', 'late', 'offered', 'replaced'], default: 'none' },
    lateSince: Date,
    offeredAt: Date,
    replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    replacedAt: Date,
    newDeliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery' },
  },

  // Contrat de mission et cession de droits (généré à l'acceptation du devis)
  contract: {
    number: String,
    url: String,
    generatedAt: Date,
    termsVersion: String,
    parties: {
      brand: { legalName: String, siret: String, vatNumber: String, address: String, signatoryName: String, signatoryTitle: String, email: String },
      creator: { name: String, status: String, companyName: String, siret: String, address: String, email: String },
    },
    mission: { title: String, deliverables: Number, videoType: String, estimatedDeliveryDays: Number, revisions: Number, terms: String, brief: mongoose.Schema.Types.Mixed },
    rights: {
      duration: String,
      supports: [String],
      territories: String,
      exclusivity: Boolean,
      exclusivityMonths: Number,
    },
    rightsStartAt: Date,
    rightsEndAt: Date,        // null = illimité
    expiryReminderSentAt: Date,
    addenda: [{
      number: String,
      url: String,
      generatedAt: Date,
      price: Number,
      duration: String,
      previousEndAt: Date,
      newEndAt: Date,
    }],
  },
  // Prolongation des droits (proposée par le créateur, payée par la marque)
  rightsExtension: {
    status: { type: String, enum: ['none', 'requested', 'proposed', 'awaiting_payment', 'paid', 'declined'], default: 'none' },
    requestMessage: String,
    requestedAt: Date,
    price: Number,
    duration: String,
    note: String,
    proposedAt: Date,
    stripePaymentIntentId: String,
    platformFee: Number,
    creatorAmount: Number,
    stripeTransferId: String,
    paidAt: Date,
  },

  readyPack: {
    status: { type: String, enum: ['none', 'awaiting_payment', 'queued', 'processing', 'done', 'failed'], default: 'none' },
    options: {
      formats: [String],
      subtitles: Boolean,
      thumbnail: Boolean,
    },
    price: Number,
    stripePaymentIntentId: String,
    paymentStatus: { type: String, enum: ['none', 'pending', 'paid'], default: 'none' },
    outputs: [{
      itemId: String,
      sourceName: String,
      kind: String,      // video | thumbnail | subtitles
      format: String,
      url: String,
      filename: String,
      width: Number,
      height: Number,
      subtitled: Boolean,
      language: String,
      error: String,
    }],
    requestedAt: Date,
    completedAt: Date,
    error: String,
  },

  // Performances des vidéos livrées (saisie manuelle marque/créateur ; connexion aux réseaux plus tard)
  performance: [{
    itemId: String,             // _id du fichier ou du lien livré
    platform: { type: String, enum: ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'website', 'other'], default: 'other' },
    url: String,                // lien de la publication
    views: { type: Number, min: 0, default: 0 },
    likes: { type: Number, min: 0, default: 0 },
    comments: { type: Number, min: 0, default: 0 },
    shares: { type: Number, min: 0, default: 0 },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],

  shopifyPublishedAt: Date,
  estimatedDeliveryDays: Number, // délai promis dans le devis
  productionDeadline: Date,      // reçu + délai (ou sélection + délai sans envoi)

  autoApprovalDate: Date,
  
  submittedAt: Date,
  approvedAt: Date,
  
  notes: {
    creator: String,
    brand: String,
    lastReminderDay: Number, // dernier rappel d'auto-approbation envoyé (jours restants)
  },
  // Relances automatiques envoyées (une seule par type)
  reminders: {
    noUploadAt: Date,
    productReceivedAt: Date,
    revisionAt: Date,
  },
  // Refus définitif (automatique ou non)
  rejection: {
    at: Date,
    reason: String,
    auto: { type: Boolean, default: false },
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

/** Durée de droits → nombre de mois (null = illimité) */
export function rightsDurationMonths(duration) {
  return { '6m': 6, '1y': 12, '2y': 24, '3y': 36 }[duration] ?? null;
}
export function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Les droits courent à partir de la validation de la livraison */
deliverySchema.methods.startRights = function() {
  if (!this.contract?.number) return;
  const start = new Date();
  const months = rightsDurationMonths(this.contract.rights?.duration);
  this.contract.rightsStartAt = start;
  this.contract.rightsEndAt = months ? addMonths(start, months) : null;
};

deliverySchema.methods.approve = function(isAuto = false, transferred = true) {
  this.status = isAuto ? 'auto_approved' : 'approved';
  this.approvedAt = new Date();
  this.startRights();
  // 'released' = versé au créateur ; 'captured' = encaissé, versement en attente du compte Stripe du créateur
  this.payment.status = transferred ? 'released' : 'captured';
  if (transferred) this.payment.releasedAt = new Date();
};

deliverySchema.methods.requestRevision = function(feedback, maxRevisions = config.business.maxRevisions) {
  if (!(this.status === 'submitted' && this.revisionCount < maxRevisions)) {
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

/**
 * Montants à partir du prix du devis (payment.amount = devis à l'appel) :
 * le créateur reçoit devis − commission ; la marque paie devis − remise parrainage ; NeedCreator garde la différence.
 */
deliverySchema.methods.calculatePaymentAmounts = function(feePercent = null, discountPercent = 0) {
  const round2 = (n) => Math.round(n * 100) / 100;
  const platformFeePercent = feePercent ?? config.stripe.platformFeePercent;
  const quote = this.payment.quotePrice ?? this.payment.amount;
  const discount = Math.min(Math.max(discountPercent || 0, 0), platformFeePercent);
  this.payment.quotePrice = quote;
  this.payment.platformFeePercent = platformFeePercent;
  this.payment.discountPercent = discount;
  this.payment.discountAmount = round2(quote * discount / 100);
  this.payment.amount = round2(quote - this.payment.discountAmount);
  this.payment.creatorAmount = round2(quote * (1 - platformFeePercent / 100));
  this.payment.platformFee = round2(this.payment.amount - this.payment.creatorAmount);
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
