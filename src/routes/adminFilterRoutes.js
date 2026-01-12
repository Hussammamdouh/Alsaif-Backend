/**
 * Admin Advanced Filtering Routes
 * Endpoints for advanced filtering and saved filter presets
 */

const express = require('express');
const router = express.Router();
const adminFilterController = require('../controllers/adminFilterController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { body, query } = require('express-validator');
const { validate } = require('../middleware/validation');

// All routes require admin or superadmin role
router.use(authenticateToken);
router.use(authorizeRoles(['admin', 'superadmin']));

/**
 * @route   POST /api/admin/filters/users
 * @desc    Get filtered users with advanced criteria
 * @access  Admin
 */
router.post('/users',
  [
    body('filters').optional().isObject(),
    body('filters.role').optional().isIn(['user', 'admin', 'superadmin']),
    body('filters.isActive').optional().isBoolean(),
    body('filters.subscriptionStatus').optional().isIn(['active', 'expired', 'cancelled', 'pending', 'none']),
    body('filters.subscriptionTier').optional().isIn(['basic', 'starter', 'premium', 'pro', 'enterprise']),
    body('filters.createdAfter').optional().isISO8601(),
    body('filters.createdBefore').optional().isISO8601(),
    body('filters.lastActiveAfter').optional().isISO8601(),
    body('filters.lastActiveBefore').optional().isISO8601(),
    body('filters.search').optional().isString(),
    body('sort').optional().isObject(),
    body('page').optional().isInt({ min: 1 }),
    body('limit').optional().isInt({ min: 1, max: 100 }),
    validate,
  ],
  adminFilterController.filterUsers
);

/**
 * @route   POST /api/admin/filters/insights
 * @desc    Get filtered insights with advanced criteria
 * @access  Admin
 */
router.post('/insights',
  [
    body('filters').optional().isObject(),
    body('filters.type').optional().isIn(['free', 'premium']),
    body('filters.status').optional().isIn(['draft', 'published', 'archived', 'under_review', 'scheduled']),
    body('filters.category').optional().isIn([
      'market_analysis', 'trading_tips', 'technical_analysis',
      'fundamental_analysis', 'risk_management', 'strategy', 'news', 'education', 'other'
    ]),
    body('filters.featured').optional().isBoolean(),
    body('filters.minViews').optional().isInt({ min: 0 }),
    body('filters.minLikes').optional().isInt({ min: 0 }),
    body('filters.createdAfter').optional().isISO8601(),
    body('filters.createdBefore').optional().isISO8601(),
    body('filters.publishedAfter').optional().isISO8601(),
    body('filters.publishedBefore').optional().isISO8601(),
    body('filters.tags').optional().isArray(),
    body('filters.search').optional().isString(),
    validate,
  ],
  adminFilterController.filterInsights
);

/**
 * @route   POST /api/admin/filters/subscriptions
 * @desc    Get filtered subscriptions with advanced criteria
 * @access  Admin
 */
router.post('/subscriptions',
  [
    body('filters').optional().isObject(),
    body('filters.status').optional().isIn(['active', 'expired', 'cancelled', 'pending']),
    body('filters.tier').optional().isIn(['basic', 'starter', 'premium', 'pro', 'enterprise']),
    body('filters.autoRenew').optional().isBoolean(),
    body('filters.minPrice').optional().isFloat({ min: 0 }),
    body('filters.maxPrice').optional().isFloat({ min: 0 }),
    body('filters.expiringInDays').optional().isInt({ min: 0 }),
    body('filters.createdAfter').optional().isISO8601(),
    body('filters.createdBefore').optional().isISO8601(),
    validate,
  ],
  adminFilterController.filterSubscriptions
);

/**
 * SAVED FILTER PRESETS
 */

/**
 * @route   POST /api/admin/filters/presets
 * @desc    Create a saved filter preset
 * @access  Admin
 */
router.post('/presets',
  [
    body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Preset name required (max 100 chars)'),
    body('resourceType').isIn(['users', 'insights', 'subscriptions']).withMessage('Invalid resource type'),
    body('filters').isObject().withMessage('Filters object required'),
    body('description').optional().trim().isLength({ max: 500 }),
    body('isPublic').optional().isBoolean(),
    validate,
  ],
  adminFilterController.createPreset
);

/**
 * @route   GET /api/admin/filters/presets
 * @desc    Get all filter presets for the current admin
 * @access  Admin
 */
router.get('/presets',
  [
    query('resourceType').optional().isIn(['users', 'insights', 'subscriptions']),
    validate,
  ],
  adminFilterController.getPresets
);

/**
 * @route   GET /api/admin/filters/presets/:presetId
 * @desc    Get a specific preset
 * @access  Admin
 */
router.get('/presets/:presetId', adminFilterController.getPreset);

/**
 * @route   PATCH /api/admin/filters/presets/:presetId
 * @desc    Update a preset
 * @access  Admin
 */
router.patch('/presets/:presetId',
  [
    body('name').optional().trim().isLength({ max: 100 }),
    body('filters').optional().isObject(),
    body('description').optional().trim().isLength({ max: 500 }),
    body('isPublic').optional().isBoolean(),
    validate,
  ],
  adminFilterController.updatePreset
);

/**
 * @route   DELETE /api/admin/filters/presets/:presetId
 * @desc    Delete a preset
 * @access  Admin
 */
router.delete('/presets/:presetId', adminFilterController.deletePreset);

/**
 * @route   POST /api/admin/filters/presets/:presetId/apply
 * @desc    Apply a saved preset and get filtered results
 * @access  Admin
 */
router.post('/presets/:presetId/apply',
  [
    body('page').optional().isInt({ min: 1 }),
    body('limit').optional().isInt({ min: 1, max: 100 }),
    validate,
  ],
  adminFilterController.applyPreset
);

module.exports = router;
