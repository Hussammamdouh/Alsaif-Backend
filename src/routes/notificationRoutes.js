const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { adminAnalyticsLimiter } = require('../middleware/advancedRateLimit');
const { ROLES } = require('../constants');

/**
 * Notification Routes
 *
 * Public routes: None
 * User routes: Preferences, history, actions
 * Admin routes: Analytics, view all
 * SECURITY: Admin analytics endpoints protected with stricter rate limiting
 */

// ==================== USER ROUTES ====================

/**
 * @route   GET /api/notifications/preferences
 * @desc    Get current user's notification preferences
 * @access  Private (User)
 */
router.get('/preferences', authenticateToken, notificationController.getMyPreferences);

/**
 * @route   PATCH /api/notifications/preferences
 * @desc    Update current user's notification preferences
 * @access  Private (User)
 */
router.patch('/preferences', authenticateToken, notificationController.updateMyPreferences);

/**
 * @route   POST /api/notifications/push-token
 * @desc    Add push notification token for current user
 * @access  Private (User)
 */
router.post('/push-token', authenticateToken, notificationController.addPushToken);

/**
 * @route   DELETE /api/notifications/push-token
 * @desc    Remove push notification token
 * @access  Private (User)
 */
router.delete('/push-token', authenticateToken, notificationController.removePushToken);

/**
 * @route   GET /api/notifications/history
 * @desc    Get current user's notification history
 * @access  Private (User)
 */
router.get('/history', authenticateToken, notificationController.getMyNotifications);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notifications count
 * @access  Private (User)
 */
router.get('/unread-count', authenticateToken, notificationController.getUnreadCount);

/**
 * @route   PATCH /api/notifications/:notificationId/read
 * @desc    Mark notification as read
 * @access  Private (User)
 */
router.patch('/:notificationId/read', authenticateToken, notificationController.markAsRead);

/**
 * @route   POST /api/notifications/mark-all-read
 * @desc    Mark all notifications as read
 * @access  Private (User)
 */
router.post('/mark-all-read', authenticateToken, notificationController.markAllAsRead);

/**
 * @route   DELETE /api/notifications/:notificationId
 * @desc    Dismiss notification
 * @access  Private (User)
 */
router.delete('/:notificationId', authenticateToken, notificationController.dismissNotification);

/**
 * @route   POST /api/notifications/:notificationId/click
 * @desc    Track notification click
 * @access  Private (User)
 */
router.post('/:notificationId/click', authenticateToken, notificationController.trackClick);

/**
 * @route   POST /api/notifications/test
 * @desc    Test notification (development only)
 * @access  Private (User)
 */
router.post('/test', authenticateToken, notificationController.testNotification);

// ==================== ADMIN ROUTES ====================

/**
 * @route   GET /api/admin/notifications/analytics
 * @desc    Get notification analytics
 * @access  Private (Admin, Superadmin)
 * @security Rate limited: 50 req/15min (admins), 100 req/15min (superadmins)
 */
router.get(
  '/admin/analytics',
  authenticateToken,
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN),
  adminAnalyticsLimiter,
  notificationController.getAnalytics
);

/**
 * @route   GET /api/admin/notifications
 * @desc    Get all notifications with filters
 * @access  Private (Admin, Superadmin)
 * @security Rate limited: 50 req/15min (admins), 100 req/15min (superadmins)
 */
router.get(
  '/admin/all',
  authenticateToken,
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN),
  adminAnalyticsLimiter,
  notificationController.getAllNotifications
);

/**
 * @route   GET /api/admin/users/:userId/notification-preferences
 * @desc    Get user's notification preferences
 * @access  Private (Admin, Superadmin)
 * @security Rate limited: 50 req/15min (admins), 100 req/15min (superadmins)
 */
router.get(
  '/admin/users/:userId/preferences',
  authenticateToken,
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN),
  adminAnalyticsLimiter,
  notificationController.getUserPreferences
);

module.exports = router;
