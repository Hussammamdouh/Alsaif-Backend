const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../constants');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email'
      ]
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'], // SECURITY: Increased from 6 to 8
      select: false,
      validate: {
        validator: function(password) {
          // SECURITY FIX: Enforce stronger password requirements
          // At least 8 characters with mix of letters and numbers
          return /^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/.test(password);
        },
        message: 'Password must be at least 8 characters and contain both letters and numbers'
      }
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.USER,
      index: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    lastLogin: {
      type: Date
    },
    avatar: {
      type: String,
      default: null,
      trim: true
    },
    settings: {
      biometricEnabled: {
        type: Boolean,
        default: false
      },
      language: {
        type: String,
        default: 'en',
        enum: ['en', 'ar', 'fr', 'es', 'de']
      },
      theme: {
        type: String,
        default: 'light',
        enum: ['light', 'dark', 'auto']
      },
      chat: {
        muteGroups: {
          type: Boolean,
          default: false
        },
        readReceipts: {
          type: Boolean,
          default: true
        }
      }
    },
    // Account deletion (GDPR compliance)
    deletionRequestedAt: {
      type: Date,
      default: null
    },
    scheduledDeletionDate: {
      type: Date,
      default: null
    },
    deletionReason: {
      type: String,
      default: null
    },
    // Social features
    followerCount: {
      type: Number,
      default: 0
    },
    followingCount: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for common queries
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ createdAt: -1 });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

/**
 * Get user's active subscription
 * Convenience method to avoid importing Subscription model everywhere
 *
 * @returns {Promise<Subscription|null>}
 */
userSchema.methods.getSubscription = async function () {
  const Subscription = require('./Subscription');
  return await Subscription.getActiveSubscription(this._id);
};

/**
 * Check if user has premium access
 *
 * @returns {Promise<Boolean>}
 */
userSchema.methods.hasPremiumAccess = async function () {
  const Subscription = require('./Subscription');
  return await Subscription.hasPremiumAccess(this._id);
};

/**
 * Get user's subscription tier
 *
 * @returns {Promise<String>} - 'free' or 'premium'
 */
userSchema.methods.getSubscriptionTier = async function () {
  const Subscription = require('./Subscription');
  return await Subscription.getUserTier(this._id);
};

// Remove password from JSON response
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model('User', userSchema);
