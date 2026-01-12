const Subscription = require('../models/Subscription');
const Insight = require('../models/Insight');
const { SUBSCRIPTION_TIERS, CONTENT_ACCESS, ROLES, AUDIT_ACTIONS, HTTP_STATUS } = require('../constants');
const AuditLogger = require('../utils/auditLogger');

/**
 * Subscription Middleware
 *
 * Enforces premium content access control based on user subscription tier
 * All checks happen server-side - never trust client
 *
 * Design Principles:
 * - Defense in depth: Multiple layers of checks
 * - Fail securely: Default to denying access
 * - Audit everything: Log all access attempts
 * - Admin bypass: Admins can preview all content
 * - Clean errors: User-friendly messages
 */

/**
 * Check if user has premium access
 * Middleware to verify user's subscription tier
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Next middleware
 */
const requirePremiumAccess = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Admins and superadmins bypass subscription checks (can preview all content)
    if (user.role === ROLES.ADMIN || user.role === ROLES.SUPERADMIN) {
      req.hasPremiumAccess = true;
      return next();
    }

    // Get user's active subscription
    const subscription = await Subscription.getActiveSubscription(user.id);

    // Check if user has premium access
    const hasPremium = subscription && subscription.isPremium;

    if (!hasPremium) {
      // Log access denial for analytics
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.PREMIUM_ACCESS_DENIED,
        target: {
          resourceType: 'Content',
          resourceName: 'Premium Content'
        },
        metadata: {
          severity: 'low',
          notes: 'User attempted to access premium content without subscription'
        },
        status: 'failure'
      });

      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'Premium subscription required to access this content',
        code: 'PREMIUM_REQUIRED',
        upgrade: {
          message: 'Upgrade to premium to unlock exclusive insights',
          benefits: [
            'Access to all premium insights',
            'Advanced market analysis',
            'Expert trading strategies',
            'Priority support'
          ]
        }
      });
    }

    // Attach premium access flag to request
    req.hasPremiumAccess = true;
    req.subscription = subscription;

    next();
  } catch (error) {
    console.error('Premium access check error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({
      success: false,
      message: 'Error checking subscription status'
    });
  }
};

/**
 * Check insight access based on user subscription
 * Used when fetching a single insight
 *
 * @param {Request} req - Express request (expects req.insight to be set)
 * @param {Response} res - Express response
 * @param {Function} next - Next middleware
 */
const checkInsightAccess = async (req, res, next) => {
  try {
    const user = req.user;
    const insight = req.insight; // Should be set by previous middleware

    if (!insight) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Insight not found'
      });
    }

    // Free content is accessible to everyone (including unauthenticated users)
    if (insight.type === CONTENT_ACCESS.FREE) {
      return next();
    }

    // Premium content requires authentication
    if (!user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: 'Please log in to access premium content',
        code: 'AUTH_REQUIRED'
      });
    }

    // Admins bypass subscription checks
    if (user.role === ROLES.ADMIN || user.role === ROLES.SUPERADMIN) {
      req.hasPremiumAccess = true;
      return next();
    }

    // Check user's subscription for premium content
    const subscription = await Subscription.getActiveSubscription(user.id);
    const hasPremium = subscription && subscription.isPremium;

    if (!hasPremium) {
      // Log denied access attempt
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.PREMIUM_ACCESS_DENIED,
        target: {
          resourceType: 'Insight',
          resourceId: insight._id,
          resourceName: insight.title
        },
        metadata: {
          severity: 'low',
          notes: `User attempted to access premium insight: ${insight.title}`
        },
        status: 'failure'
      });

      // Return preview/excerpt instead of full content
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'Premium subscription required',
        code: 'PREMIUM_REQUIRED',
        preview: {
          id: insight._id,
          title: insight.title,
          excerpt: insight.excerpt,
          category: insight.category,
          tags: insight.tags,
          coverImage: insight.coverImage,
          readTime: insight.readTime,
          publishedAt: insight.publishedAt,
          type: insight.type
        },
        upgrade: {
          message: 'Upgrade to premium to read the full insight',
          benefits: [
            'Unlock full content',
            'Access all premium insights',
            'Advanced analysis and strategies'
          ]
        }
      });
    }

    // Log successful premium access
    await AuditLogger.logFromRequest(req, {
      action: AUDIT_ACTIONS.PREMIUM_CONTENT_ACCESSED,
      target: {
        resourceType: 'Insight',
        resourceId: insight._id,
        resourceName: insight.title
      },
      metadata: {
        severity: 'low',
        notes: 'Premium content accessed',
        subscriptionTier: subscription.tier
      },
      status: 'success'
    });

    req.hasPremiumAccess = true;
    req.subscription = subscription;
    next();
  } catch (error) {
    console.error('Insight access check error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({
      success: false,
      message: 'Error checking content access'
    });
  }
};

