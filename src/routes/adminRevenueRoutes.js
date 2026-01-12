/**
 * Admin Revenue Dashboard Routes
 * Endpoints for revenue analytics, payment tracking, and financial metrics
 */

const express = require('express');
const router = express.Router();
const adminRevenueController = require('../controllers/adminRevenueController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { query, body } = require('express-validator');
const { validate } = require('../middleware/validation');

// All routes require admin or superadmin role
router.use(authenticateToken);
router.use(authorizeRoles(['admin', 'superadmin']));

// Date range validation
const dateRangeValidation = [
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('period').optional().isIn(['day', 'week', 'month', 'year']).withMessage('Invalid period'),
  validate,
];

/**
 * @route   GET /api/admin/revenue/overview
 * @desc    Get revenue overview (MRR, ARR, churn, ARPU, LTV)
 * @access  Admin
 */
router.get('/overview', dateRangeValidation, adminRevenueController.getRevenueOverview);

/**
 * @route   GET /api/admin/revenue/trends
 * @desc    Get revenue trends over time
 * @access  Admin
 */
router.get('/trends', dateRangeValidation, adminRevenueController.getRevenueTrends);

/**
 * @route   GET /api/admin/revenue/payment-breakdown
 * @desc    Get payment breakdown by payment method
 * @access  Admin
 */
router.get('/payment-breakdown', dateRangeValidation, adminRevenueController.getPaymentBreakdown);

/**
 * @route   GET /api/admin/revenue/failed-payments
 * @desc    Get list of failed payments
 * @access  Admin
 */
router.get('/failed-payments',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate,
  ],
  adminRevenueController.getFailedPayments
);

/**
 * @route   GET /api/admin/revenue/refunds
 * @desc    Get refund statistics
 * @access  Admin
 */
router.get('/refunds', dateRangeValidation, adminRevenueController.getRefundStats);

/**
 * @route   GET /api/admin/revenue/by-tier
 * @desc    Get revenue breakdown by subscription tier
 * @access  Admin
 */
router.get('/by-tier', dateRangeValidation, adminRevenueController.getRevenueByTier);

/**
 * @route   GET /api/admin/revenue/top-customers
 * @desc    Get top paying customers
 * @access  Admin
 */
router.get('/top-customers',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate,
  ],
  adminRevenueController.getTopCustomers
);

/**
 * @route   GET /api/admin/revenue/timeline
 * @desc    Get payment timeline with status breakdown
 * @access  Admin
 */
router.get('/timeline', dateRangeValidation, adminRevenueController.getPaymentTimeline);

/**
 * @route   GET /api/admin/revenue/forecast
 * @desc    Get revenue forecast projection
 * @access  Admin
 */
router.get('/forecast',
  [
    query('months').optional().isInt({ min: 1, max: 12 }),
    validate,
  ],
  adminRevenueController.getRevenueForecast
);

/**
 * @route   POST /api/admin/revenue/export
 * @desc    Export revenue data to CSV
 * @access  Admin
 */
router.post('/export',
  [
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    body('type').isIn(['payments', 'subscriptions']).withMessage('Type must be payments or subscriptions'),
    validate,
  ],
  adminRevenueController.exportRevenueData
);

module.exports = router;
