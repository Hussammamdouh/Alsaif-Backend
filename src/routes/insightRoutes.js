const express = require('express');
const router = express.Router();
const insightController = require('../controllers/insightController');
const { authenticateToken, authorizeRoles, optionalAuth } = require('../middleware/authMiddleware');
const { addSubscriptionContext } = require('../middleware/subscriptionMiddleware');
const { ROLES } = require('../constants');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { contentCreationLimiter } = require('../middleware/advancedRateLimit');

/**
 * Insight Routes
 *
 * Public routes: GET published insights
 * Authenticated routes: Like insights
 * Admin routes: Full CRUD, feature, moderate
 */

// ==================== VALIDATION RULES ====================

const createInsightValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Content is required')
    .isLength({ min: 20 })
    .withMessage('Content must be at least 20 characters'),
  body('excerpt')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Excerpt cannot exceed 500 characters'),
  body('type')
    .optional()
    .isIn(['free', 'premium'])
    .withMessage('Type must be either "free" or "premium"'),
  body('category')
    .optional()
    .isIn([
      'market_analysis',
      'trading_tips',
      'technical_analysis',
      'fundamental_analysis',
      'risk_management',
      'strategy',
      'news',
      'education',
      'other'
    ])
    .withMessage('Invalid category'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('status')
    .optional()
    .isIn(['draft', 'published', 'archived', 'under_review'])
    .withMessage('Invalid status'),
  validate
];

const updateInsightValidation = [
  param('insightId').isMongoId().withMessage('Invalid insight ID'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('content')
    .optional()
    .trim()
    .isLength({ min: 20 })
    .withMessage('Content must be at least 20 characters'),
  body('excerpt')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Excerpt cannot exceed 500 characters'),
  body('type')
    .optional()
    .isIn(['free', 'premium'])
    .withMessage('Type must be either "free" or "premium"'),
  body('category')
    .optional()
    .isIn([
      'market_analysis',
      'trading_tips',
      'technical_analysis',
      'fundamental_analysis',
      'risk_management',
      'strategy',
      'news',
      'education',
      'other'
    ])
    .withMessage('Invalid category'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('status')
    .optional()
    .isIn(['draft', 'published', 'archived', 'under_review'])
    .withMessage('Invalid status'),
  validate
];

const deleteInsightValidation = [
  param('insightId').isMongoId().withMessage('Invalid insight ID'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters'),
  validate
];

const featureInsightValidation = [
  param('insightId').isMongoId().withMessage('Invalid insight ID'),
  body('featured')
    .isBoolean()
    .withMessage('Featured must be a boolean value'),
  validate
];

const moderateInsightValidation = [
  param('insightId').isMongoId().withMessage('Invalid insight ID'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
  body('status')
    .optional()
    .isIn(['draft', 'published', 'archived', 'under_review'])
    .withMessage('Invalid status'),
  validate
];

const insightIdValidation = [
  param('insightId').isMongoId().withMessage('Invalid insight ID'),
  validate
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  validate
];

// ==================== PUBLIC ROUTES ====================

// Get published insights (public) - subscription-aware
// Uses optionalAuth to detect logged-in users, then adds subscription context
router.get(
  '/published',
  optionalAuth,
  addSubscriptionContext,
  paginationValidation,
  insightController.getPublishedInsights
);

// Get featured insights (public) - subscription-aware
router.get(
  '/featured',
  optionalAuth,
  addSubscriptionContext,
  insightController.getFeaturedInsights
);

// Get single published insight (public) - subscription-aware access control
router.get(
  '/published/:insightId',
  optionalAuth,
  addSubscriptionContext,
  insightIdValidation,
  insightController.getPublishedInsightById
);

// ==================== AUTHENTICATED USER ROUTES ====================

// Like insight (authenticated users)
router.post(
  '/:insightId/like',
  authenticateToken,
  insightIdValidation,
  insightController.likeInsight
);

// ==================== ADMIN ROUTES ====================

// All routes below require authentication and admin/superadmin role
router.use(authenticateToken);
router.use(authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN));

// Get all insights (admin - includes all statuses)
router.get(
  '/',
  paginationValidation,
  insightController.getAllInsights
);

// Get insight statistics
router.get(
  '/stats',
  insightController.getInsightStats
);

// Get single insight by ID (admin - includes unpublished)
router.get(
  '/:insightId',
  insightIdValidation,
  insightController.getInsightById
);

// Create new insight (with content creation rate limiting)
router.post(
  '/',
  contentCreationLimiter,
  createInsightValidation,
  insightController.createInsight
);

// Update insight
router.patch(
  '/:insightId',
  updateInsightValidation,
  insightController.updateInsight
);

// Delete insight (soft delete)
router.delete(
  '/:insightId',
  deleteInsightValidation,
  insightController.deleteInsight
);

// Restore deleted insight
router.post(
  '/:insightId/restore',
  insightIdValidation,
  insightController.restoreInsight
);

// Feature/unfeature insight
router.patch(
  '/:insightId/feature',
  featureInsightValidation,
  insightController.toggleFeatureInsight
);

// Moderate insight
router.post(
  '/:insightId/moderate',
  moderateInsightValidation,
  insightController.moderateInsight
);

// Schedule insight
router.post(
  '/:insightId/schedule',
  [
    param('insightId').isMongoId().withMessage('Invalid insight ID'),
    body('publishAt').isISO8601().withMessage('Valid publish date required'),
    validate
  ],
  insightController.scheduleInsight
);

// Get scheduled insights
router.get(
  '/scheduled/all',
  paginationValidation,
  insightController.getScheduledInsights
);

// Cancel scheduled insight
router.post(
  '/:insightId/cancel-schedule',
  insightIdValidation,
  insightController.cancelSchedule
);

module.exports = router;