/**
 * Filter insights array based on user subscription
 * Removes premium content for free users
 *
 * @param {Array} insights - Array of insights
 * @param {Object} user - User object (or null for unauthenticated)
 * @returns {Promise<Array>} - Filtered insights
 */
const filterInsightsBySubscription = async (insights, user) => {
  // If no user (unauthenticated), show only free content
  if (!user) {
    return insights.filter(insight => insight.type === CONTENT_ACCESS.FREE);
  }

  // Admins see everything
  if (user.role === ROLES.ADMIN || user.role === ROLES.SUPERADMIN) {
    return insights;
  }

  // Check user's subscription
  const subscription = await Subscription.getActiveSubscription(user.id);
  const hasPremium = subscription && subscription.isPremium;

  // Premium users see everything
  if (hasPremium) {
    return insights;
  }

  // Free users see only free content
  return insights.filter(insight => insight.type === CONTENT_ACCESS.FREE);
};

/**
 * Add subscription context to request
 * Populates req.subscription and req.subscriptionTier for use in controllers
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Next middleware
 */
const addSubscriptionContext = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      // No user - default to free tier
      req.subscriptionTier = SUBSCRIPTION_TIERS.FREE;
      req.hasPremiumAccess = false;
      return next();
    }

    // Admins always have premium access
    if (user.role === ROLES.ADMIN || user.role === ROLES.SUPERADMIN) {
      req.subscriptionTier = SUBSCRIPTION_TIERS.PREMIUM;
      req.hasPremiumAccess = true;
      req.subscription = null; // Admins don't have subscriptions
      return next();
    }

    // Get user's subscription
    const subscription = await Subscription.getActiveSubscription(user.id);

    if (subscription) {
      req.subscriptionTier = subscription.tier;
      req.hasPremiumAccess = subscription.isPremium;
      req.subscription = subscription;
    } else {
      // No subscription found - default to free
      req.subscriptionTier = SUBSCRIPTION_TIERS.FREE;
      req.hasPremiumAccess = false;
      req.subscription = null;
    }

    next();
  } catch (error) {
    console.error('Subscription context error:', error);
    // Don't block request - default to free tier
    req.subscriptionTier = SUBSCRIPTION_TIERS.FREE;
    req.hasPremiumAccess = false;
    next();
  }
};

/**
 * Check if insight is accessible to user
 * Utility function (not middleware)
 *
 * @param {Object} insight - Insight document
 * @param {Object} user - User object (or null)
 * @returns {Promise<Boolean>}
 */
const canAccessInsight = async (insight, user) => {
  // Free content is always accessible
  if (insight.type === CONTENT_ACCESS.FREE) {
    return true;
  }

  // No user - cannot access premium
  if (!user) {
    return false;
  }

  // Admins can access everything
  if (user.role === ROLES.ADMIN || user.role === ROLES.SUPERADMIN) {
    return true;
  }

  // Check subscription for premium content
  const subscription = await Subscription.getActiveSubscription(user.id);
  return subscription && subscription.isPremium;
};

module.exports = {
  requirePremiumAccess,
  checkInsightAccess,
  filterInsightsBySubscription,
  addSubscriptionContext,
  canAccessInsight
};
