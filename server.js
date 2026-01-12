const app = require('./src/app');
const connectDB = require('./src/config/database');
const { PORT, NODE_ENV } = require('./src/config/env');
const logger = require('./src/utils/logger');
const initializeSocket = require('./src/socket');

// Connect to database and start worker after connection
connectDB().then(() => {
  // Start background job worker after DB is connected
  app.startWorker({
    concurrency: process.env.JOB_WORKER_CONCURRENCY || 10,
    pollInterval: process.env.JOB_WORKER_POLL_INTERVAL || 1000
  }).catch((error) => {
    logger.error('[Server] Failed to start job worker!!!:', error);
  });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Server running in ${NODE_ENV} mode on port ${PORT}!`);
});

// Initialize Socket.IO
const io = initializeSocket(server);

// Make io accessible to the rest of the app
app.set('io', io);

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  // Close Socket.IO connections
  io.close(() => {
    logger.info('Socket.IO connections closed');
  });

  server.close(async () => {
    logger.info('HTTP server closed');

    // Close database connection
    try {
      await require('mongoose').connection.close();
      logger.info('MongoDB connection closed');
      process.exit(0);
    } catch (err) {
      logger.error('Error closing MongoDB connection:', err);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Promise Rejection: ${err.message}`, { stack: err.stack });
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = server;
