import mongoose from 'mongoose';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

let isConnected = false;

export async function connectDB() {
  if (isConnected) {
    logger.info('Using existing MongoDB connection');
    return;
  }

  try {
    const conn = await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    
    isConnected = true;
    logger.info(`MongoDB connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
      isConnected = false;
    });
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed through app termination');
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    throw error;
  }
}

export async function disconnectDB() {
  if (!isConnected) return;
  
  await mongoose.connection.close();
  isConnected = false;
  logger.info('MongoDB disconnected');
}
