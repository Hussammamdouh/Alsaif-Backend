/**
 * Admin Notification Routes
 * Broadcast notifications to users
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { ROLES } = require('../constants');
const { body, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { strictLimiter } = require('../middleware/advancedRateLimit');
const adminNotificationController = require('../controllers/adminNotificationController');

// All routes require admin or superadmin role
router.use(authenticateToken);
router.use(authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN));

// Broadcast notification validation
const broadcastValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 100 })
    .withMessage('Title must not exceed 100 characters'),
  body('body')
    .trim()
    .notEmpty()
    .withMessage('Body is required')
    .isLength({ max: 500 })
    .withMessage('Body must not exceed 500 characters'),
  body('target')
    .isIn(['all', 'premium', 'basic', 'admins', 'active'])
    .withMessage('Invalid target audience'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority'),
  body('actionUrl')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Action URL must not exceed 200 characters'),
  body('scheduledFor')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format for scheduledFor'),
  validate
];

/**
 * POST /api/admin/notifications/broadcast
 * Broadcast notification to target audience
 * Rate limited to prevent spam
 */
router.post(
  '/broadcast',
  strictLimiter,
  broadcastValidation,
  adminNotificationController.broadcastNotification
);

/**
 * GET /api/admin/notifications/history
 * Get broadcast notification history
 */
router.get(
  '/history',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    validate
  ],
  adminNotificationController.getBroadcastHistory
);

/**
 * GET /api/admin/notifications/stats
 * Get notification statistics
 */
router.get('/stats', adminNotificationController.getNotificationStats);

module.exports = router;
