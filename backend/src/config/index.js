import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || process.env.DEFAULT_PORT || '3002', 10),
  
  // MongoDB
  mongodb: {
    uri: process.env.MONGODB_URI,
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }
  },
  
  // Firebase
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  },
  
  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    // Laisser vide pour utiliser la version d'API épinglée par le SDK Stripe
    apiVersion: process.env.STRIPE_API_VERSION || undefined,
    platformFeePercent: parseInt(process.env.STRIPE_PLATFORM_FEE_PERCENT || '10', 10),
  },
  
  // Storage
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'cloudflare',
    cloudflare: {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
      bucketName: process.env.CLOUDFLARE_BUCKET_NAME,
      publicUrl: process.env.CLOUDFLARE_PUBLIC_URL,
    }
  },
  
  // Email
  email: {
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    fromEmail: process.env.FROM_EMAIL,
    smtp: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },
  
  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET,
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    rateLimitMaxRequests: parseInt(
      process.env.RATE_LIMIT_MAX_REQUESTS || (process.env.NODE_ENV === 'production' ? '300' : '5000'),
      10
    ),
  },
  
  // CORS
  cors: {
    // Liste d'origines autorisées (séparées par des virgules dans FRONTEND_URL)
    origins: (process.env.FRONTEND_URL || 'http://localhost:3000')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean),
    // Première origine = URL principale du frontend (utilisée dans les emails)
    origin: (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim(),
  },
  
  // Abonnement Pro (marques)
  plans: {
    proPriceEur: parseFloat(process.env.PRO_PRICE_EUR || '79'),
    proTrialDays: parseInt(process.env.PRO_TRIAL_DAYS || '14', 10),
    proFeePercent: parseFloat(process.env.PRO_FEE_PERCENT || process.env.STRIPE_PLATFORM_FEE_PERCENT || '10'), // identique au taux standard : Pro ne modifie plus la commission
    stripeProPriceId: process.env.STRIPE_PRO_PRICE_ID || null,
    aiBriefFreeQuota: parseInt(process.env.AI_BRIEF_FREE_QUOTA || '3', 10),
  },

  // Limites progressives des nouvelles marques (aucune campagne terminée)
  limits: {
    newBrandOpenCampaigns: parseInt(process.env.LIMIT_NEW_BRAND_OPEN_CAMPAIGNS || '2', 10),
    newBrandInvitesPerDay: parseInt(process.env.LIMIT_NEW_BRAND_INVITES_PER_DAY || '5', 10),
    newBrandMessagesPerDay: parseInt(process.env.LIMIT_NEW_BRAND_MESSAGES_PER_DAY || '20', 10),
  },

  // Gifting (produit offert, pas de rémunération)
  gifting: {
    minProductValue: parseFloat(process.env.GIFTING_MIN_PRODUCT_VALUE || '30'),
    maxDeliverables: parseInt(process.env.GIFTING_MAX_DELIVERABLES || '2', 10),
    maxPerMonth: parseInt(process.env.GIFTING_MAX_PER_MONTH || '2', 10),
    feePerVideo: parseFloat(process.env.GIFTING_FEE_PER_VIDEO || '5'),
  },

  // Pack "vidéo prête à diffuser" (€ par vidéo ; 0 = inclus)
  readyPack: {
    pricePerVideo: parseFloat(process.env.READY_PACK_PRICE || '15'),
  },

  // TVA (taux appliqué par PREDIWORKS sur sa commission et ses services, et par les créateurs assujettis)
  vat: {
    rate: parseFloat(process.env.VAT_RATE || '20'),
  },

  // Parrainage (montants configurables)
  referral: {
    // Réduction (en % du devis) accordée à la marque parrainée sur sa 1re campagne, et à la marraine sur sa campagne suivante.
    // Le créateur reçoit toujours ses 90 % du devis : la réduction est prise sur la commission NeedCreator.
    brandDiscountPercent: parseFloat(process.env.REFERRAL_BRAND_DISCOUNT_PERCENT || process.env.REFERRAL_BRAND_FEE_PERCENT || '5'),
    referrerDiscountPercent: parseFloat(process.env.REFERRAL_REFERRER_DISCOUNT_PERCENT || process.env.REFERRAL_REFERRER_FEE_PERCENT || '5'),
    creatorBonus: parseFloat(process.env.REFERRAL_CREATOR_BONUS || '10'),                // bonus (€) au parrain créateur à la 1re mission livrée du filleul
  },

  // Badges et niveaux des créateurs
  badges: {
    ambassadorMatchBonus: parseInt(process.env.AMBASSADOR_MATCH_BONUS || '5', 10), // points ajoutés au score de matching des Ambassadeurs
    confirmedJobs: parseInt(process.env.BADGE_CONFIRMED_JOBS || '3', 10),
    confirmedRating: parseFloat(process.env.BADGE_CONFIRMED_RATING || '4.5'),
    expertJobs: parseInt(process.env.BADGE_EXPERT_JOBS || '10', 10),
    expertRating: parseFloat(process.env.BADGE_EXPERT_RATING || '4.7'),
    // Accès anticipé aux campagnes pour les ambassadeurs (heures) ; 0 = désactivé
    earlyAccessHours: parseInt(process.env.EARLY_ACCESS_HOURS || '24', 10),
    trainedMatchBonus: parseInt(process.env.TRAINED_MATCH_BONUS || '3', 10), // points de matching pour le badge « Formé »
  },

  // Académie (guides + quiz) : badge « Formé » après ACADEMY_REQUIRED guides réussis à ACADEMY_PASS_SCORE %
  academy: {
    required: parseInt(process.env.ACADEMY_REQUIRED || '3', 10),
    passScore: parseInt(process.env.ACADEMY_PASS_SCORE || '75', 10),
  },

  // Outils d'administration temporaires (validation de la prod)
  admin: {
    purgeEnabled: process.env.ADMIN_PURGE_ENABLED === 'true',
    alertEmails: (process.env.ADMIN_ALERT_EMAIL || '').split(',').map(s => s.trim()).filter(Boolean),
  },

  // Authentification
  auth: {
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== 'false',
  },

  // Documents légaux (version acceptée à l'inscription)
  legal: {
    termsVersion: process.env.LEGAL_TERMS_VERSION || '2026-09-11',
  },

  // Business rules
  business: {
    autoApprovalDays: parseInt(process.env.AUTO_APPROVAL_DAYS || '7', 10), // délai contractuel (CGU) avant validation automatique
    maxRevisions: parseInt(process.env.MAX_REVISIONS || '2', 10),          // valeur initiale du réglage admin « Nombre maximum de révisions »
    minCreatorVideos: parseInt(process.env.MIN_CREATOR_VIDEOS || '3', 10),
    replacementGraceHours: parseInt(process.env.REPLACEMENT_GRACE_HOURS || '48', 10), // délai après la date prévue avant remplacement possible
    minQuotePrice: parseInt(process.env.MIN_QUOTE_PRICE || '50', 10), // prix minimum d'un devis / d'un budget (€)
    // Seuils micro-entreprise rappelés aux créateurs (prestations de services, valeurs 2025)
    microRevenueThreshold: parseInt(process.env.MICRO_REVENUE_THRESHOLD || '77700', 10),
    vatFranchiseThreshold: parseInt(process.env.VAT_FRANCHISE_THRESHOLD || '37500', 10),
    vatFranchiseTolerance: parseInt(process.env.VAT_FRANCHISE_TOLERANCE || '41250', 10),
    maxActiveMissionsHint: parseInt(process.env.MAX_ACTIVE_MISSIONS_HINT || '3', 10), // au-delà, le matching baisse (créateur chargé)
    maxVideoSizeMB: 500,
    // STRIPE_AUTO_CONFIRM_TEST=true : confirme les paiements avec une carte de test sans écran de saisie (jamais en production)
    autoConfirmTestPayments: process.env.NODE_ENV !== 'production' && process.env.STRIPE_AUTO_CONFIRM_TEST === 'true',
    // Intervalle des tâches planifiées (auto-approbation, rappels), en minutes
    jobsIntervalMinutes: parseInt(process.env.JOBS_INTERVAL_MINUTES || '60', 10),
  }
};

// Validation
const requiredEnvVars = [
  'MONGODB_URI',
  'FIREBASE_PROJECT_ID',
  'STRIPE_SECRET_KEY',
  'JWT_SECRET',
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}
