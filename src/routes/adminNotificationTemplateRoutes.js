/**
 * Admin Notification Template Routes
 * Endpoints for managing notification templates
 */

const express = require('express');
const router = express.Router();
const adminNotificationTemplateController = require('../controllers/adminNotificationTemplateController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { body, query } = require('express-validator');
const { validate } = require('../middleware/validation');

// All routes require admin or superadmin role
router.use(authenticateToken);
router.use(authorizeRoles(['admin', 'superadmin']));

/**
 * @route   GET /api/admin/notification-templates
 * @desc    Get all notification templates
 * @access  Admin
 */
router.get(
  '/',
  [
    query('category')
      .optional()
      .isIn(['user', 'subscription', 'content', 'payment', 'system', 'marketing'])
      .withMessage('Invalid category'),
    query('eventTrigger').optional().isString(),
    query('isActive').optional().isBoolean(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate,
  ],
  adminNotificationTemplateController.getAllTemplates
);

/**
 * @route   GET /api/admin/notification-templates/by-category
 * @desc    Get templates grouped by category
 * @access  Admin
 */
router.get('/by-category', adminNotificationTemplateController.getTemplatesByCategory);

/**
 * @route   GET /api/admin/notification-templates/:templateId
 * @desc    Get a specific notification template
 * @access  Admin
 */
router.get('/:templateId', adminNotificationTemplateController.getTemplate);

/**
 * @route   POST /api/admin/notification-templates
 * @desc    Create a new notification template
 * @access  Admin
 */
router.post(
  '/',
  [
    body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Name is required (max 100 chars)'),
    body('slug')
      .optional()
      .trim()
      .isSlug()
      .isLength({ max: 100 })
      .withMessage('Slug must be a valid slug format'),
    body('description').optional().trim().isLength({ max: 500 }),
    body('category')
      .isIn(['user', 'subscription', 'content', 'payment', 'system', 'marketing'])
      .withMessage('Invalid category'),
    body('eventTrigger')
      .isIn([
        'user_signup',
        'user_activated',
        'user_suspended',
        'subscription_created',
        'subscription_renewed',
        'subscription_expiring',
        'subscription_expired',
        'subscription_cancelled',
        'payment_successful',
        'payment_failed',
        'payment_refunded',
        'insight_published',
        'insight_approved',
        'insight_rejected',
        'custom',
      ])
      .withMessage('Invalid event trigger'),
    body('channels').isObject().withMessage('Channels configuration is required'),
    body('channels.email.enabled').optional().isBoolean(),
    body('channels.email.subject').optional().trim().isLength({ max: 200 }),
    body('channels.push.enabled').optional().isBoolean(),
    body('channels.sms.enabled').optional().isBoolean(),
    body('channels.inApp.enabled').optional().isBoolean(),
    body('variables').optional().isArray(),
    body('targetAudience').optional().isObject(),
    body('scheduling').optional().isObject(),
    body('isActive').optional().isBoolean(),
    validate,
  ],
  adminNotificationTemplateController.createTemplate
);

/**
 * @route   PATCH /api/admin/notification-templates/:templateId
 * @desc    Update a notification template
 * @access  Admin
 */
router.patch(
  '/:templateId',
  [
    body('name').optional().trim().isLength({ max: 100 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('channels').optional().isObject(),
    body('variables').optional().isArray(),
    body('targetAudience').optional().isObject(),
    body('scheduling').optional().isObject(),
    body('isActive').optional().isBoolean(),
    validate,
  ],
  adminNotificationTemplateController.updateTemplate
);

/**
 * @route   DELETE /api/admin/notification-templates/:templateId
 * @desc    Delete a notification template
 * @access  Admin
 */
router.delete('/:templateId', adminNotificationTemplateController.deleteTemplate);

/**
 * @route   POST /api/admin/notification-templates/:templateId/clone
 * @desc    Clone a notification template
 * @access  Admin
 */
router.post(
  '/:templateId/clone',
  [
    body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Name is required'),
    body('slug').trim().notEmpty().isSlug().withMessage('Valid slug is required'),
    validate,
  ],
  adminNotificationTemplateController.cloneTemplate
);

/**
 * @route   POST /api/admin/notification-templates/:templateId/activate
 * @desc    Activate a notification template
 * @access  Admin
 */
router.post('/:templateId/activate', adminNotificationTemplateController.activateTemplate);

/**
 * @route   POST /api/admin/notification-templates/:templateId/deactivate
 * @desc    Deactivate a notification template
 * @access  Admin
 */
router.post('/:templateId/deactivate', adminNotificationTemplateController.deactivateTemplate);

/**
 * @route   POST /api/admin/notification-templates/:templateId/preview
 * @desc    Preview a notification template with sample variables
 * @access  Admin
 */
router.post(
  '/:templateId/preview',
  [
    body('variables').optional().isObject(),
    body('channel')
      .optional()
      .isIn(['email', 'push', 'sms', 'inApp'])
      .withMessage('Invalid channel'),
    validate,
  ],
  adminNotificationTemplateController.previewTemplate
);

/**
 * @route   GET /api/admin/notification-templates/:templateId/analytics
 * @desc    Get analytics for a notification template
 * @access  Admin
 */
router.get('/:templateId/analytics', adminNotificationTemplateController.getTemplateAnalytics);

/**
 * @route   POST /api/admin/notification-templates/:templateId/test-send
 * @desc    Test send a notification template
 * @access  Admin
 */
router.post(
  '/:templateId/test-send',
  [
    body('channel')
      .isIn(['email', 'push', 'sms', 'inApp'])
      .withMessage('Valid channel is required'),
    body('variables').optional().isObject(),
    body('recipient').trim().notEmpty().withMessage('Recipient is required'),
    validate,
  ],
  adminNotificationTemplateController.testSendTemplate
);

module.exports = router;
