import mongoose from 'mongoose';
import { SERVICE_KEYS, PORTFOLIO_KINDS, DEFAULT_SERVICE, serviceByKey } from '../../config/services.js';
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
    country: { type: String, default: 'FR', uppercase: true, trim: true }, // ISO 3166-1 alpha-2 (préparation international : Stripe, contrats, TVA)
    
    // Creator-specific fields
    // Services proposés (config/services.js) : « ugc » par défaut. Préparation de l'élargissement à d'autres métiers.
    services: [{ type: String, enum: SERVICE_KEYS }],
    portfolio: [{
      kind: { type: String, enum: PORTFOLIO_KINDS, default: 'video' }, // vidéo (défaut), image, audio
      videoUrl: String, // URL du média (nom historique, quel que soit le type)
      previewUrl: String,      // aperçu filigrané montré aux marques (l'original reste pour le créateur)
      playableUrl: String,     // même vidéo réencodée en H.264 sans filigrane, lisible dans tous les navigateurs (originaux iPhone en HEVC) : servie au créateur et à l'admin
      sourceCodec: String,     // codec du fichier d'origine (h264, hevc…)
      watermarkedAt: Date,
      watermarkError: String,
      watermarkAttempts: { type: Number, default: 0 },
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
    isAmbassador: { type: Boolean, default: false, index: true }, // = ambassador.status approved (pour trier / mettre en avant)
    // Accord du créateur pour le site public et la communication NeedCreator
    // Disponibilité déclarée par le créateur (visible par les marques, pèse dans le matching)
    availability: {
      unavailableUntil: Date,
      note: String,
    },
    slug: { type: String, index: true, sparse: true }, // adresse publique courte /c/<slug> (kit média)
    academy: [{ slug: String, score: Number, passed: Boolean, completedAt: Date, _id: false }],
    publicConsent: {
      site: { type: Boolean, default: true },       // fiche et portfolio visibles sur le site public (hors application) ; activé par défaut, le créateur peut retirer
      marketing: { type: Boolean, default: true },  // vidéos réutilisables sur la page d'accueil et les réseaux NeedCreator ; activé par défaut, retirable
      updatedAt: Date,
    },
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
      lateDeliveries: { type: Number, default: 0 }, // missions retirées pour retard (garantie de remplacement)
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
    company: {
      siret: String,
      vatNumber: String,
      country: String,            // pays de l'entreprise (code ISO 2 lettres), FR par défaut
      registrationNumber: String, // numéro d'immatriculation hors France (UID CHE, Companies House, EIN…) : contrôle manuel
      legalName: String,      // raison sociale trouvée au registre
      registryAddress: String,
      registryChecked: Boolean,
    },
  },
  
  // Stripe accounts
  stripeAccountId: String, // For creators (Connect) - kept for backward compatibility
  stripeCustomerId: String, // For brands
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended', 'banned', 'deleted'],
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
    // Vérification de l'entreprise (marques)
    business: {
      status: { type: String, enum: ['unverified', 'pending', 'verified', 'rejected'], default: 'unverified' },
      method: { type: String, enum: ['auto', 'admin'] },
      checkedAt: Date,
      note: String,
    },
  },

  // Abonnement (marques)
  // Informations administratives (parties au contrat de mission / cession de droits)
  legalInfo: {
    // Créateur
    firstName: String,
    lastName: String,
    status: { type: String, enum: ['micro', 'company', 'individual'] }, // micro-entrepreneur, société, particulier
    companyName: String,
    siret: String,
    legalName: String,        // raison sociale trouvée au registre
    registryAddress: String,
    registryChecked: Boolean,
    address: {
      line1: String,
      line2: String,
      postalCode: String,
      city: String,
      country: { type: String, default: 'France' },
    },
    individualAcknowledged: Boolean, // particulier : déclare ses revenus lui-même
    vatRegistered: { type: Boolean, default: false }, // assujetti à la TVA (sinon franchise en base, art. 293 B)
    vatNumber: String,                                // numéro de TVA intracommunautaire (assujettis)
    billingMandateAcceptedAt: Date,                   // mandat de facturation : NeedCreator émet les factures au nom du créateur
    // Marque
    signatoryName: String,
    signatoryTitle: String,
    updatedAt: Date,
  },

  // Suspension par l'admin (motif communiqué par email)
  suspension: { reason: String, at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } },
  // Amorçage (admin) : compte marque créé en masse
  seed: { batch: { type: String, index: true } },
  // Acceptation des CGU / confidentialité
  legal: {
    termsVersion: String,
    acceptedAt: Date,
  },
  deletedAt: Date,

  subscription: {
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },
    status: { type: String, enum: ['none', 'trialing', 'active', 'past_due', 'canceled'], default: 'none' },
    trialEndsAt: Date,
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: { type: Boolean, default: false },
    stripeSubscriptionId: String,
  },

  // Compteurs d'usage (quotas et limites progressives)
  usage: {
    aiBriefMonth: String,   // 'AAAA-MM'
    aiBriefCount: { type: Number, default: 0 },
    day: String,            // 'AAAA-MM-JJ'
    invitesToday: { type: Number, default: 0 },
    messagesToday: { type: Number, default: 0 },
  },
  
  // Intégrations tierces (marques)
  integrations: {
    shopify: {
      shop: String,
      accessToken: { type: String, select: false },
      scopes: String,
      installedAt: Date,
    },
  },

  // Parrainage
  // Équipe marque : membre rattaché à un compte propriétaire (agit en son nom)
  team: {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    role: { type: String, enum: ['member'], default: 'member' },
    joinedAt: Date,
  },
  teamInvitations: [{ email: String, name: String, token: String, invitedAt: Date, acceptedAt: Date, _id: false }],

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
    // Créateur : accepte les campagnes gifting (produit offert). Non défini = oui pour les Nouveaux, non ensuite
    acceptGifting: Boolean,
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
/**
 * Points du profil (chacun visible par l'utilisateur, avec le libellé de ce qui manque)
 */
