/**
 * Admin Analytics Routes
 * Advanced analytics endpoints for admin dashboard
 */

const express = require('express');
const router = express.Router();
const adminAnalyticsController = require('../controllers/adminAnalyticsController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { query } = require('express-validator');
const { validate } = require('../middleware/validation');

// All routes require admin or superadmin role
router.use(authenticateToken);
router.use(authorizeRoles(['admin', 'superadmin']));

// Query validation for date ranges
const dateRangeValidation = [
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('period').optional().isIn(['day', 'week', 'month', 'year']).withMessage('Invalid period'),
  query('timezone').optional().isString().withMessage('Invalid timezone'),
  validate,
];

/**
 * @route   GET /api/admin/analytics/overview
 * @desc    Get comprehensive analytics overview
 * @access  Admin
 */
router.get('/overview', dateRangeValidation, adminAnalyticsController.getAnalyticsOverview);

/**
 * @route   GET /api/admin/analytics/users/growth
 * @desc    Get user growth trends over time
 * @access  Admin
 */
router.get('/users/growth', dateRangeValidation, adminAnalyticsController.getUserGrowth);

/**
 * @route   GET /api/admin/analytics/users/retention
 * @desc    Get user retention cohort analysis
 * @access  Admin
 */
router.get('/users/retention', dateRangeValidation, adminAnalyticsController.getUserRetention);

/**
 * @route   GET /api/admin/analytics/users/activity
 * @desc    Get user activity patterns
 * @access  Admin
 */
router.get('/users/activity', dateRangeValidation, adminAnalyticsController.getUserActivity);

/**
 * @route   GET /api/admin/analytics/revenue/overview
 * @desc    Get revenue analytics overview
 * @access  Admin
 */
router.get('/revenue/overview', dateRangeValidation, adminAnalyticsController.getRevenueOverview);

/**
 * @route   GET /api/admin/analytics/revenue/trends
 * @desc    Get revenue trends (MRR, ARR, churn)
 * @access  Admin
 */
router.get('/revenue/trends', dateRangeValidation, adminAnalyticsController.getRevenueTrends);

/**
 * @route   GET /api/admin/analytics/revenue/by-tier
 * @desc    Get revenue breakdown by subscription tier
 * @access  Admin
 */
router.get('/revenue/by-tier', dateRangeValidation, adminAnalyticsController.getRevenueByTier);

/**
 * @route   GET /api/admin/analytics/content/performance
 * @desc    Get content performance metrics
 * @access  Admin
 */
router.get('/content/performance', dateRangeValidation, adminAnalyticsController.getContentPerformance);

/**
 * @route   GET /api/admin/analytics/content/top
 * @desc    Get top performing content
 * @access  Admin
 */
router.get('/content/top',
  [
    ...dateRangeValidation,
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
    validate,
  ],
  adminAnalyticsController.getTopContent
);

/**
 * @route   GET /api/admin/analytics/engagement/metrics
 * @desc    Get engagement metrics (views, likes, shares, etc.)
 * @access  Admin
 */
router.get('/engagement/metrics', dateRangeValidation, adminAnalyticsController.getEngagementMetrics);
router.get('/engagement/overview', dateRangeValidation, adminAnalyticsController.getEngagementOverview);

/**
 * @route   GET /api/admin/analytics/conversion/funnel
 * @desc    Get conversion funnel data (free -> premium)
 * @access  Admin
 */
router.get('/conversion/funnel', dateRangeValidation, adminAnalyticsController.getConversionFunnel);

/**
 * @route   GET /api/admin/analytics/realtime/stats
 * @desc    Get real-time statistics
 * @access  Admin
 */
router.get('/realtime/stats', adminAnalyticsController.getRealtimeStats);
router.get('/compare/periods', adminAnalyticsController.comparePeriods);

/**
 * @route   GET /api/admin/analytics/features/usage
 * @desc    Get feature usage analytics
 * @access  Admin
 */
router.get('/features/usage', dateRangeValidation, adminAnalyticsController.getFeatureUsage);

/**
 * @route   GET /api/admin/analytics/users/geo
 * @desc    Get geographic distribution of users
 * @access  Admin
 */
router.get('/users/geo', adminAnalyticsController.getUserGeoStats);

/**
 * @route   GET /api/admin/analytics/devices/distribution
 * @desc    Get device distribution analytics
 * @access  Admin
 */
router.get('/devices/distribution', adminAnalyticsController.getDeviceDistribution);

/**
 * @route   POST /api/admin/analytics/export
 * @desc    Export analytics data to CSV
 * @access  Admin
 */
router.post('/export',
  [
    query('type').isIn(['users', 'revenue', 'content', 'engagement']).withMessage('Invalid export type'),
    ...dateRangeValidation,
    validate,
  ],
  adminAnalyticsController.exportAnalytics
);

module.exports = router;
