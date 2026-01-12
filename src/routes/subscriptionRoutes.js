const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { ROLES } = require('../constants');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validation');

/**
 * Subscription Routes
 *
 * Public routes:
 * - GET /benefits - View subscription tiers and benefits
 *
 * User routes (authenticated):
 * - GET /me - Get own subscription status
 * - POST /cancel - Cancel own subscription
 *
 * Admin routes:
 * - GET / - List all subscriptions
 * - GET /stats - Subscription statistics
 * - POST /grant - Grant premium to user
 * - POST /revoke - Revoke premium from user
 * - PATCH /:subscriptionId/extend - Extend subscription
 * - GET /users/:userId - Get user's subscription
 */

// ============================================================================
// PUBLIC ROUTES
// ============================================================================

/**
 * Get subscription benefits and pricing
 * Public endpoint for marketing/sales page
 */
router.get('/benefits', subscriptionController.getSubscriptionBenefits);

/**
 * Get available subscription plans
 * Public endpoint for users to view subscription options
 */
router.get('/plans', subscriptionController.getAvailablePlans);

/**
 * Payment gateway webhook
 * Handles payment success/failure callbacks
 * NOTE: This endpoint uses raw body parsing for signature verification
 */
router.post('/webhook', subscriptionController.handlePaymentWebhook);

// ============================================================================
// AUTHENTICATED USER ROUTES
// ============================================================================

// Apply authentication to all routes below
router.use(authenticateToken);

/**
 * Get current user's subscription status
 */
router.get('/me', subscriptionController.getMySubscription);

/**
 * Cancel own subscription
 */
router.post(
  '/cancel',
  [
    body('reason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason cannot exceed 500 characters'),
    validate
  ],
  subscriptionController.cancelMySubscription
);

/**
 * Get subscription history for current user
 */
router.get('/history', subscriptionController.getMySubscriptionHistory);

/**
 * Initiate checkout/payment for subscription
 */
router.post(
  '/checkout',
  [
    body('planId')
      .notEmpty()
      .withMessage('Plan ID is required')
      .isEmail()
      .withMessage('Invalid plan ID format'),
    body('billingCycle')
      .notEmpty()
      .withMessage('Billing cycle is required')
      .isIn(['monthly', 'quarterly', 'yearly'])
      .withMessage('Invalid billing cycle'),
    body('successUrl')
      .optional()
      .isURL()
      .withMessage('Invalid success URL'),
    body('cancelUrl')
      .optional()
      .isURL()
      .withMessage('Invalid cancel URL'),
    validate
  ],
  subscriptionController.createCheckoutSession
);

/**
 * Renew expiring or expired subscription
 */
router.post(
  '/renew',
  [
    body('planId')
      .notEmpty()
      .withMessage('Plan ID is required')
      .isEmail()
      .withMessage('Invalid plan ID format'),
    body('billingCycle')
      .notEmpty()
      .withMessage('Billing cycle is required')
      .isIn(['monthly', 'quarterly', 'yearly'])
      .withMessage('Invalid billing cycle'),
    validate
  ],
  subscriptionController.renewSubscription
);

// ============================================================================
// ADMIN ROUTES
// ============================================================================

// Apply admin authorization to all routes below
router.use(authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN));

/**
 * Get all subscriptions with filtering and pagination
 */
router.get('/', subscriptionController.getAllSubscriptions);

/**
 * Get subscription statistics
 */
router.get('/stats', subscriptionController.getStats);

/**
 * Grant premium subscription to user
 */
router.post(
  '/grant',
  [
    body('email')
      .notEmpty()
      .withMessage('User email is required')
      .isEmail()
      .withMessage('Invalid email format'),
    body('tier')
      .notEmpty()
      .withMessage('Subscription tier is required')
      .isIn(['premium'])
      .withMessage('Invalid subscription tier'),
    body('durationDays')
      .notEmpty()
      .withMessage('Duration in days is required')
      .isInt({ min: 1 })
      .withMessage('Duration must be at least 1 day'),
    body('reason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason cannot exceed 500 characters'),
    body('source')
      .optional()
      .isIn(['manual', 'trial', 'promotion', 'system'])
      .withMessage('Invalid subscription source'),
    validate
  ],
  subscriptionController.grantPremium
);

/**
 * Revoke premium subscription (downgrade to free)
 */
router.post(
  '/revoke',
  [
    body('userId')
      .notEmpty()
      .withMessage('User ID is required')
      .isMongoId()
      .withMessage('Invalid user ID format'),
    body('reason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason cannot exceed 500 characters'),
    validate
  ],
  subscriptionController.revokePremium
);

/**
 * Extend subscription end date
 */
router.patch(
  '/:subscriptionId/extend',
  [
    param('subscriptionId')
      .isEmail()
      .withMessage('Invalid subscription ID format'),
    body('endDate')
      .notEmpty()
      .withMessage('End date is required')
      .isISO8601()
      .withMessage('Invalid date format (use ISO 8601)')
      .custom((value) => {
        const date = new Date(value);
        if (date <= new Date()) {
          throw new Error('End date must be in the future');
        }
        return true;
      }),
    body('reason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason cannot exceed 500 characters'),
    validate
  ],
  subscriptionController.extendSubscription
);

/**
 * Get user's subscription details
 */
router.get(
  '/users/:userId',
  [
    param('userId')
      .isEmail()
      .withMessage('Invalid email format'),
    validate
  ],
  subscriptionController.getUserSubscription
);

module.exports = router;
