const express = require('express');
const router = express.Router();
const insightRequestController = require('../controllers/insightRequestController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { ROLES } = require('../constants');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validation');

/**
 * Insight Request Routes
 */

// ==================== AUTHENTICATED USER ROUTES ====================

// Submit a new insight request (Premium only - checked in service)
router.post(
    '/',
    authenticateToken,
    [
        body('title')
            .trim()
            .notEmpty()
            .withMessage('Title is required')
            .isLength({ min: 5, max: 200 })
            .withMessage('Title must be between 5 and 200 characters'),
        body('details')
            .trim()
            .notEmpty()
            .withMessage('Details are required')
            .isLength({ min: 20, max: 2000 })
            .withMessage('Details must be between 20 and 2000 characters'),
        validate
    ],
    insightRequestController.submitRequest
);

// Get user's own requests
router.get(
    '/my',
    authenticateToken,
    insightRequestController.getMyRequests
);

// ==================== ADMIN ROUTES ====================

// Moderation and list routes
router.use(authenticateToken);
router.use(authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN));

// Get all insight requests
router.get(
    '/',
    insightRequestController.getRequests
);

// Moderate an insight request
router.post(
    '/:requestId/moderate',
    [
        param('requestId').isMongoId().withMessage('Invalid request ID'),
        body('status')
            .isIn(['approved', 'rejected'])
            .withMessage('Status must be approved or rejected'),
        body('rejectionReason')
            .if(body('status').equals('rejected'))
            .trim()
            .notEmpty()
            .withMessage('Rejection reason is required when status is rejected'),
        body('targetType')
            .if(body('status').equals('approved'))
            .isIn(['free_insight', 'premium_insight', 'free_chat', 'premium_chat'])
            .withMessage('Invalid target type'),
        validate
    ],
    insightRequestController.moderateRequest
);

// Ban/Unban user from insights
router.post(
    '/ban/:userId',
    [
        param('userId').isMongoId().withMessage('Invalid user ID'),
        body('isBanned').isBoolean().withMessage('isBanned must be a boolean'),
        validate
    ],
    insightRequestController.toggleInsightBan
);

module.exports = router;
