const Subscription = require('../models/Subscription');
const {
  getUserSubscriptionSummary,
  grantPremiumSubscription,
  revokePremiumSubscription,
  extendSubscription,
  cancelSubscription,
  getSubscriptionStats
} = require('../utils/subscriptionHelper');
const { HTTP_STATUS, ROLES } = require('../constants');
const groupChatService = require('../services/groupChatService');
const stripeService = require('../services/stripeService');
const env = require('../config/env');
const AuditLogger = require('../utils/auditLogger');

/**
 * Subscription Controller
 *
 * Handles subscription-related operations
 * - User: Check status, view benefits
 * - Admin: Grant, revoke, extend subscriptions
 */

class SubscriptionController {
  /**
   * Get current user's subscription status
   * GET /api/subscriptions/me
   */
  async getMySubscription(req, res, next) {
    try {
      const userId = req.user.id;

      const summary = await getUserSubscriptionSummary(userId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          subscription: summary
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get subscription benefits/features
   * GET /api/subscriptions/benefits
   * Public endpoint
   */
  async getSubscriptionBenefits(req, res) {
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        tiers: {
          free: {
            name: 'Free',
            price: 0,
            features: [
              'Access to all free insights',
              'Basic market analysis',
              'Community discussions',
              'Email support'
            ],
            limitations: [
              'No premium insights',
              'Limited technical analysis',
              'Ads supported'
            ]
          },
          premium: {
            name: 'Premium',
            price: 9.99,
            billingCycle: 'monthly',
            features: [
              'Unlimited access to all insights',
              'Advanced market analysis',
              'Expert trading strategies',
              'Technical analysis tools',
              'Priority support',
              'Ad-free experience',
              'Early access to new features',
              'Exclusive webinars'
            ],
            limitations: []
          }
        }
      }
    });
  }

  /**
   * ADMIN: Get all subscriptions with filters
   * GET /api/admin/subscriptions
   */
  async getAllSubscriptions(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        tier,
        status,
        sort = '-createdAt'
      } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Build filter - Only show active premium/trial subscribers
      const filter = {
        tier: { $ne: 'free' },
        status: { $in: ['active', 'trial'] }
      };
      if (tier) filter.tier = tier;
      if (status) filter.status = status;

      const subscriptions = await Subscription.find(filter)
        .populate('user', 'name email role')
        .populate('plan', 'name price tier')
        .sort(sort)
        .limit(parseInt(limit))
        .skip(skip)
        .lean();

      const total = await Subscription.countDocuments(filter);

