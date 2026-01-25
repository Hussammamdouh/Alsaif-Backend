/**
 * Admin Subscription Plans Controller
 * Manages subscription plan tiers and configurations
 */

const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');
const AuditLogger = require('../utils/auditLogger');

/**
 * Get all subscription plans
 */
exports.getAllPlans = async (req, res, next) => {
  try {
    const { includeInactive = false } = req.query;

    const query = includeInactive === 'true' ? {} : { isActive: true };

    const plans = await SubscriptionPlan.find(query)
      .sort({ tier: 1, price: 1 })
      .lean();

    // Get subscriber count for each plan
    const plansWithStats = await Promise.all(
      plans.map(async (plan) => {
        const subscriberCount = await Subscription.countDocuments({
          tier: plan.tier,
          status: 'active',
        });

        return {
          ...plan,
          subscriberCount,
        };
      })
    );

    res.json({
      success: true,
      data: plansWithStats,
    });
  } catch (error) {
    logger.error('[AdminSubscriptionPlans] Get all plans failed:', error);
    next(error);
  }
};

/**
 * Get a specific subscription plan
 */
exports.getPlan = async (req, res, next) => {
  try {
    const { planId } = req.params;

    const plan = await SubscriptionPlan.findById(planId).lean();

    if (!plan) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Subscription plan not found',
      });
    }

    // Get subscriber count
    const subscriberCount = await Subscription.countDocuments({
      tier: plan.tier,
      status: 'active',
    });

    res.json({
      success: true,
      data: {
        ...plan,
        subscriberCount,
      },
    });
  } catch (error) {
    logger.error('[AdminSubscriptionPlans] Get plan failed:', error);
    next(error);
  }
};

/**
 * Create a new subscription plan
 */
exports.createPlan = async (req, res, next) => {
  try {
    const { name, tier, price, currency = 'USD', billingCycle, features, isActive = true, isFeatured = false } = req.body;

    // Check for duplicate tier + billingCycle combination
    const existing = await SubscriptionPlan.findOne({ tier, billingCycle });
    if (existing) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        message: `A ${billingCycle} plan for ${tier} tier already exists`,
      });
    }

    const plan = await SubscriptionPlan.create({
      name,
      tier,
      price,
      currency,
      stripePriceId: req.body.stripePriceId,
      billingCycle,
      features,
      isActive,
      isFeatured,
    });

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'SUBSCRIPTION_PLAN_CREATED',
      target: { resourceType: 'SubscriptionPlan', resourceId: plan._id, resourceName: plan.name },
      metadata: { tier, price, billingCycle },
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Subscription plan created successfully',
      data: plan,
    });
  } catch (error) {
    logger.error('[AdminSubscriptionPlans] Create plan failed:', error);
    next(error);
  }
};

/**
 * Update a subscription plan
 */
exports.updatePlan = async (req, res, next) => {
  try {
    const { planId } = req.params;
    const updates = req.body;

    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Subscription plan not found',
      });
    }

    // Don't allow changing tier or billingCycle (would require subscription migration)
    delete updates.tier;
    delete updates.billingCycle;

    const allowedFields = [
      'name',
      'price',
      'currency',
      'stripePriceId',
      'features',
      'isActive',
      'isFeatured',
      'description',
      'metadata',
    ];

    allowedFields.forEach((key) => {
      if (updates[key] !== undefined) {
        plan[key] = updates[key];
      }
    });

    await plan.save();

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'SUBSCRIPTION_PLAN_UPDATED',
      target: { resourceType: 'SubscriptionPlan', resourceId: plan._id, resourceName: plan.name },
      metadata: { updates: Object.keys(updates) },
    });

    res.json({
      success: true,
      message: 'Subscription plan updated successfully',
      data: plan,
    });
  } catch (error) {
    logger.error('[AdminSubscriptionPlans] Update plan failed:', error);
    next(error);
  }
};

/**
 * Delete a subscription plan
 */
exports.deletePlan = async (req, res, next) => {
  try {
    const { planId } = req.params;

    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Subscription plan not found',
      });
    }

    // Check if any active subscriptions are using this plan
    const activeSubscriptions = await Subscription.countDocuments({
      tier: plan.tier,
      status: 'active',
    });

    if (activeSubscriptions > 0) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        message: `Cannot delete plan with ${activeSubscriptions} active subscriptions. Deactivate instead.`,
      });
    }

    await plan.deleteOne();

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'SUBSCRIPTION_PLAN_DELETED',
      target: { resourceType: 'SubscriptionPlan', resourceId: plan._id, resourceName: plan.name },
      metadata: { tier: plan.tier },
    });

    res.json({
      success: true,
      message: 'Subscription plan deleted successfully',
    });
  } catch (error) {
    logger.error('[AdminSubscriptionPlans] Delete plan failed:', error);
    next(error);
  }
};

/**
 * Activate a subscription plan
 */
exports.activatePlan = async (req, res, next) => {
  try {
    const { planId } = req.params;

    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Subscription plan not found',
      });
    }

    plan.isActive = true;
    await plan.save();

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'SUBSCRIPTION_PLAN_ACTIVATED',
      target: { resourceType: 'SubscriptionPlan', resourceId: plan._id, resourceName: plan.name },
    });

    res.json({
      success: true,
      message: 'Subscription plan activated successfully',
      data: plan,
    });
  } catch (error) {
    logger.error('[AdminSubscriptionPlans] Activate plan failed:', error);
    next(error);
  }
};

/**
 * Deactivate a subscription plan
 */
exports.deactivatePlan = async (req, res, next) => {
  try {
    const { planId } = req.params;

    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Subscription plan not found',
      });
    }

    plan.isActive = false;
    await plan.save();

    // Audit log
    await AuditLogger.logFromRequest(req, {
      action: 'SUBSCRIPTION_PLAN_DEACTIVATED',
      target: { resourceType: 'SubscriptionPlan', resourceId: plan._id, resourceName: plan.name },
    });

    res.json({
      success: true,
      message: 'Subscription plan deactivated successfully (existing subscriptions unaffected)',
      data: plan,
    });
  } catch (error) {
    logger.error('[AdminSubscriptionPlans] Deactivate plan failed:', error);
    next(error);
  }
};

/**
 * Get all subscribers for a specific plan
 */
exports.getPlanSubscribers = async (req, res, next) => {
  try {
    const { planId } = req.params;
    const { page = 1, limit = 20, status = 'active' } = req.query;

    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Subscription plan not found',
      });
    }

    const skip = (page - 1) * limit;

    const query = { tier: plan.tier };
    if (status) query.status = status;

    const [subscribers, total] = await Promise.all([
      Subscription.find(query)
        .populate('user', 'name email createdAt')
        .sort({ startDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Subscription.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        plan: {
          id: plan._id,
          name: plan.name,
          tier: plan.tier,
        },
        subscribers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
          hasMore: skip + subscribers.length < total,
        },
      },
    });
  } catch (error) {
    logger.error('[AdminSubscriptionPlans] Get plan subscribers failed:', error);
    next(error);
  }
};
