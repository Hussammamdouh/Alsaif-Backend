/**
 * Admin Dashboard Routes
 *
 * Endpoints for admin dashboard metrics and analytics
 */

const express = require('express');
const router = express.Router();
const adminDashboardController = require('../controllers/adminDashboardController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

// All routes require admin or superadmin role
router.use(authenticateToken);
router.use(authorizeRoles(['admin', 'superadmin']));

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get all dashboard data (initial load)
 * @access  Admin
 */
router.get('/', adminDashboardController.getAllDashboardData);

/**
 * @route   GET /api/admin/dashboard/overview
 * @desc    Get dashboard overview statistics
 * @access  Admin
 */
router.get('/overview', adminDashboardController.getOverview);

/**
 * @route   GET /api/admin/dashboard/users
 * @desc    Get user analytics
 * @access  Admin
 */
router.get('/users', adminDashboardController.getUserAnalytics);

/**
 * @route   GET /api/admin/dashboard/content
 * @desc    Get content analytics
 * @access  Admin
 */
router.get('/content', adminDashboardController.getContentAnalytics);

/**
 * @route   GET /api/admin/dashboard/engagement
 * @desc    Get engagement metrics
 * @access  Admin
 */
router.get('/engagement', adminDashboardController.getEngagementMetrics);

/**
 * @route   GET /api/admin/dashboard/health
 * @desc    Get system health metrics
 * @access  Admin
 */
router.get('/health', adminDashboardController.getSystemHealth);

/**
 * @route   GET /api/admin/dashboard/activity
 * @desc    Get activity logs
 * @access  Admin
 */
router.get('/activity', adminDashboardController.getActivityLogs);

/**
 * @route   GET /api/admin/dashboard/notifications
 * @desc    Get notification statistics
 * @access  Admin
 */
router.get('/notifications', adminDashboardController.getNotificationStats);

module.exports = router;
