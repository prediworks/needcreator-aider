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
