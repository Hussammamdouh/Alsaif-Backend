/**
 * Analytics Routes
 *
 * Endpoints for analytics and reporting
 */

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

/**
 * All analytics routes require admin authentication
 */
router.use(authenticateToken);
router.use(authorizeRoles(['admin', 'superadmin']));

/**
 * @route   GET /api/analytics/dashboard
 * @desc    Get dashboard analytics overview
 * @access  Admin
 * @query   period - daily/weekly/monthly (default: daily)
 * @query   days - number of days to retrieve (default: 30)
 */
router.get('/dashboard', analyticsController.getDashboard);

/**
 * @route   GET /api/analytics/users
 * @desc    Get user analytics (DAU, MAU, new users, churn)
 * @access  Admin
 */
router.get('/users', analyticsController.getUserAnalytics);

/**
 * @route   GET /api/analytics/content
 * @desc    Get content analytics (views, engagement, top insights)
 * @access  Admin
 */
router.get('/content', analyticsController.getContentAnalytics);

/**
 * @route   GET /api/analytics/business
 * @desc    Get business analytics (subscriptions, revenue, growth)
 * @access  Admin
 */
router.get('/business', analyticsController.getBusinessAnalytics);

/**
 * @route   GET /api/analytics/engagement
 * @desc    Get engagement analytics (session duration, pages per session)
 * @access  Admin
 */
router.get('/engagement', analyticsController.getEngagementAnalytics);

/**
 * @route   GET /api/analytics/content/performance
 * @desc    Get detailed content performance report
 * @access  Admin
 */
router.get('/content/performance', analyticsController.getContentPerformance);

/**
 * @route   GET /api/analytics/categories
 * @desc    Get category performance breakdown
 * @access  Admin
 */
router.get('/categories', analyticsController.getCategoryPerformance);

/**
 * @route   POST /api/analytics/aggregate
 * @desc    Manually trigger analytics aggregation
 * @access  Admin
 * @body    date - optional date to aggregate (default: today)
 */
router.post('/aggregate', analyticsController.aggregateAnalytics);

module.exports = router;
