/**
 * Push Notification Routes
 *
 * Endpoints for Web Push API subscriptions and notifications
 */

const express = require('express');
const router = express.Router();
const pushNotificationController = require('../controllers/pushNotificationController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

/**
 * @route   GET /api/push/public-key
 * @desc    Get VAPID public key for subscription
 * @access  Public
 */
router.get('/public-key', pushNotificationController.getPublicKey);

/**
 * User routes (authenticated)
 */
router.use(authenticateToken);

/**
 * @route   POST /api/push/subscribe
 * @desc    Subscribe to push notifications
 * @access  Private
 */
router.post('/subscribe', pushNotificationController.subscribe);

/**
 * @route   POST /api/push/unsubscribe
 * @desc    Unsubscribe from push notifications
 * @access  Private
 */
router.post('/unsubscribe', pushNotificationController.unsubscribe);

/**
 * @route   GET /api/push/subscriptions
 * @desc    Get user's subscriptions
 * @access  Private
 */
router.get('/subscriptions', pushNotificationController.getSubscriptions);

/**
 * @route   POST /api/push/test
 * @desc    Send test notification
 * @access  Private
 */
router.post('/test', pushNotificationController.sendTestNotification);

/**
 * Admin routes
 */
router.use(authorizeRoles(['admin', 'superadmin']));

/**
 * @route   POST /api/push/send/user
 * @desc    Send notification to specific user
 * @access  Admin
 */
router.post('/send/user', pushNotificationController.sendToUser);

/**
 * @route   POST /api/push/send/users
 * @desc    Send notification to multiple users
 * @access  Admin
 */
router.post('/send/users', pushNotificationController.sendToUsers);

/**
 * @route   GET /api/push/statistics
 * @desc    Get push notification statistics
 * @access  Admin
 */
router.get('/statistics', pushNotificationController.getStatistics);

/**
 * @route   POST /api/push/cleanup
 * @desc    Clean up inactive subscriptions
 * @access  Admin
 */
router.post('/cleanup', pushNotificationController.cleanup);

module.exports = router;
