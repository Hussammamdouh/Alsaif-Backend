/**
 * Admin Content Moderation Routes
 * Endpoints for moderating user-generated content
 */

const express = require('express');
const router = express.Router();
const adminModerationController = require('../controllers/adminModerationController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { body, query } = require('express-validator');
const { validate } = require('../middleware/validation');

// All routes require admin or superadmin role
router.use(authenticateToken);
router.use(authorizeRoles(['admin', 'superadmin']));

/**
 * @route   GET /api/admin/moderation/queue
 * @desc    Get moderation queue (pending items)
 * @access  Admin
 */
router.get('/queue',
  [
    query('type').optional().isIn(['insight', 'comment', 'user_report']),
    query('status').optional().isIn(['pending', 'approved', 'rejected']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate,
  ],
  adminModerationController.getQueue
);

/**
 * @route   POST /api/admin/moderation/insights/:insightId/approve
 * @desc    Approve an insight
 * @access  Admin
 */
router.post('/insights/:insightId/approve',
  [
    body('note').optional().trim().isLength({ max: 500 }),
    body('publish').optional().isBoolean(),
    validate,
  ],
  adminModerationController.approveInsight
);

/**
 * @route   POST /api/admin/moderation/insights/:insightId/reject
 * @desc    Reject an insight
 * @access  Admin
 */
router.post('/insights/:insightId/reject',
  [
    body('reason').trim().notEmpty().isLength({ max: 500 }).withMessage('Rejection reason required'),
    body('note').optional().trim().isLength({ max: 500 }),
    validate,
  ],
  adminModerationController.rejectInsight
);

/**
 * @route   POST /api/admin/moderation/insights/:insightId/request-changes
 * @desc    Request changes to an insight
 * @access  Admin
 */
router.post('/insights/:insightId/request-changes',
  [
    body('changes').trim().notEmpty().isLength({ max: 1000 }).withMessage('Change requests required'),
    validate,
  ],
  adminModerationController.requestChanges
);

/**
 * @route   POST /api/admin/moderation/insights/:insightId/flag
 * @desc    Flag an insight for review
 * @access  Admin
 */
router.post('/insights/:insightId/flag',
  [
    body('reason').trim().notEmpty(),
    body('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
    validate,
  ],
  adminModerationController.flagInsight
);

/**
 * @route   GET /api/admin/moderation/flagged
 * @desc    Get all flagged content
 * @access  Admin
 */
router.get('/flagged',
  [
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
    query('resolved').optional().isBoolean(),
    validate,
  ],
  adminModerationController.getFlaggedContent
);

/**
 * @route   POST /api/admin/moderation/flagged/:flagId/resolve
 * @desc    Resolve a flagged item
 * @access  Admin
 */
router.post('/flagged/:flagId/resolve',
  [
    body('action').isIn(['remove', 'keep', 'edit']).withMessage('Valid action required'),
    body('note').optional().trim().isLength({ max: 500 }),
    validate,
  ],
  adminModerationController.resolveFlag
);

/**
 * @route   GET /api/admin/moderation/stats
 * @desc    Get moderation statistics
 * @access  Admin
 */
router.get('/stats', adminModerationController.getModerationStats);

/**
 * @route   GET /api/admin/moderation/history
 * @desc    Get moderation history
 * @access  Admin
 */
router.get('/history',
  [
    query('moderatorId').optional().isMongoId(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    validate,
  ],
  adminModerationController.getModerationHistory
);

module.exports = router;