userSchema.methods.profileChecklist = function() {
  const p = this.profile || {};
  if (this.role === 'creator') {
    return [
      { key: 'name', label: 'Nom ou pseudo', done: !!p.name },
      { key: 'bio', label: 'Bio (présentez-vous aux marques)', done: !!(p.bio && p.bio.trim()) },
      { key: 'niches', label: 'Au moins une niche', done: (p.niches?.length || 0) > 0 },
      { key: 'price', label: 'Prix minimum par vidéo', done: !!p.pricing?.minPrice },
      { key: 'portfolio', label: this.portfolioRequirement().label, done: this.portfolioRequirement().done },
      { key: 'socials', label: 'Au moins un réseau social', done: (p.socials?.length || 0) > 0 },
      { key: 'legal', label: 'Informations administratives (contrat)', done: this.hasLegalInfo() },
      { key: 'address', label: 'Adresse de réception des produits', done: !!(p.address?.line1 && p.address?.city) },
      { key: 'stripe', label: 'Compte Stripe connecté', done: !!p.stripeConnect?.accountId },
      { key: 'stripeDone', label: 'Onboarding Stripe terminé (virements activés)', done: !!p.stripeConnect?.onboardingComplete },
    ];
  }
  if (this.role === 'brand') {
    return [
      { key: 'company', label: 'Nom de l\'entreprise', done: !!p.companyName },
      { key: 'website', label: 'Site web', done: !!p.website },
      { key: 'industry', label: 'Secteur d\'activité', done: !!p.industry },
      { key: 'bio', label: 'Présentation de la marque (bio)', done: !!(p.bio && p.bio.trim()) },
      { key: 'verified', label: 'Entreprise vérifiée (SIRET ou TVA)', done: this.isBusinessVerified?.() || false },
      { key: 'legal', label: 'Signataire des contrats', done: this.hasLegalInfo() },
      { key: 'stripe', label: 'Moyen de paiement Stripe', done: !!this.stripeCustomerId },
    ];
  }
  return [];
};

userSchema.virtual('profileCompletion').get(function() {
  const items = this.profileChecklist();
  if (!items.length) return 100;
  return Math.round((items.filter(i => i.done).length / items.length) * 100);
});

// Abonnement Pro actif (période d'essai comprise)
userSchema.methods.isPro = function() {
  const sub = this.subscription || {};
  if (sub.plan !== 'pro') return false;
  if (sub.status === 'active' || sub.status === 'past_due') return true;
  if (sub.status === 'trialing') return !sub.trialEndsAt || new Date(sub.trialEndsAt) > new Date();
  return false;
};

userSchema.methods.isBusinessVerified = function() {
  return this.verification?.business?.status === 'verified';
};

// Remet à zéro les compteurs journaliers / mensuels si la période a changé
userSchema.methods.rollUsage = function() {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  if (!this.usage) this.usage = {};
  if (this.usage.day !== today) { this.usage.day = today; this.usage.invitesToday = 0; this.usage.messagesToday = 0; }
  if (this.usage.aiBriefMonth !== month) { this.usage.aiBriefMonth = month; this.usage.aiBriefCount = 0; }
};

// Code de parrainage lisible (ex : LEA-7K3P2Q)
userSchema.methods.ensureReferralCode = function() {
  if (this.referral?.code) return this.referral.code;
  const base = (this.profile?.companyName || this.profile?.name || 'NC').normalize('NFD').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'NC';
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  this.set('referral.code', `${base}-${rand}`);
  return this.referral.code;
};

