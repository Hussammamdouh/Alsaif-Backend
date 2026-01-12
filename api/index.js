/**
 * Vercel Serverless Entry Point
 *
 * DEPLOYMENT TARGET: Vercel (Development & Testing only)
 *
 * LIMITATIONS (by design for serverless):
 * - No WebSocket support (Socket.IO disabled)
 * - No background workers (cron jobs disabled)
 * - No job queue processing (queue population only)
 * - Stateless request/response only
 *
 * FEATURES AVAILABLE:
 * - All REST API endpoints
 * - Authentication & Authorization
 * - Database operations
 * - Job creation (jobs processed by VPS workers)
 *
 * For full features including WebSockets and background processing,
 * deploy to VPS using the standard server.js entry point.
 */

// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { securityHeaders, mongoSanitizer } = require('../src/middleware/security');
const { roleAwareApiLimiter } = require('../src/middleware/advancedRateLimit');
const { errorHandler, notFound } = require('../src/middleware/errorHandler');
const logger = require('../src/utils/logger');
const { HTTP_STATUS } = require('../src/constants');
const { NODE_ENV } = require('../src/config/env');

// Import routes
const authRoutes = require('../src/routes/authRoutes');
const adminRoutes = require('../src/routes/adminRoutes');
const superadminRoutes = require('../src/routes/superadminRoutes');
const chatRoutes = require('../src/routes/chatRoutes');
const abuseRoutes = require('../src/routes/abuseRoutes');
const insightRoutes = require('../src/routes/insightRoutes');
const adminChatRoutes = require('../src/routes/adminChatRoutes');
const subscriptionRoutes = require('../src/routes/subscriptionRoutes');
const notificationRoutes = require('../src/routes/notificationRoutes');
const jobRoutes = require('../src/routes/jobRoutes');

const app = express();

// SERVERLESS COMPATIBILITY: Lazy database connection
// Only connect when first request arrives (handles cold starts)
let dbConnected = false;
const connectDB = require('../src/config/database');

app.use(async (req, res, next) => {
  if (!dbConnected) {
    try {
      await connectDB();
      dbConnected = true;
      logger.info('[Vercel] Database connection established');
    } catch (error) {
      logger.error('[Vercel] Database connection failed:', error);
      return res.status(HTTP_STATUS.INTERNAL_SERVER).json({
        success: false,
        message: 'Service temporarily unavailable'
      });
    }
  }
  next();
});

// Trust proxy (required for Vercel)
app.set('trust proxy', 1);

// Security middleware
app.use(securityHeaders());
app.use(mongoSanitizer());

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:19006'];

    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging (minimal for serverless)
if (NODE_ENV === 'development') {
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });
}

// Health check (serverless-specific)
app.get('/health', (req, res) => {
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Vercel serverless API running',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    features: {
      websockets: false,
      backgroundJobs: false,
      cronJobs: false
    }
  });
});

// API Routes with rate limiting
app.use('/api', roleAwareApiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/abuse', abuseRoutes);
app.use('/api/admin/insights', insightRoutes);
app.use('/api/admin/chats', adminChatRoutes);
app.use('/api/admin/jobs', jobRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/insights', insightRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Vercel requires default export
module.exports = app;
