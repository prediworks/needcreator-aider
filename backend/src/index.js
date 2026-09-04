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

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
}));
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

// Webhooks (before body parser middleware)
app.use('/api/webhooks', webhookRoutes);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/portfolio', portfolioRoutes);

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
    
    // Start listening
    const PORT = config.port;
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT} in ${config.env} mode`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
    });
    
    // Schedule cron jobs (run every day at 2 AM)
    if (config.env === 'production') {
      setInterval(() => {
        const now = new Date();
        if (now.getHours() === 2 && now.getMinutes() === 0) {
          runScheduledJobs();
        }
      }, 60000); // Check every minute
      
      logger.info('⏰ Scheduled jobs configured');
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

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();

export default app;
