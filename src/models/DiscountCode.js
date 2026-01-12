/**
 * Discount Code Model
 * Manages promotional codes and subscription discounts
 */

const mongoose = require('mongoose');

const discountCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    type: {
      type: String,
      required: true,
      enum: ['percentage', 'fixed_amount', 'free_trial'],
      index: true,
    },
    value: {
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
    applicableTiers: {
      type: [String],
      enum: ['basic', 'starter', 'premium', 'pro', 'enterprise'],
      default: [],
    },
    applicableBillingCycles: {
      type: [String],
      enum: ['monthly', 'quarterly', 'yearly'],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    validFrom: {
      type: Date,
      required: true,
      index: true,
    },
    validUntil: {
      type: Date,
      required: true,
      index: true,
    },
    maxUses: {
      type: Number,
      min: 0,
      default: null, // null = unlimited
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxUsesPerUser: {
      type: Number,
      min: 1,
      default: 1,
    },
    minimumPurchaseAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    firstTimeUsersOnly: {
      type: Boolean,
      default: false,
    },
    stackable: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    usageHistory: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        subscription: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Subscription',
        },
        discountAmount: {
          type: Number,
          required: true,
        },
        usedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Index for active codes within date range
discountCodeSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });

// Virtual for checking if code is currently valid
discountCodeSchema.virtual('isCurrentlyValid').get(function () {
  const now = new Date();
  return (
    this.isActive &&
    this.validFrom <= now &&
    this.validUntil >= now &&
    (this.maxUses === null || this.usedCount < this.maxUses)
  );
});

// Method to check if code can be used by a specific user
discountCodeSchema.methods.canBeUsedBy = async function (userId) {
  const now = new Date();

  // Check if code is active and within valid date range
  if (!this.isActive || this.validFrom > now || this.validUntil < now) {
    return { valid: false, reason: 'Code is not currently valid' };
  }

  // Check if max uses reached
  if (this.maxUses !== null && this.usedCount >= this.maxUses) {
    return { valid: false, reason: 'Code has reached maximum uses' };
  }

  // Check per-user usage limit
  const userUsageCount = this.usageHistory.filter(
    (usage) => usage.user.toString() === userId.toString()
  ).length;

  if (userUsageCount >= this.maxUsesPerUser) {
    return { valid: false, reason: 'You have already used this code the maximum number of times' };
  }

  // Check if first-time users only
  if (this.firstTimeUsersOnly) {
    const User = mongoose.model('User');
    const user = await User.findById(userId);
    const Subscription = mongoose.model('Subscription');
    const previousSubscriptions = await Subscription.countDocuments({
      user: userId,
      status: { $in: ['active', 'cancelled', 'expired'] },
    });

    if (previousSubscriptions > 0) {
      return { valid: false, reason: 'Code is only valid for first-time users' };
    }
  }

  return { valid: true };
};

// Method to calculate discount amount
discountCodeSchema.methods.calculateDiscount = function (originalPrice) {
  if (this.type === 'percentage') {
    return (originalPrice * this.value) / 100;
  } else if (this.type === 'fixed_amount') {
    return Math.min(this.value, originalPrice); // Can't discount more than the price
  } else if (this.type === 'free_trial') {
    return 0; // Handled differently in subscription logic
  }
  return 0;
};

// Method to apply discount and record usage
discountCodeSchema.methods.applyDiscount = async function (userId, subscriptionId, discountAmount) {
  this.usedCount += 1;
  this.usageHistory.push({
    user: userId,
    subscription: subscriptionId,
    discountAmount,
    usedAt: new Date(),
  });
  await this.save();
};

// Static method to find valid codes for a user
discountCodeSchema.statics.findValidCodesForUser = async function (userId, tier = null, billingCycle = null) {
  const now = new Date();

  const query = {
    isActive: true,
    validFrom: { $lte: now },
    validUntil: { $gte: now },
    $or: [{ maxUses: null }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }],
  };

  if (tier) {
    query.$or = [{ applicableTiers: { $size: 0 } }, { applicableTiers: tier }];
  }

  if (billingCycle) {
    query.$and = query.$and || [];
    query.$and.push({
      $or: [{ applicableBillingCycles: { $size: 0 } }, { applicableBillingCycles: billingCycle }],
    });
  }

  const codes = await this.find(query);

  // Filter codes based on per-user limits
  const validCodes = [];
  for (const code of codes) {
    const result = await code.canBeUsedBy(userId);
    if (result.valid) {
      validCodes.push(code);
    }
  }

  return validCodes;
};

// Static method to validate and retrieve a code
discountCodeSchema.statics.validateCode = async function (codeString, userId = null) {
  const code = await this.findOne({ code: codeString.toUpperCase() });

  if (!code) {
    return { valid: false, reason: 'Code not found' };
  }

  if (userId) {
    return await code.canBeUsedBy(userId);
  }

  // Basic validation without user
  const now = new Date();
  if (!code.isActive || code.validFrom > now || code.validUntil < now) {
    return { valid: false, reason: 'Code is not currently valid' };
  }

  if (code.maxUses !== null && code.usedCount >= code.maxUses) {
    return { valid: false, reason: 'Code has reached maximum uses' };
  }

  return { valid: true, code };
};

// Pre-save validation
discountCodeSchema.pre('save', function (next) {
  // Validate percentage value
  if (this.type === 'percentage' && this.value > 100) {
    return next(new Error('Percentage discount cannot exceed 100%'));
  }

  // Validate date range
  if (this.validUntil <= this.validFrom) {
    return next(new Error('Valid until date must be after valid from date'));
  }

  next();
});

const DiscountCode = mongoose.model('DiscountCode', discountCodeSchema);

module.exports = DiscountCode;
