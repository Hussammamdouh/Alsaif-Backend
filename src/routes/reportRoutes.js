const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { body, query } = require('express-validator');
const { validate } = require('../middleware/validation');

// All report routes require authentication
router.use(authenticateToken);

/**
 * @route   POST /api/reports
 * @desc    Report an insight or comment
 * @access  Private
 */
router.post(
    '/',
    [
        body('targetType').isIn(['insight', 'comment']).withMessage('Target type must be insight or comment'),
        body('targetId').isMongoId().withMessage('Invalid target ID'),
        body('reason').notEmpty().withMessage('Reason is required'),
        body('description').optional().isLength({ max: 1000 }).withMessage('Description too long'),
        validate,
    ],
    reportController.createReport
);

/**
 * @route   GET /api/reports/me
 * @desc    Get user's reports
 * @access  Private
 */
router.get(
    '/me',
    [
        query('page').optional().isInt({ min: 1 }),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        validate,
    ],
    reportController.getMyReports
);

module.exports = router;
