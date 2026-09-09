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

  // Parrainage (montants configurables)
  referral: {
    brandFeePercent: parseFloat(process.env.REFERRAL_BRAND_FEE_PERCENT || '5'),          // commission de la marque parrainée sur sa 1re campagne
    referrerBrandFeePercent: parseFloat(process.env.REFERRAL_REFERRER_FEE_PERCENT || '5'), // commission de la marque marraine sur sa campagne suivante
    creatorBonus: parseFloat(process.env.REFERRAL_CREATOR_BONUS || '10'),                // bonus (€) au parrain créateur à la 1re mission livrée du filleul
  },

  // Badges et niveaux des créateurs
  badges: {
    confirmedJobs: parseInt(process.env.BADGE_CONFIRMED_JOBS || '3', 10),
    confirmedRating: parseFloat(process.env.BADGE_CONFIRMED_RATING || '4.5'),
    expertJobs: parseInt(process.env.BADGE_EXPERT_JOBS || '10', 10),
    expertRating: parseFloat(process.env.BADGE_EXPERT_RATING || '4.7'),
    // Accès anticipé aux campagnes pour les ambassadeurs (heures) ; 0 = désactivé
    earlyAccessHours: parseInt(process.env.EARLY_ACCESS_HOURS || '24', 10),
  },

  // Documents légaux (version acceptée à l'inscription)
  legal: {
    termsVersion: process.env.LEGAL_TERMS_VERSION || '2026-09-09',
  },

  // Business rules
  business: {
    autoApprovalDays: 7,
    maxRevisions: 2,
    revisionDeadlineDays: 3,
    minCreatorVideos: parseInt(process.env.MIN_CREATOR_VIDEOS || '3', 10),
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
