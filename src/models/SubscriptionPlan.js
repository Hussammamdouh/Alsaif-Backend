/**
 * Subscription Plan Model
 * Defines available subscription tiers and their features
 */

const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    tier: {
      type: String,
      required: true,
      enum: ['basic', 'starter', 'premium', 'pro', 'enterprise'],
      index: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    billingCycle: {
      type: String,
      required: true,
      enum: ['monthly', 'quarterly', 'yearly'],
      index: true,
    },
    features: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
        },
        included: {
          type: Boolean,
          required: true,
          default: true,
        },
        value: {
          type: mongoose.Schema.Types.Mixed, // Can be string, number, or boolean
        },
        description: {
          type: String,
          trim: true,
          maxlength: 200,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    stripePriceId: {
      type: String,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for tier + billingCycle (must be unique)
subscriptionPlanSchema.index({ tier: 1, billingCycle: 1 }, { unique: true });

// Index for querying active plans
subscriptionPlanSchema.index({ isActive: 1, tier: 1 });

// Virtual for monthly equivalent price
subscriptionPlanSchema.virtual('monthlyEquivalent').get(function () {
  switch (this.billingCycle) {
    case 'monthly':
      return this.price;
    case 'quarterly':
      return this.price / 3;
    case 'yearly':
      return this.price / 12;
    default:
      return this.price;
  }
});

// Virtual for yearly equivalent price
subscriptionPlanSchema.virtual('yearlyEquivalent').get(function () {
  switch (this.billingCycle) {
    case 'monthly':
      return this.price * 12;
    case 'quarterly':
      return this.price * 4;
    case 'yearly':
      return this.price;
    default:
      return this.price;
  }
});

// Method to check if a specific feature is included
subscriptionPlanSchema.methods.hasFeature = function (featureName) {
  const feature = this.features.find((f) => f.name === featureName);
  return feature ? feature.included : false;
};

// Method to get feature value
subscriptionPlanSchema.methods.getFeatureValue = function (featureName) {
  const feature = this.features.find((f) => f.name === featureName);
  return feature ? feature.value : null;
};

// Static method to get all active plans
subscriptionPlanSchema.statics.getActivePlans = function (billingCycle = null) {
  const query = { isActive: true };
  if (billingCycle) {
    query.billingCycle = billingCycle;
  }
  return this.find(query).sort({ tier: 1, price: 1 });
};

// Static method to get featured plans
subscriptionPlanSchema.statics.getFeaturedPlans = function () {
  return this.find({ isActive: true, isFeatured: true }).sort({ tier: 1, price: 1 });
};

// Pre-save hook to validate features
subscriptionPlanSchema.pre('save', function (next) {
  // Ensure all features have required fields
  if (this.features && this.features.length > 0) {
    for (const feature of this.features) {
      if (!feature.name) {
        return next(new Error('All features must have a name'));
      }
    }
  }
  next();
});

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

module.exports = SubscriptionPlan;
