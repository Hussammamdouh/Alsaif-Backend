/**
 * Admin Discount Code Routes
 * Endpoints for managing promotional codes and discounts
 */

const express = require('express');
const router = express.Router();
const adminDiscountCodeController = require('../controllers/adminDiscountCodeController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { body, query } = require('express-validator');
const { validate } = require('../middleware/validation');

// All routes require admin or superadmin role
router.use(authenticateToken);
router.use(authorizeRoles(['admin', 'superadmin']));

/**
 * @route   GET /api/admin/discount-codes
 * @desc    Get all discount codes
 * @access  Admin
 */
router.get(
  '/',
  [
    query('isActive').optional().isBoolean(),
    query('type').optional().isIn(['percentage', 'fixed_amount', 'free_trial']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate,
  ],
  adminDiscountCodeController.getAllCodes
);

/**
 * @route   GET /api/admin/discount-codes/analytics
 * @desc    Get discount code analytics
 * @access  Admin
 */
router.get(
  '/analytics',
  [query('startDate').optional().isISO8601(), query('endDate').optional().isISO8601(), validate],
  adminDiscountCodeController.getCodeAnalytics
);

/**
 * @route   GET /api/admin/discount-codes/:codeId
 * @desc    Get a specific discount code
 * @access  Admin
 */
router.get('/:codeId', adminDiscountCodeController.getCode);

/**
 * @route   POST /api/admin/discount-codes
 * @desc    Create a new discount code
 * @access  Admin
 */
router.post(
  '/',
  [
    body('code').trim().notEmpty().isLength({ min: 3, max: 50 }).withMessage('Code must be 3-50 characters'),
    body('description').optional().trim().isLength({ max: 500 }),
    body('type')
      .isIn(['percentage', 'fixed_amount', 'free_trial'])
      .withMessage('Type must be percentage, fixed_amount, or free_trial'),
    body('value').isFloat({ min: 0 }).withMessage('Value must be a positive number'),
    body('currency').optional().isString().isLength({ min: 3, max: 3 }),
    body('applicableTiers').optional().isArray(),
    body('applicableTiers.*')
      .optional()
      .isIn(['basic', 'starter', 'premium', 'pro', 'enterprise'])
      .withMessage('Invalid tier'),
    body('applicableBillingCycles').optional().isArray(),
    body('applicableBillingCycles.*')
      .optional()
      .isIn(['monthly', 'quarterly', 'yearly'])
      .withMessage('Invalid billing cycle'),
    body('validFrom').isISO8601().withMessage('Valid from date required'),
    body('validUntil').isISO8601().withMessage('Valid until date required'),
    body('maxUses').optional().isInt({ min: 1 }),
    body('maxUsesPerUser').optional().isInt({ min: 1 }),
    body('minimumPurchaseAmount').optional().isFloat({ min: 0 }),
    body('firstTimeUsersOnly').optional().isBoolean(),
    body('stackable').optional().isBoolean(),
    validate,
  ],
  adminDiscountCodeController.createCode
);

/**
 * @route   PATCH /api/admin/discount-codes/:codeId
 * @desc    Update a discount code
 * @access  Admin
 */
router.patch(
  '/:codeId',
  [
    body('description').optional().trim().isLength({ max: 500 }),
    body('value').optional().isFloat({ min: 0 }),
    body('applicableTiers').optional().isArray(),
    body('applicableBillingCycles').optional().isArray(),
    body('validFrom').optional().isISO8601(),
    body('validUntil').optional().isISO8601(),
    body('maxUses').optional().isInt({ min: 1 }),
    body('maxUsesPerUser').optional().isInt({ min: 1 }),
    body('minimumPurchaseAmount').optional().isFloat({ min: 0 }),
    body('firstTimeUsersOnly').optional().isBoolean(),
    body('stackable').optional().isBoolean(),
    body('isActive').optional().isBoolean(),
    validate,
  ],
  adminDiscountCodeController.updateCode
);

/**
 * @route   DELETE /api/admin/discount-codes/:codeId
 * @desc    Delete a discount code
 * @access  Admin
 */
router.delete('/:codeId', adminDiscountCodeController.deleteCode);

/**
 * @route   POST /api/admin/discount-codes/:codeId/activate
 * @desc    Activate a discount code
 * @access  Admin
 */
router.post('/:codeId/activate', adminDiscountCodeController.activateCode);

/**
 * @route   POST /api/admin/discount-codes/:codeId/deactivate
 * @desc    Deactivate a discount code
 * @access  Admin
 */
router.post('/:codeId/deactivate', adminDiscountCodeController.deactivateCode);

/**
 * @route   GET /api/admin/discount-codes/:codeId/stats
 * @desc    Get usage statistics for a discount code
 * @access  Admin
 */
router.get('/:codeId/stats', adminDiscountCodeController.getCodeUsageStats);

/**
 * @route   GET /api/admin/discount-codes/validate/:code
 * @desc    Validate a discount code
 * @access  Admin
 */
router.get(
  '/validate/:code',
  [
    query('userId').optional().isMongoId(),
    query('tier').optional().isIn(['basic', 'starter', 'premium', 'pro', 'enterprise']),
    query('billingCycle').optional().isIn(['monthly', 'quarterly', 'yearly']),
    query('purchaseAmount').optional().isFloat({ min: 0 }),
    validate,
  ],
  adminDiscountCodeController.validateCode
);

module.exports = router;
