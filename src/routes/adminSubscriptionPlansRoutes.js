/**
 * Admin Subscription Plans Management Routes
 * CRUD operations for subscription plan tiers
 */

const express = require('express');
const router = express.Router();
const adminSubscriptionPlansController = require('../controllers/adminSubscriptionPlansController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');

// All routes require admin or superadmin role
router.use(authenticateToken);
router.use(authorizeRoles(['admin', 'superadmin']));

/**
 * @route   GET /api/admin/subscription-plans
 * @desc    Get all subscription plans
 * @access  Admin
 */
router.get('/', adminSubscriptionPlansController.getAllPlans);

/**
 * @route   GET /api/admin/subscription-plans/:planId
 * @desc    Get a specific subscription plan
 * @access  Admin
 */
router.get('/:planId', adminSubscriptionPlansController.getPlan);

/**
 * @route   POST /api/admin/subscription-plans
 * @desc    Create a new subscription plan
 * @access  Admin
 */
router.post('/',
  [
    body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Plan name required'),
    body('tier').isIn(['basic', 'starter', 'premium', 'pro', 'enterprise']).withMessage('Valid tier required'),
    body('price').isFloat({ min: 0 }).withMessage('Valid price required'),
    body('currency').optional().isString().isLength({ min: 3, max: 3 }),
    body('billingCycle').isIn(['monthly', 'quarterly', 'yearly']).withMessage('Valid billing cycle required'),
    body('features').isArray().withMessage('Features array required'),
    body('features.*.name').trim().notEmpty(),
    body('features.*.included').isBoolean(),
    body('features.*.value').optional(),
    body('isActive').optional().isBoolean(),
    body('isFeatured').optional().isBoolean(),
    validate,
  ],
  adminSubscriptionPlansController.createPlan
);

/**
 * @route   PATCH /api/admin/subscription-plans/:planId
 * @desc    Update a subscription plan
 * @access  Admin
 */
router.patch('/:planId',
  [
    body('name').optional().trim().isLength({ max: 100 }),
    body('price').optional().isFloat({ min: 0 }),
    body('features').optional().isArray(),
    body('isActive').optional().isBoolean(),
    body('isFeatured').optional().isBoolean(),
    validate,
  ],
  adminSubscriptionPlansController.updatePlan
);

/**
 * @route   DELETE /api/admin/subscription-plans/:planId
 * @desc    Delete a subscription plan
 * @access  Superadmin only
 */
router.delete('/:planId',
  authenticateToken,
  authorizeRoles(['superadmin']),
  adminSubscriptionPlansController.deletePlan
);

/**
 * @route   POST /api/admin/subscription-plans/:planId/activate
 * @desc    Activate a plan
 * @access  Admin
 */
router.post('/:planId/activate', adminSubscriptionPlansController.activatePlan);

/**
 * @route   POST /api/admin/subscription-plans/:planId/deactivate
 * @desc    Deactivate a plan
 * @access  Admin
 */
router.post('/:planId/deactivate', adminSubscriptionPlansController.deactivatePlan);

/**
 * @route   GET /api/admin/subscription-plans/:planId/subscribers
 * @desc    Get all subscribers for a plan
 * @access  Admin
 */
router.get('/:planId/subscribers', adminSubscriptionPlansController.getPlanSubscribers);

module.exports = router;
