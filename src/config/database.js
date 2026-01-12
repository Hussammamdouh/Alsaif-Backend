const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    // PERFORMANCE: Configure connection pool and timeouts
    const options = {
      maxPoolSize: 10,          // Maximum 10 connections in pool
      minPoolSize: 2,           // Minimum 2 connections always ready
      serverSelectionTimeoutMS: 5000,  // Timeout after 5s trying to connect
      socketTimeoutMS: 45000,   // Close sockets after 45s of inactivity
      family: 4,                // Use IPv4, skip IPv6
      connectTimeoutMS: 10000,  // Initial connection timeout
      heartbeatFrequencyMS: 10000 // Check server health every 10s
    };

    const conn = await mongoose.connect(process.env.MONGODB_URI, options);
    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    // Connection event handlers
    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
