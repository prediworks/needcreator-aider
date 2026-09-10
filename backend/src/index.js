import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { connectDB } from './db/connection.js';
import logger from './utils/logger.js';
import { runScheduledJobs } from './jobs/autoApproval.js';

// Import routes
import authRoutes from './routes/auth.js';
import campaignRoutes from './routes/campaigns.js';
import deliveryRoutes from './routes/deliveries.js';
import reviewRoutes from './routes/reviews.js';
import webhookRoutes from './routes/webhooks.js';
import adminRoutes from './routes/admin.js';
import portfolioRoutes from './routes/portfolio.js';
import creatorRoutes from './routes/creators.js';
import messageRoutes from './routes/messages.js';
import integrationRoutes from './routes/integrations.js';
import billingRoutes from './routes/billing.js';
import reportRoutes from './routes/reports.js';
import externalCreatorRoutes from './routes/externalCreators.js';

const app = express();

// Middleware
app.use(helmet());
app.set('trust proxy', 1);
app.use(cors({
  origin: (origin, callback) => {
    // Autorise les requêtes sans origine (curl, tests) et les origines listées
    if (!origin || config.cors.origins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origine non autorisée par CORS : ${origin}`));
  },
  credentials: true,
}));

// Webhooks Stripe : doivent recevoir le corps brut (avant express.json)
app.use('/api/webhooks', webhookRoutes);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMaxRequests,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: config.env,
  });
});

// API routes
logger.info('Mounting API routes...');
app.use('/api/auth', authRoutes);
logger.info('✓ Auth routes mounted at /api/auth');
app.use('/api/campaigns', campaignRoutes);
logger.info('✓ Campaign routes mounted at /api/campaigns');
app.use('/api/deliveries', deliveryRoutes);
logger.info('✓ Delivery routes mounted at /api/deliveries');
app.use('/api/reviews', reviewRoutes);
logger.info('✓ Review routes mounted at /api/reviews');
app.use('/api/admin', adminRoutes);
logger.info('✓ Admin routes mounted at /api/admin');
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/creators', creatorRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/external-creators', externalCreatorRoutes);
logger.info('✓ Portfolio routes mounted at /api/portfolio');

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    error: config.env === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(config.env !== 'production' && { stack: err.stack }),
  });
});

// Start server
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Alignement des données : drapeau isAmbassador (tri / mise en avant)
    try {
      const { default: User } = await import('./models/User.js');
      await User.updateMany({ 'profile.ambassador.status': 'approved', 'profile.isAmbassador': { $ne: true } }, { $set: { 'profile.isAmbassador': true } });
    } catch (err) { logger.warn(`Migration isAmbassador ignorée : ${err.message}`); }
    
    // Start listening
    const PORT = config.port;
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT} in ${config.env} mode`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🌐 CORS autorisé pour : ${config.cors.origins.join(', ')}`);
    });
    
    // Tâches planifiées (auto-approbation à J+7, rappels J+3/J+6)
    // Exécutées au démarrage puis toutes les N minutes (JOBS_INTERVAL_MINUTES, 60 par défaut)
    if (config.env !== 'test') {
      const intervalMs = config.business.jobsIntervalMinutes * 60 * 1000;
      setTimeout(() => runScheduledJobs(), 10000);
      setInterval(() => runScheduledJobs(), intervalMs);
      logger.info(`⏰ Scheduled jobs configured (every ${config.business.jobsIntervalMinutes} min)`);
    }
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Une promesse rejetée sans catch ne doit pas couper le service pour tous les utilisateurs :
// on journalise (et Sentry remontera l'erreur), le processus continue.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason instanceof Error ? reason.stack : reason);
});

// Start the server
startServer();

export default app;