      // Transform _id to id for frontend compatibility
      const transformedSubscriptions = subscriptions.map(subscription => ({
        ...subscription,
        id: subscription._id.toString(),
        _id: undefined,
        // Also transform nested user if populated
        user: subscription.user ? {
          ...subscription.user,
          id: subscription.user._id?.toString() || subscription.user.id,
          _id: undefined
        } : subscription.user,
        // Also transform nested plan if populated
        plan: subscription.plan ? {
          ...subscription.plan,
          id: subscription.plan._id?.toString() || subscription.plan.id,
          _id: undefined
        } : subscription.plan
      }));

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          subscriptions: transformedSubscriptions,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Get subscription statistics
   * GET /api/admin/subscriptions/stats
   */
  async getStats(req, res, next) {
    try {
      const stats = await getSubscriptionStats();

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: { stats }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Grant premium subscription to user
   * POST /api/admin/subscriptions/grant
   */
  async grantPremium(req, res, next) {
    try {
      const { email, tier, durationDays, reason, source } = req.body;
      const User = require('../models/User');

      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'User with this email not found'
        });
      }

      const userId = user._id;

      // Calculate endDate if durationDays is provided (frontend sends durationDays)
      const subscription = await grantPremiumSubscription(userId, tier, parseInt(durationDays) || 30, {
        grantedBy: req.user.id,
        grantedByRole: req.user.role,
        reason,
        source: source || 'admin_grant'
      });

      // Add user to premium tier group chat
      try {
        await groupChatService.handleSubscriptionChange(userId, 'free', 'premium');
      } catch (groupError) {
        console.error('[SubscriptionController] Failed to update group membership:', groupError);
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Premium subscription granted successfully',
        data: { subscription }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Revoke premium subscription (downgrade to free)
   * POST /api/admin/subscriptions/revoke
   */
  async revokePremium(req, res, next) {
    try {
      const { userId, reason } = req.body;

      const subscription = await revokePremiumSubscription(userId, reason || 'Revoked by admin');

      // Remove user from premium tier group chat
      try {
        await groupChatService.handleSubscriptionEnd(userId);
      } catch (groupError) {
        console.error('[SubscriptionController] Failed to update group membership:', groupError);
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Premium subscription revoked successfully',
        data: { subscription }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Extend subscription end date
   * PATCH /api/admin/subscriptions/:subscriptionId/extend
   */
  async extendSubscription(req, res, next) {
    try {
      const { subscriptionId } = req.params;
      const { endDate, reason } = req.body;

      if (!endDate) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'End date is required'
        });
      }

      const subscription = await extendSubscription(
        subscriptionId,
        new Date(endDate),
        req.user.id,
        reason
      );

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Subscription extended successfully',
        data: { subscription }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Get user's subscription details
   * GET /api/admin/users/:userId/subscription
   */
  async getUserSubscription(req, res, next) {
    try {
      const { userId } = req.params;

      const subscription = await Subscription.getActiveSubscription(userId);

      if (!subscription) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'No active subscription found for this user'
        });
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: { subscription }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * USER: Cancel own subscription
   * POST /api/subscriptions/cancel
   */
  async cancelMySubscription(req, res, next) {
    try {
      const userId = req.user.id;
      const { reason } = req.body;

      const subscription = await Subscription.findOne({
        user: userId,
        status: 'active'
      });

      if (!subscription) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'No active subscription found'
        });
      }

      await cancelSubscription(subscription._id, userId, reason || 'User cancelled');

      // If it was a premium subscription, remove from premium group
      if (subscription.tier === 'premium') {
        try {
          await groupChatService.handleSubscriptionEnd(userId);
        } catch (groupError) {
          console.error('[SubscriptionController] Failed to update group membership:', groupError);
        }
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Subscription cancelled successfully',
        data: {
          message: 'Your subscription will remain active until the end of the current billing period',
          endDate: subscription.endDate
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Simple in-memory cache for available plans
   */
  static _plansCache = {
    data: null,
    timestamp: 0,
    ttl: 10 * 60 * 1000 // 10 minutes
  };

  /**
   * Get available subscription plans
   * GET /api/subscriptions/plans
   * Public endpoint
   */
  async getAvailablePlans(req, res, next) {
    try {
      const now = Date.now();
      const cache = SubscriptionController._plansCache;

      // Return cached plans if valid
      if (cache.data && (now - cache.timestamp) < cache.ttl) {
        return res.status(HTTP_STATUS.OK).json({
          success: true,
          data: {
            plans: cache.data
          }
        });
      }

      const SubscriptionPlan = require('../models/SubscriptionPlan');

      // Get all active and featured plans
      const plans = await SubscriptionPlan.find({ isActive: true })
        .select('name tier price currency billingCycle features description isFeatured stripePriceId')
        .sort({ isFeatured: -1, price: 1 })
        .lean();

      // Update cache
      cache.data = plans;
      cache.timestamp = now;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          plans
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get subscription history for current user
   * GET /api/subscriptions/history
   */
  async getMySubscriptionHistory(req, res, next) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [subscriptions, total] = await Promise.all([
        Subscription.find({ user: userId })
          .select('tier status startDate endDate cancelledAt source payment')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Subscription.countDocuments({ user: userId })
      ]);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          subscriptions,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create checkout session for subscription payment
   * POST /api/subscriptions/checkout
   */
  async createCheckoutSession(req, res, next) {
    try {
      const userId = req.user.id;
      const { planId, billingCycle, successUrl, cancelUrl } = req.body;

      const SubscriptionPlan = require('../models/SubscriptionPlan');
      const User = require('../models/User');

      // Verify plan exists and is active
      const plan = await SubscriptionPlan.findById(planId);
      if (!plan || !plan.isActive) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Invalid or inactive subscription plan'
        });
      }

      // Check if user already has an active subscription
      const existingSubscription = await Subscription.findOne({
        user: userId,
        status: 'active'
      });

      if (existingSubscription) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'You already have an active subscription. Please cancel it before upgrading.'
        });
      }

      const user = await User.findById(userId);

      // Create Stripe checkout session
      const session = await stripeService.createCheckoutSession({
        userId: userId.toString(),
        userEmail: user.email,
        stripePriceId: plan.stripePriceId,
        planId: planId.toString(),
        tier: plan.tier,
        successUrl: successUrl || `${env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: cancelUrl || `${env.FRONTEND_URL}/subscription`,
      });

      await AuditLogger.log({
        userId,
        action: 'CHECKOUT_INITIATED',
        category: 'SUBSCRIPTION',
        severity: 'info',
        metadata: {
          planId,
          planName: plan.name,
          tier: plan.tier,
          billingCycle,
          amount: plan.price,
          stripeSessionId: session.id
        }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          checkoutUrl: session.url,
          sessionId: session.id,
          amount: plan.price,
          currency: plan.currency || 'AED',
          planName: plan.name,
          billingCycle
        },
        message: 'Checkout session created. Redirect user to checkoutUrl to complete payment.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle payment gateway webhook
   * POST /api/subscriptions/webhook
   * Public endpoint (verified by signature)
   */
  async handlePaymentWebhook(req, res, next) {
    try {
      const signature = req.headers['stripe-signature'];

      if (!signature) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Missing Stripe signature'
        });
      }

      let event;
      try {
        event = stripeService.constructEvent(req.rawBody, signature);
      } catch (err) {
        console.error(`[Webhook Error] Signature verification failed: ${err.message}`);
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: `Webhook Signature Error: ${err.message}`
        });
      }

      // Handle different event types
      switch (event.type) {
        case 'checkout.session.completed':
        case 'payment_intent.succeeded':
          await this._handlePaymentSuccess(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          await this._handlePaymentFailure(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await this._handleSubscriptionCancelled(event.data.object);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.status(HTTP_STATUS.OK).json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error);
      next(error);
    }
  }

  /**
   * Renew subscription
   * POST /api/subscriptions/renew
   */
  async renewSubscription(req, res, next) {
    try {
      const userId = req.user.id;
      const { planId, billingCycle } = req.body;

      const SubscriptionPlan = require('../models/SubscriptionPlan');
      const AuditLogger = require('../utils/auditLogger');

      // Get the plan
      const plan = await SubscriptionPlan.findById(planId);
      if (!plan || !plan.isActive) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Invalid or inactive subscription plan'
        });
      }

      // Check for existing subscription
      const existingSubscription = await Subscription.findOne({
        user: userId,
        status: { $in: ['active', 'expired'] }
      }).sort({ endDate: -1 });

      // Calculate new end date
      const now = new Date();
      const startDate = existingSubscription && existingSubscription.endDate > now
        ? existingSubscription.endDate
        : now;

      let endDate = new Date(startDate);
      switch (billingCycle) {
        case 'monthly':
          endDate.setMonth(endDate.getMonth() + 1);
          break;
        case 'quarterly':
          endDate.setMonth(endDate.getMonth() + 3);
          break;
        case 'yearly':
          endDate.setFullYear(endDate.getFullYear() + 1);
          break;
      }

      // This would integrate with payment gateway in production
      // For now, we'll return payment information

      await AuditLogger.log({
        userId,
        action: 'SUBSCRIPTION_RENEWAL_INITIATED',
        category: 'SUBSCRIPTION',
        severity: 'info',
        metadata: {
          planId,
          planName: plan.name,
          billingCycle,
          amount: plan.price,
          newEndDate: endDate
        }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          checkoutUrl: process.env.PAYMENT_GATEWAY_URL || 'https://payment-gateway.example.com/checkout',
          amount: plan.price,
          currency: plan.currency || 'USD',
          planName: plan.name,
          billingCycle,
          newEndDate: endDate
        },
        message: 'Renewal initiated. Complete payment to activate.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Private: Handle successful payment
   */
  async _handlePaymentSuccess(paymentData) {
    const { userId, planId, tier } = paymentData.metadata || {};

    if (!userId || !planId) {
      console.error('Missing metadata in payment data');
      return;
    }

    const SubscriptionPlan = require('../models/SubscriptionPlan');
    const plan = await SubscriptionPlan.findById(planId);

    if (!plan) {
      console.error('Plan not found:', planId);
      return;
    }

    // Calculate end date based on billing cycle
    const now = new Date();
    const endDate = new Date(now);
    switch (plan.billingCycle) {
      case 'monthly':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case 'quarterly':
        endDate.setMonth(endDate.getMonth() + 3);
        break;
      case 'yearly':
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
    }

    // Calculate duration in days
    let durationDays = 30;
    switch (plan.billingCycle) {
      case 'quarterly': durationDays = 90; break;
      case 'yearly': durationDays = 365; break;
    }

    // Grant subscription using helper
    await grantPremiumSubscription(
      userId,
      plan.tier,
      durationDays,
      {
        planId: plan._id,
        billingCycle: plan.billingCycle,
        source: 'payment',
        notes: `Stripe Payment Successful: ${paymentData.id}`
      }
    );

    // Create payment record
    const Payment = require('../models/Payment');
    await Payment.create({
      user: userId,
      amount: paymentData.amount_total / 100, // Convert from cents
      currency: paymentData.currency,
      status: 'completed',
      paymentMethod: 'card',
      provider: 'stripe',
      providerPaymentId: paymentData.id,
      metadata: {
        planId,
        tier: plan.tier
      }
    });

    const AuditLogger = require('../utils/auditLogger');
    await AuditLogger.log({
      userId,
      action: 'PAYMENT_SUCCESS',
      category: 'SUBSCRIPTION',
      severity: 'info',
      metadata: {
        amount: paymentData.amount_total / 100,
        planId,
        tier: plan.tier
      }
    });
  }

  /**
   * Private: Handle failed payment
   */
  async _handlePaymentFailure(paymentData) {
    const { userId } = paymentData.metadata || {};

    if (userId) {
      const AuditLogger = require('../utils/auditLogger');
      await AuditLogger.log({
        userId,
        action: 'PAYMENT_FAILED',
        category: 'SUBSCRIPTION',
        severity: 'warning',
        metadata: {
          reason: paymentData.last_payment_error?.message || 'Unknown'
        }
      });
    }
  }

  /**
   * Private: Handle subscription cancellation from payment gateway
   */
  async _handleSubscriptionCancelled(subscriptionData) {
    const { userId } = subscriptionData.metadata || {};

    if (userId) {
      // Cancel the subscription
      const subscription = await Subscription.findOne({
        user: userId,
        status: 'active'
      });

      if (subscription) {
        await cancelSubscription(subscription._id, userId, 'Cancelled by payment gateway');
      }
    }
  }
}

module.exports = new SubscriptionController();
