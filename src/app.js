const express = require('express');
const compression = require('compression');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const superadminRoutes = require('./routes/superadminRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');
const abuseRoutes = require('./routes/abuseRoutes');
const insightRoutes = require('./routes/insightRoutes');
const commentRoutes = require('./routes/commentRoutes');
const adminChatRoutes = require('./routes/adminChatRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const jobRoutes = require('./routes/jobRoutes');
const groupChatRoutes = require('./routes/groupChatRoutes');
const reportRoutes = require('./routes/reportRoutes');
const marketRoutes = require('./routes/marketRoutes');
const insightRequestRoutes = require('./routes/insightRequestRoutes');
const newsRoutes = require('./routes/newsRoutes');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { securityHeaders, mongoSanitizer, loginLimiter, registerLimiter } = require('./middleware/security');
const {
  roleAwareApiLimiter,
  messageLimiter,
  contentCreationLimiter,
  bulkOperationLimiter
} = require('./middleware/advancedRateLimit');
const logger = require('./utils/logger');
const { HTTP_STATUS } = require('./constants');
const { NODE_ENV } = require('./config/env');
const notificationService = require('./services/notificationService');
const notificationScheduler = require('./services/notificationScheduler');
const emailService = require('./services/emailService');
const backupScheduler = require('./workers/backupScheduler');
const { startWorker } = require('./workers');

const app = express();

// Initialize notification service and scheduler
notificationService.initialize();
notificationScheduler.initialize();

// Initialize email service
emailService.initialize().catch((error) => {
  logger.error('[App] Failed to initialize email service:', error);
});

// Initialize backup scheduler
backupScheduler.initialize().catch((error) => {
  logger.error('[App] Failed to initialize backup scheduler:', error);
});

// Initialize push notification service
const pushNotificationService = require('./services/pushNotificationService');
pushNotificationService.initialize().catch((error) => {
  logger.error('[App] Failed to initialize push notification service:', error);
});

// Initialize mobile push service
const mobilePushService = require('./services/mobilePushService');
mobilePushService.initialize().catch((error) => {
  logger.error('[App] Failed to initialize mobile push service:', error);
});

// Initialize performance monitoring service
const performanceMonitoringService = require('./services/performanceMonitoringService');
// Market Data Service initialization moved to server.js to ensure DB connection
const marketDataService = require('./services/marketDataService');
// marketDataService.initialize() is now handled in server.js


// Export startWorker for server.js to call after DB connection
app.startWorker = startWorker;

// Trust proxy (important for rate limiting and IP detection)
app.set('trust proxy', 1);

// Security middleware
app.use(securityHeaders());
app.use(compression());
app.use(mongoSanitizer());

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:19006']; // Default for dev

    // Allow all origins if ALLOWED_ORIGINS is set to '*'
    if (allowedOrigins.includes('*')) {
      callback(null, true);
      return;
    }

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (NODE_ENV === 'development') {
      callback(null, true); // Allow all in development
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
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

// Monitoring middleware (tracks metrics and performance)
const { requestMonitoring } = require('./middleware/monitoringMiddleware');
app.use(requestMonitoring);

// Performance monitoring middleware
const { trackPerformance, trackErrors } = require('./middleware/performanceMiddleware');
app.use(trackPerformance);

// i18n middleware (language detection)
const { detectLanguage } = require('./middleware/i18nMiddleware');
app.use(detectLanguage);

// Health check
app.get('/health', (req, res) => {
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV
  });
});

// API Routes with advanced role-aware rate limiting
app.use('/api', roleAwareApiLimiter); // Role-aware rate limiting for all API routes

// Auth routes (with specific limiters applied in authRoutes)
app.use('/api/auth', authRoutes);

// User routes (profile and settings)
app.use('/api/users', userRoutes);

// Admin routes (with bulk operation limiter for bulk endpoints)
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');
app.use('/api/admin/dashboard', adminDashboardRoutes); // Admin dashboard

app.use('/api/admin', adminRoutes);
app.use('/api/admin/abuse', abuseRoutes);
app.use('/api/admin/insights', insightRoutes); // Admin insight management
app.use('/api/admin/chats', adminChatRoutes); // Admin chat management
app.use('/api/admin/jobs', jobRoutes); // Admin job queue management
app.use('/api/admin/insight-requests', insightRequestRoutes); // Admin insight requests

