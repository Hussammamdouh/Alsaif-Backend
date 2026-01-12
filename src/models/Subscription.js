/**
 * Subscription Model
 * Tracks user subscriptions to various plans
 */

const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      default: null,
    },
    tier: {
      type: String,
      required: true,
      enum: ['free', 'premium'],
      default: 'free',
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'cancelled', 'expired', 'paused', 'trial'],
      default: 'active',
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    endDate: {
      type: Date,
      index: true,
    },
    cancelledAt: {
      type: Date,
    },
    cancelReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    autoRenew: {
      type: Boolean,
      default: false,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly', 'lifetime'],
      default: 'monthly',
    },
    // Payment tracking
    stripeSubscriptionId: {
      type: String,
      trim: true,
      sparse: true,
    },
    stripeCustomerId: {
      type: String,
      trim: true,
      sparse: true,
    },
    lastPaymentDate: {
      type: Date,
    },
    nextPaymentDate: {
      type: Date,
    },
    // Discount/Coupon
    discountCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    discountPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    // Trial tracking
    isTrialUsed: {
      type: Boolean,
      default: false,
    },
    trialEndDate: {
      type: Date,
    },
    // Metadata
    metadata: {
      ipAddress: String,
      userAgent: String,
      source: String,
      notes: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ user: 1, tier: 1 });
subscriptionSchema.index({ endDate: 1, status: 1 });

// Virtual for checking if subscription is active
subscriptionSchema.virtual('isActive').get(function () {
  if (this.status !== 'active' && this.status !== 'trial') {
    return false;
  }
  if (this.endDate && this.endDate < new Date()) {
    return false;
  }
  return true;
});

// Virtual for days remaining
subscriptionSchema.virtual('daysRemaining').get(function () {
  if (!this.endDate) {
    return null; // Lifetime or no end date
  }
  const now = new Date();
  const diff = this.endDate.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Virtual for checking if premium
subscriptionSchema.virtual('isPremium').get(function () {
  return ['premium', 'pro', 'enterprise'].includes(this.tier);
});

// Instance method: Check if user has access to a specific tier
subscriptionSchema.methods.hasAccessToTier = function (requiredTier) {
  const tierHierarchy = {
    free: 0,
    basic: 1,
    starter: 2,
    premium: 3,
    pro: 4,
    enterprise: 5,
  };

  const userTierLevel = tierHierarchy[this.tier] || 0;
  const requiredTierLevel = tierHierarchy[requiredTier] || 0;

  return this.isActive && userTierLevel >= requiredTierLevel;
};

// Instance method: Cancel subscription
subscriptionSchema.methods.cancel = async function (reason = null) {
  this.status = 'cancelled';
  this.cancelledAt = new Date();
  this.cancelReason = reason;
  this.autoRenew = false;
  return await this.save();
};

// Instance method: Renew subscription
subscriptionSchema.methods.renew = async function (duration = 30) {
  const now = new Date();
  const newEndDate = new Date(
    this.endDate && this.endDate > now ? this.endDate : now
  );
  newEndDate.setDate(newEndDate.getDate() + duration);

  this.status = 'active';
  this.endDate = newEndDate;
  this.lastPaymentDate = now;

  if (this.autoRenew) {
    const nextPayment = new Date(newEndDate);
    nextPayment.setDate(nextPayment.getDate() - 3); // Charge 3 days before expiry
    this.nextPaymentDate = nextPayment;
  }

  return await this.save();
};

// Static method: Get active subscription for a user
subscriptionSchema.statics.getActiveSubscription = async function (userId) {
  return await this.findOne({
    user: userId,
    status: { $in: ['active', 'trial'] },
    $or: [{ endDate: { $gte: new Date() } }, { endDate: null }],
  })
    .populate('plan')
    .sort({ createdAt: -1 });
};

// Static method: Get user's subscription history
subscriptionSchema.statics.getSubscriptionHistory = async function (
  userId,
  limit = 10
) {
  return await this.find({ user: userId })
    .populate('plan')
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method: Check if user has premium access
subscriptionSchema.statics.hasPremiumAccess = async function (userId) {
  const subscription = await this.getActiveSubscription(userId);
  return subscription ? subscription.isPremium : false;
};

// Static method: Get expiring subscriptions (for notifications)
subscriptionSchema.statics.getExpiringSubscriptions = async function (
  daysThreshold = 7
) {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

  return await this.find({
    status: 'active',
    endDate: {
      $gte: new Date(),
      $lte: thresholdDate,
    },
    autoRenew: false,
  }).populate('user', 'name email');
};

// Pre-save hook: Auto-expire subscriptions
subscriptionSchema.pre('save', function (next) {
  if (this.endDate && this.endDate < new Date() && this.status === 'active') {
    this.status = 'expired';
  }
  next();
});

// Enable virtuals in JSON
subscriptionSchema.set('toJSON', { virtuals: true });
subscriptionSchema.set('toObject', { virtuals: true });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;
