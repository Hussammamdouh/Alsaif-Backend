const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { ROLES } = require('../constants');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { engagementLimiter } = require('../middleware/advancedRateLimit');

/**
 * Comment Routes
 *
 * Public routes: GET comments
 * Authenticated routes: Create, update, delete, like
 * Admin routes: Moderate, get flagged
 */

// ==================== VALIDATION RULES ====================

const createCommentValidation = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Content is required')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Content must be between 1 and 2000 characters'),
  validate
];

const updateCommentValidation = [
  param('commentId').isMongoId().withMessage('Invalid comment ID'),
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Content is required')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Content must be between 1 and 2000 characters'),
  validate
];

const flagCommentValidation = [
  param('commentId').isMongoId().withMessage('Invalid comment ID'),
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Reason is required')
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters'),
  validate
];

const moderateCommentValidation = [
  param('commentId').isMongoId().withMessage('Invalid comment ID'),
  body('action')
    .isIn(['approve', 'delete', 'unflag'])
    .withMessage('Invalid moderation action'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters'),
  validate
];

const commentIdValidation = [
  param('commentId').isMongoId().withMessage('Invalid comment ID'),
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

// Get comments for an insight (anyone can view)
router.get(
  '/insights/:insightId/comments',
  insightIdValidation,
  paginationValidation,
  commentController.getCommentsForInsight
);

// Get replies for a comment (anyone can view)
router.get(
  '/:commentId/replies',
  commentIdValidation,
  paginationValidation,
  commentController.getRepliesForComment
);

// ==================== AUTHENTICATED USER ROUTES ====================

// All routes below require authentication
router.use(authenticateToken);

// Create a comment on an insight
router.post(
  '/insights/:insightId/comments',
  insightIdValidation,
  engagementLimiter, // Rate limit comment creation
  createCommentValidation,
  commentController.createComment
);

// Reply to a comment
router.post(
  '/:commentId/reply',
  commentIdValidation,
  engagementLimiter,
  createCommentValidation,
  commentController.replyToComment
);

// Update a comment
router.patch(
  '/:commentId',
  updateCommentValidation,
  commentController.updateComment
);

// Delete a comment
router.delete(
  '/:commentId',
  commentIdValidation,
  commentController.deleteComment
);

// Like/unlike a comment
router.post(
  '/:commentId/like',
  commentIdValidation,
  commentController.likeComment
);

// Flag a comment for moderation
router.post(
  '/:commentId/flag',
  flagCommentValidation,
  commentController.flagComment
);

// ==================== ADMIN ROUTES ====================

// Get flagged comments (admin only)
router.get(
  '/admin/flagged',
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN),
  paginationValidation,
  commentController.getFlaggedComments
);

// Moderate a comment (admin only)
router.post(
  '/admin/:commentId/moderate',
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN),
  moderateCommentValidation,
  commentController.moderateComment
);

module.exports = router;