/**
 * Informations administratives complètes ? (nécessaires pour le contrat de mission)
 */
userSchema.methods.hasLegalInfo = function() {
  const li = this.legalInfo || {};
  if (this.role === 'brand') return !!(li.signatoryName && li.signatoryName.trim());
  if (this.role === 'creator') {
    const addr = li.address || {};
    const base = li.firstName && li.lastName && li.status && addr.line1 && addr.postalCode && addr.city;
    if (!base) return false;
    if (!li.billingMandateAcceptedAt) return false; // mandat de facturation obligatoire (factures émises en son nom)
    if (li.status === 'individual') return !!li.individualAcknowledged;
    return !!li.siret;
  }
  return true;
};

// Methods
/** Services proposés par le créateur (« ugc » si rien n'est renseigné) */
userSchema.methods.servicesOf = function() {
  const s = this.profile?.services;
  return s && s.length ? s : [DEFAULT_SERVICE];
};

/**
 * Exigence de portfolio : satisfaite dès qu'un des services du créateur a assez d'éléments du bon type
 * (vidéo UGC : minCreatorVideos vidéos ; photo : images ; voix off : audios…)
 */
userSchema.methods.portfolioRequirement = function() {
  const items = this.profile?.portfolio || [];
  const count = (kind) => items.filter(v => (v.kind || 'video') === kind).length;
  const reqs = this.servicesOf().map(key => {
    const svc = serviceByKey(key);
    const min = svc.key === DEFAULT_SERVICE ? config.business.minCreatorVideos : svc.minPortfolio;
    return { service: svc, min, have: count(svc.kind) };
  });
  const done = reqs.some(r => r.have >= r.min);
  const best = reqs.reduce((a, b) => ((b.min - b.have) < (a.min - a.have) ? b : a), reqs[0]);
  const noun = { video: 'vidéo', image: 'image', audio: 'enregistrement audio' }[best.service.kind];
  const missing = Math.max(0, best.min - best.have);
  return { done, missing, kind: best.service.kind, min: best.min, label: `${best.min} ${noun}${best.min > 1 ? 's' : ''} de portfolio` + (best.service.key === DEFAULT_SERVICE ? '' : ` (${best.service.label})`) };
};

userSchema.methods.canApplyToCampaign = function(maxLateWithdrawals = 0) {
  // Le compte Stripe n'est pas requis pour candidater : il est demandé avant le paiement
  return (
    !(maxLateWithdrawals > 0 && (this.profile?.stats?.lateDeliveries || 0) >= maxLateWithdrawals) &&
    this.role === 'creator' &&
    this.status === 'active' &&
    this.verification.portfolio &&
    this.portfolioRequirement().done &&
    this.hasLegalInfo()
  );
};

/**
 * Explique pourquoi un créateur ne peut pas candidater (pour un message clair côté UI)
 */
userSchema.methods.applyBlockers = function(maxLateWithdrawals = 0) {
  const blockers = [];
  if (maxLateWithdrawals > 0 && (this.profile?.stats?.lateDeliveries || 0) >= maxLateWithdrawals) blockers.push(`Vos candidatures sont suspendues : ${this.profile.stats.lateDeliveries} missions vous ont été retirées pour retard. Contactez-nous pour réactiver votre compte.`);
  if (this.status === 'pending') blockers.push('Votre profil est en attente de validation par notre équipe.');
  if (this.status === 'suspended' || this.status === 'banned') blockers.push('Votre compte est suspendu.');
  if (!this.verification.portfolio && this.status === 'active') blockers.push('Votre portfolio n\'a pas encore été validé.');
  const req = this.portfolioRequirement();
  if (!req.done) blockers.push(`Ajoutez encore ${req.missing} ${{ video: 'vidéo(s)', image: 'image(s)', audio: 'enregistrement(s) audio' }[req.kind]} à votre portfolio (minimum ${req.min}).`);
  if (!this.hasLegalInfo()) blockers.push('Renseignez vos informations administratives (identité, statut, adresse) dans votre profil : elles figurent sur le contrat de chaque mission.');
  return blockers;
};

userSchema.methods.canCreateCampaign = function() {
  return (
    this.role === 'brand' &&
    this.status === 'active' &&
    this.stripeCustomerId
  );
};

// Le créateur accepte-t-il les campagnes gifting ? (défaut selon le niveau)
userSchema.methods.acceptsGifting = function(level = 'new') {
  if (typeof this.preferences?.acceptGifting === 'boolean') return this.preferences.acceptGifting;
  return level === 'new';
};

export default mongoose.model('User', userSchema);
