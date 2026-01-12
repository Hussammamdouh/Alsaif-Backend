/**
 * Push Subscription Model
 *
 * Stores Web Push API subscriptions for users
 */

const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  subscription: {
    endpoint: {
      type: String,
      required: true
    },
    expirationTime: {
      type: Date,
      default: null
    },
    keys: {
      p256dh: {
        type: String,
        required: true
      },
      auth: {
        type: String,
        required: true
      }
    }
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  deviceInfo: {
    userAgent: String,
    platform: String,
    browser: String
  },
  successCount: {
    type: Number,
    default: 0
  },
  failureCount: {
    type: Number,
    default: 0
  },
  lastSuccess: {
    type: Date,
    default: null
  },
  lastFailure: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for finding active subscriptions by user
pushSubscriptionSchema.index({ userId: 1, isActive: 1 });

// Index for finding subscriptions by endpoint
pushSubscriptionSchema.index({ 'subscription.endpoint': 1 });

// Index for cleanup (inactive subscriptions)
pushSubscriptionSchema.index({ isActive: 1, updatedAt: 1 });

/**
 * Find active subscriptions for user
 */
pushSubscriptionSchema.statics.findActiveByUser = function (userId) {
  return this.find({ userId, isActive: true });
};

/**
 * Deactivate subscription by endpoint
 */
pushSubscriptionSchema.statics.deactivateByEndpoint = async function (endpoint) {
  return this.findOneAndUpdate(
    { 'subscription.endpoint': endpoint },
    { isActive: false, updatedAt: new Date() },
    { new: true }
  );
};

/**
 * Get subscription statistics for user
 */
pushSubscriptionSchema.statics.getUserStats = async function (userId) {
  const subscriptions = await this.find({ userId });

  const stats = {
    total: subscriptions.length,
    active: subscriptions.filter(s => s.isActive).length,
    inactive: subscriptions.filter(s => !s.isActive).length,
    totalSuccess: subscriptions.reduce((sum, s) => sum + (s.successCount || 0), 0),
    totalFailure: subscriptions.reduce((sum, s) => sum + (s.failureCount || 0), 0)
  };

  return stats;
};

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
