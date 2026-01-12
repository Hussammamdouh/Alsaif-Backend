/**
 * Admin Bulk Operations Routes
 * Endpoints for performing bulk actions on users, insights, and subscriptions
 */

const express = require('express');
const router = express.Router();
const adminBulkController = require('../controllers/adminBulkController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');
const { strictLimiter } = require('../middleware/advancedRateLimit');

// All routes require admin or superadmin role
router.use(authenticateToken);
router.use(authorizeRoles(['admin', 'superadmin']));

// Validation schemas
const bulkUserActionValidation = [
  body('userIds').isArray({ min: 1, max: 500 }).withMessage('userIds must be an array with 1-500 items'),
  body('userIds.*').isMongoId().withMessage('Invalid user ID'),
  body('reason').trim().notEmpty().withMessage('Reason is required').isLength({ max: 500 }),
  validate,
];

const bulkInsightActionValidation = [
  body('insightIds').isArray({ min: 1, max: 200 }).withMessage('insightIds must be an array with 1-200 items'),
  body('insightIds.*').isMongoId().withMessage('Invalid insight ID'),
  validate,
];

const bulkSubscriptionValidation = [
  body('userIds').isArray({ min: 1, max: 500 }).withMessage('userIds must be an array with 1-500 items'),
  body('userIds.*').isMongoId().withMessage('Invalid user ID'),
  body('tier').isIn(['basic', 'starter', 'premium', 'pro', 'enterprise']).withMessage('Invalid tier'),
  body('durationDays').isInt({ min: 1, max: 365 }).withMessage('Duration must be between 1-365 days'),
  body('reason').trim().notEmpty().withMessage('Reason is required'),
  validate,
];

/**
 * User Bulk Operations
 */

/**
 * @route   POST /api/admin/bulk/users/suspend
 * @desc    Suspend multiple users at once
 * @access  Admin
 */
router.post('/users/suspend',
  strictLimiter,
  bulkUserActionValidation,
  adminBulkController.bulkSuspendUsers
);

/**
 * @route   POST /api/admin/bulk/users/activate
 * @desc    Activate multiple users at once
 * @access  Admin
 */
router.post('/users/activate',
  strictLimiter,
  bulkUserActionValidation,
  adminBulkController.bulkActivateUsers
);

/**
 * @route   POST /api/admin/bulk/users/delete
 * @desc    Delete multiple users at once
 * @access  Superadmin only
 */
router.post('/users/delete',
  authenticateToken,
  authorizeRoles(['superadmin']),
  strictLimiter,
  bulkUserActionValidation,
  adminBulkController.bulkDeleteUsers
);

/**
 * @route   POST /api/admin/bulk/users/export
 * @desc    Export selected users to CSV
 * @access  Admin
 */
router.post('/users/export',
  [
    body('userIds').isArray().withMessage('userIds must be an array'),
    body('fields').optional().isArray().withMessage('fields must be an array'),
    validate,
  ],
  adminBulkController.exportUsers
);

/**
 * @route   POST /api/admin/bulk/users/message
 * @desc    Send targeted message to multiple users
 * @access  Admin
 */
router.post('/users/message',
  strictLimiter,
  [
    body('userIds').isArray({ min: 1, max: 1000 }).withMessage('userIds must be an array with 1-1000 items'),
    body('userIds.*').isMongoId().withMessage('Invalid user ID'),
    body('title').trim().notEmpty().isLength({ max: 100 }),
    body('body').trim().notEmpty().isLength({ max: 500 }),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
    validate,
  ],
  adminBulkController.bulkMessageUsers
);

/**
 * Insight Bulk Operations
 */

/**
 * @route   POST /api/admin/bulk/insights/publish
 * @desc    Publish multiple insights at once
 * @access  Admin
 */
router.post('/insights/publish',
  bulkInsightActionValidation,
  adminBulkController.bulkPublishInsights
);

/**
 * @route   POST /api/admin/bulk/insights/unpublish
 * @desc    Unpublish multiple insights at once
 * @access  Admin
 */
router.post('/insights/unpublish',
  bulkInsightActionValidation,
  adminBulkController.bulkUnpublishInsights
);

/**
 * @route   POST /api/admin/bulk/insights/archive
 * @desc    Archive multiple insights at once
 * @access  Admin
 */
router.post('/insights/archive',
  bulkInsightActionValidation,
  adminBulkController.bulkArchiveInsights
);

/**
 * @route   POST /api/admin/bulk/insights/delete
 * @desc    Delete multiple insights at once
 * @access  Admin
 */
router.post('/insights/delete',
  strictLimiter,
  [
    ...bulkInsightActionValidation,
    body('reason').trim().notEmpty().withMessage('Reason is required'),
    validate,
  ],
  adminBulkController.bulkDeleteInsights
);

/**
 * @route   POST /api/admin/bulk/insights/update-category
 * @desc    Update category for multiple insights
 * @access  Admin
 */
router.post('/insights/update-category',
  [
    body('insightIds').isArray({ min: 1, max: 200 }),
    body('insightIds.*').isMongoId(),
    body('category').isIn([
      'market_analysis',
      'trading_tips',
      'technical_analysis',
      'fundamental_analysis',
      'risk_management',
      'strategy',
      'news',
      'education',
      'other',
    ]).withMessage('Invalid category'),
    validate,
  ],
  adminBulkController.bulkUpdateInsightCategory
);

/**
 * @route   POST /api/admin/bulk/insights/feature
 * @desc    Feature multiple insights at once
 * @access  Admin
 */
router.post('/insights/feature',
  [
    body('insightIds').isArray({ min: 1, max: 50 }),
    body('insightIds.*').isMongoId(),
    body('featured').isBoolean(),
    validate,
  ],
  adminBulkController.bulkFeatureInsights
);

/**
 * Subscription Bulk Operations
 */

/**
 * @route   POST /api/admin/bulk/subscriptions/grant
 * @desc    Grant subscriptions to multiple users
 * @access  Admin
 */
router.post('/subscriptions/grant',
  strictLimiter,
  bulkSubscriptionValidation,
  adminBulkController.bulkGrantSubscriptions
);

/**
 * @route   POST /api/admin/bulk/subscriptions/extend
 * @desc    Extend subscriptions for multiple users
 * @access  Admin
 */
router.post('/subscriptions/extend',
  [
    body('subscriptionIds').isArray({ min: 1, max: 500 }),
    body('subscriptionIds.*').isMongoId(),
    body('durationDays').isInt({ min: 1, max: 365 }),
    body('reason').trim().notEmpty(),
    validate,
  ],
  adminBulkController.bulkExtendSubscriptions
);

/**
 * @route   POST /api/admin/bulk/subscriptions/revoke
 * @desc    Revoke subscriptions for multiple users
 * @access  Admin
 */
router.post('/subscriptions/revoke',
  strictLimiter,
  [
    body('subscriptionIds').isArray({ min: 1, max: 500 }),
    body('subscriptionIds.*').isMongoId(),
    body('reason').trim().notEmpty(),
    validate,
  ],
  adminBulkController.bulkRevokeSubscriptions
);

/**
 * @route   POST /api/admin/bulk/subscriptions/apply-discount
 * @desc    Apply discount code to multiple subscriptions
 * @access  Admin
 */
router.post('/subscriptions/apply-discount',
  [
    body('subscriptionIds').isArray({ min: 1, max: 500 }),
    body('subscriptionIds.*').isMongoId(),
    body('discountCode').trim().notEmpty(),
    validate,
  ],
  adminBulkController.bulkApplyDiscount
);

module.exports = router;
