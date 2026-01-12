/**
 * Subscription Helper Utilities
 * Centralized functions for subscription management
 */

const Subscription = require('../models/Subscription');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const User = require('../models/User');
const logger = require('./logger');

/**
 * Create a default free subscription for a new user
 * @param {ObjectId} userId - User ID
 * @param {Object} metadata - Additional metadata (ip, userAgent, etc.)
 * @returns {Promise<Subscription>}
 */
async function createDefaultSubscription(userId, metadata = {}) {
  try {
    const subscription = await Subscription.create({
      user: userId,
      tier: 'free',
      status: 'active',
      startDate: new Date(),
      endDate: null, // Free tier has no expiry
      billingCycle: 'lifetime',
      autoRenew: false,
      metadata: {
        ipAddress: metadata.ipAddress || null,
        userAgent: metadata.userAgent || null,
        source: 'registration',
        notes: 'Default free subscription created on registration',
      },
    });

    logger.info(`[SubscriptionHelper] Created default free subscription for user ${userId}`);
    return subscription;
  } catch (error) {
    logger.error(`[SubscriptionHelper] Failed to create default subscription for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Get user subscription summary with details
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Object>}
 */
async function getUserSubscriptionSummary(userId) {
  try {
    const subscription = await Subscription.getActiveSubscription(userId);

    if (!subscription) {
      return {
        tier: 'free',
        status: 'active',
        isPremium: false,
        isActive: true,
        features: {
          basic: true,
          premium: false,
        },
        daysRemaining: null,
        autoRenew: false,
      };
    }

    return {
      id: subscription._id,
      tier: subscription.tier,
      status: subscription.status,
      isPremium: subscription.isPremium,
      isActive: subscription.isActive,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      daysRemaining: subscription.daysRemaining,
      billingCycle: subscription.billingCycle,
      autoRenew: subscription.autoRenew,
      plan: subscription.plan
        ? {
            name: subscription.plan.name,
            price: subscription.plan.price,
            currency: subscription.plan.currency,
            features: subscription.plan.features,
          }
        : null,
      discount: {
        code: subscription.discountCode,
        percent: subscription.discountPercent,
      },
      trial: {
        isTrialUsed: subscription.isTrialUsed,
        trialEndDate: subscription.trialEndDate,
      },
    };
  } catch (error) {
    logger.error(`[SubscriptionHelper] Failed to get subscription summary for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Grant premium subscription to a user
 * @param {ObjectId} userId - User ID
 * @param {String} tier - Subscription tier
 * @param {Number} durationDays - Duration in days
 * @param {Object} options - Additional options
 * @returns {Promise<Subscription>}
 */
async function grantPremiumSubscription(userId, tier, durationDays, options = {}) {
  try {
    // Cancel existing active subscription if any
    const existingSubscription = await Subscription.getActiveSubscription(userId);
    if (existingSubscription) {
      await existingSubscription.cancel('Upgraded to new plan');
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    const subscription = await Subscription.create({
      user: userId,
      tier,
      status: 'active',
      startDate,
      endDate,
      billingCycle: options.billingCycle || 'monthly',
      autoRenew: options.autoRenew || false,
      plan: options.planId || null,
      discountCode: options.discountCode || null,
      discountPercent: options.discountPercent || 0,
      metadata: {
        ipAddress: options.ipAddress || null,
        userAgent: options.userAgent || null,
        source: options.source || 'admin_grant',
        notes: options.notes || 'Premium subscription granted',
      },
    });

    logger.info(`[SubscriptionHelper] Granted ${tier} subscription to user ${userId} for ${durationDays} days`);
    return subscription;
  } catch (error) {
    logger.error(`[SubscriptionHelper] Failed to grant premium subscription to user ${userId}:`, error);
    throw error;
  }
}

/**
 * Revoke premium subscription (downgrade to free)
 * @param {ObjectId} userId - User ID
 * @param {String} reason - Reason for revocation
 * @returns {Promise<Subscription>}
 */
async function revokePremiumSubscription(userId, reason = 'Admin revoked') {
  try {
    const subscription = await Subscription.getActiveSubscription(userId);

    if (!subscription || subscription.tier === 'free') {
      throw new Error('User does not have an active premium subscription');
    }

    await subscription.cancel(reason);

    // Create new free subscription
    const freeSubscription = await createDefaultSubscription(userId, {
      source: 'revocation',
      notes: `Premium subscription revoked: ${reason}`,
    });

    logger.info(`[SubscriptionHelper] Revoked premium subscription for user ${userId}`);
    return freeSubscription;
  } catch (error) {
    logger.error(`[SubscriptionHelper] Failed to revoke premium subscription for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Extend existing subscription
 * @param {ObjectId} userId - User ID
 * @param {Number} additionalDays - Days to add
 * @returns {Promise<Subscription>}
 */
async function extendSubscription(userId, additionalDays) {
  try {
    const subscription = await Subscription.getActiveSubscription(userId);

    if (!subscription) {
      throw new Error('User does not have an active subscription');
    }

    const currentEndDate = subscription.endDate || new Date();
    const newEndDate = new Date(currentEndDate);
    newEndDate.setDate(newEndDate.getDate() + additionalDays);

    subscription.endDate = newEndDate;
    await subscription.save();

    logger.info(`[SubscriptionHelper] Extended subscription for user ${userId} by ${additionalDays} days`);
    return subscription;
  } catch (error) {
    logger.error(`[SubscriptionHelper] Failed to extend subscription for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Cancel subscription
 * @param {ObjectId} userId - User ID
 * @param {String} reason - Cancellation reason
 * @returns {Promise<Subscription>}
 */
async function cancelSubscription(userId, reason = 'User requested cancellation') {
  try {
    const subscription = await Subscription.getActiveSubscription(userId);

    if (!subscription) {
      throw new Error('User does not have an active subscription');
    }

    await subscription.cancel(reason);

    logger.info(`[SubscriptionHelper] Cancelled subscription for user ${userId}`);
    return subscription;
  } catch (error) {
    logger.error(`[SubscriptionHelper] Failed to cancel subscription for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Get subscription statistics
 * @returns {Promise<Object>}
 */
async function getSubscriptionStats() {
  try {
    const stats = await Subscription.aggregate([
      {
        $group: {
          _id: '$tier',
          count: { $sum: 1 },
          active: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0],
            },
          },
        },
      },
    ]);

    const totalUsers = await User.countDocuments();
    const totalSubscriptions = await Subscription.countDocuments();
    const activeSubscriptions = await Subscription.countDocuments({ status: 'active' });
    const premiumSubscriptions = await Subscription.countDocuments({
      status: 'active',
      tier: { $in: ['premium', 'pro', 'enterprise'] },
    });

    const expiringIn7Days = await Subscription.countDocuments({
      status: 'active',
      endDate: {
        $gte: new Date(),
        $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      total: totalSubscriptions,
      active: activeSubscriptions,
      premium: premiumSubscriptions,
      expiringIn7Days,
      totalUsers,
      conversionRate: totalUsers > 0 ? ((premiumSubscriptions / totalUsers) * 100).toFixed(2) : 0,
      byTier: stats.reduce((acc, item) => {
        acc[item._id] = {
          total: item.count,
          active: item.active,
        };
        return acc;
      }, {}),
    };
  } catch (error) {
    logger.error('[SubscriptionHelper] Failed to get subscription stats:', error);
    throw error;
  }
}

/**
 * Check if user has access to a specific feature/tier
 * @param {ObjectId} userId - User ID
 * @param {String} requiredTier - Required tier level
 * @returns {Promise<Boolean>}
 */
async function checkUserAccess(userId, requiredTier) {
  try {
    const subscription = await Subscription.getActiveSubscription(userId);

    if (!subscription) {
      return requiredTier === 'free';
    }

    return subscription.hasAccessToTier(requiredTier);
  } catch (error) {
    logger.error(`[SubscriptionHelper] Failed to check access for user ${userId}:`, error);
    return false;
  }
}

/**
 * Process subscription renewal
 * @param {ObjectId} subscriptionId - Subscription ID
 * @returns {Promise<Subscription>}
 */
async function processSubscriptionRenewal(subscriptionId) {
  try {
    const subscription = await Subscription.findById(subscriptionId);

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Calculate duration based on billing cycle
    let durationDays = 30; // default monthly
    switch (subscription.billingCycle) {
      case 'quarterly':
        durationDays = 90;
        break;
      case 'yearly':
        durationDays = 365;
        break;
      default:
        durationDays = 30;
    }

    await subscription.renew(durationDays);

    logger.info(`[SubscriptionHelper] Renewed subscription ${subscriptionId} for ${durationDays} days`);
    return subscription;
  } catch (error) {
    logger.error(`[SubscriptionHelper] Failed to renew subscription ${subscriptionId}:`, error);
    throw error;
  }
}

module.exports = {
  createDefaultSubscription,
  getUserSubscriptionSummary,
  grantPremiumSubscription,
  revokePremiumSubscription,
  extendSubscription,
  cancelSubscription,
  getSubscriptionStats,
  checkUserAccess,
  processSubscriptionRenewal,
};