// New Admin Enhancement Routes
const adminAnalyticsRoutes = require('./routes/adminAnalyticsRoutes');
const adminFilterRoutes = require('./routes/adminFilterRoutes');
const adminModerationRoutes = require('./routes/adminModerationRoutes');
const adminRevenueRoutes = require('./routes/adminRevenueRoutes');
const adminSubscriptionPlansRoutes = require('./routes/adminSubscriptionPlansRoutes');
const adminDiscountCodeRoutes = require('./routes/adminDiscountCodeRoutes');
const adminNotificationTemplateRoutes = require('./routes/adminNotificationTemplateRoutes');
const adminNotificationRoutes = require('./routes/adminNotificationRoutes');
const adminBulkRoutes = require('./routes/adminBulkRoutes');
const adminBannerRoutes = require('./routes/adminBannerRoutes');

app.use('/api/admin/analytics', adminAnalyticsRoutes); // Analytics dashboard
app.use('/api/admin/filters', adminFilterRoutes); // Advanced filtering
app.use('/api/admin/moderation', adminModerationRoutes); // Content moderation
app.use('/api/admin/revenue', adminRevenueRoutes); // Revenue dashboard
app.use('/api/admin/subscription-plans', adminSubscriptionPlansRoutes); // Subscription plans management
app.use('/api/admin/discount-codes', adminDiscountCodeRoutes); // Discount codes
app.use('/api/admin/notification-templates', adminNotificationTemplateRoutes); // Notification templates
app.use('/api/admin/notifications', adminNotificationRoutes); // Broadcast notifications
app.use('/api/admin/bulk', adminBulkRoutes); // Bulk operations
app.use('/api/admin/banners', adminBannerRoutes); // Banner management

// Superadmin routes (bypass rate limits via roleAwareApiLimiter)
app.use('/api/superadmin', superadminRoutes);

// Chat routes (with message limiter applied in socket handlers)
app.use('/api/chats', groupChatRoutes); // Group chat settings and permissions (Specific routes first)
app.use('/api/chats', chatRoutes);

// Message routes (edit, delete, pin, reactions, etc.)
app.use('/api/messages', messageRoutes);

// Subscription routes (mixed public/user/admin)
app.use('/api/subscriptions', subscriptionRoutes);

// Notification routes (user preferences, history, admin analytics)
app.use('/api/notifications', notificationRoutes);

// Public banner access
app.use('/api/banners', bannerRoutes);

// Public insight access
app.use('/api/insights', insightRoutes);
app.use('/api/insight-requests', insightRequestRoutes);

// Comment routes (mixed public/authenticated)
app.use('/api/comments', commentRoutes);

// Search routes (public)
const searchRoutes = require('./routes/searchRoutes');
app.use('/api/search', searchRoutes);

// Report routes
app.use('/api/reports', reportRoutes);

// Media routes (upload/download)
const mediaRoutes = require('./routes/mediaRoutes');
app.use('/api/media', mediaRoutes);

// Analytics routes (admin only)
const analyticsRoutes = require('./routes/analyticsRoutes');
app.use('/api/analytics', analyticsRoutes);

// Social routes (comments, likes, saves, follows)
const socialRoutes = require('./routes/socialRoutes');
app.use('/api/social', socialRoutes);

// Version routes (content versioning)
const versionRoutes = require('./routes/versionRoutes');
app.use('/api/versions', versionRoutes);

// Monitoring routes (metrics and health)
const monitoringRoutes = require('./routes/monitoringRoutes');
app.use('/api/monitoring', monitoringRoutes);

// Backup routes (database backups)
const backupRoutes = require('./routes/backupRoutes');
app.use('/api/backups', backupRoutes);

// SEO routes (meta tags, sitemap, robots)
const seoRoutes = require('./routes/seoRoutes');
app.use('/api/seo', seoRoutes);

// i18n routes (translations, languages)
const i18nRoutes = require('./routes/i18nRoutes');
app.use('/api/i18n', i18nRoutes);

// Export routes (PDF, CSV exports)
const exportRoutes = require('./routes/exportRoutes');
app.use('/api/export', exportRoutes);

// Push notification routes (Web Push API)
const pushNotificationRoutes = require('./routes/pushNotificationRoutes');
app.use('/api/push', pushNotificationRoutes);

// Market Data Routes
app.use('/api/market', marketRoutes);

// News Routes
app.use('/api/news', newsRoutes);

// Static file serving for uploaded images
app.use('/uploads', express.static('public/uploads'));

// Error monitoring middleware
const { errorMonitoring } = require('./middleware/monitoringMiddleware');
app.use(errorMonitoring);

// Performance error tracking (must be before error handlers)
app.use(trackErrors);

// Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
