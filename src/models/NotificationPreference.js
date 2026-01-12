const mongoose = require('mongoose');
const { NOTIFICATION_CHANNELS } = require('../events/enhancedNotificationEvents');

/**
 * Notification Preference Schema
 *
 * Purpose: Allow users to control which notifications they receive and through which channels
 * Features:
 * - Granular control per notification type
 * - Channel-specific preferences (email, push, SMS, in-app)
 * - Quiet hours support
 * - Frequency control (instant, daily digest, weekly digest)
 */

const notificationPreferenceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },

    // ========== SUBSCRIPTION NOTIFICATIONS ==========
    subscription: {
      lifecycle: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['email', 'in-app']
        }
      },
      reminders: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['email', 'push', 'in-app']
        },
        daysBeforeExpiry: { type: [Number], default: [7, 3, 1] } // Send reminders at 7, 3, and 1 day before expiry
      },
      renewals: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['email', 'in-app']
        }
      }
    },

    // ========== CONTENT NOTIFICATIONS ==========
    content: {
      newInsights: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['push', 'in-app']
        },
        frequency: {
          type: String,
          enum: ['instant', 'hourly', 'daily', 'weekly'],
          default: 'instant'
        },
        categories: {
          type: [String],
          default: [] // Empty = all categories, otherwise specific categories
        },
        premiumOnly: { type: Boolean, default: false }
      },
      featuredInsights: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['push', 'in-app']
        }
      },
      trendingContent: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['in-app']
        },
        frequency: {
          type: String,
          enum: ['instant', 'daily', 'weekly'],
          default: 'daily'
        }
      },
      personalizedDigest: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['email']
        },
        frequency: {
          type: String,
          enum: ['daily', 'weekly', 'monthly'],
          default: 'weekly'
        },
        dayOfWeek: { type: Number, min: 0, max: 6, default: 1 }, // 0 = Sunday, 1 = Monday, etc.
        timeOfDay: { type: String, default: '09:00' } // HH:MM format
      }
    },

    // ========== ENGAGEMENT NOTIFICATIONS ==========
    engagement: {
      likes: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['in-app']
        }
      },
      comments: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['push', 'in-app']
        }
      },
      replies: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['push', 'email', 'in-app']
        }
      },
      followers: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['in-app']
        }
      }
    },

    // ========== PREMIUM NOTIFICATIONS ==========
    premium: {
      newPremiumContent: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['email', 'push', 'in-app']
        }
      },
      exclusiveOffers: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['email', 'in-app']
        }
      }
    },

    // ========== SYSTEM NOTIFICATIONS ==========
    system: {
      securityAlerts: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['email', 'push', 'sms', 'in-app']
        }
      },
      announcements: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['email', 'in-app']
        }
      },
      productUpdates: {
        enabled: { type: Boolean, default: false },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['email']
        }
      }
    },

    // ========== MARKETING NOTIFICATIONS ==========
    marketing: {
      promotional: {
        enabled: { type: Boolean, default: false },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['email']
        }
      },
      newsletter: {
        enabled: { type: Boolean, default: true },
        channels: {
          type: [String],
          enum: Object.values(NOTIFICATION_CHANNELS),
          default: ['email']
        },
        frequency: {
          type: String,
          enum: ['weekly', 'monthly'],
          default: 'weekly'
        }
      }
    },

    // ========== GLOBAL SETTINGS ==========
    globalSettings: {
      // Master switches
      emailEnabled: { type: Boolean, default: true },
      pushEnabled: { type: Boolean, default: true },
      smsEnabled: { type: Boolean, default: false },
      inAppEnabled: { type: Boolean, default: true },

      // Quiet hours (do not disturb)
      quietHours: {
        enabled: { type: Boolean, default: false },
        startTime: { type: String, default: '22:00' }, // HH:MM format
        endTime: { type: String, default: '08:00' },   // HH:MM format
        timezone: { type: String, default: 'UTC' },
        excludeCritical: { type: Boolean, default: true } // Allow critical notifications during quiet hours
      },

      // Frequency limits
      maxEmailsPerDay: { type: Number, default: 10, min: 0, max: 50 },
      maxPushPerDay: { type: Number, default: 20, min: 0, max: 100 },

      // Device tokens for push notifications
      pushTokens: [
        {
          token: String,
          platform: { type: String, enum: ['ios', 'android', 'web'] },
          addedAt: { type: Date, default: Date.now },
          lastUsed: Date,
          active: { type: Boolean, default: true }
        }
      ],

      // Phone number for SMS (verified)
      phoneNumber: String,
      phoneVerified: { type: Boolean, default: false },
      phoneVerifiedAt: Date
    },

    // ========== METADATA ==========
    metadata: {
      lastUpdated: Date,
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      notificationsSent: {
        total: { type: Number, default: 0 },
        lastReset: { type: Date, default: Date.now }
      }
    }
  },
  {
    timestamps: true
  }
);

// ==================== INDEXES ====================

// Note: user field already has unique: true which creates an index automatically
notificationPreferenceSchema.index({ 'globalSettings.emailEnabled': 1 });
notificationPreferenceSchema.index({ 'globalSettings.pushEnabled': 1 });

// ==================== INSTANCE METHODS ====================

/**
 * Check if a specific notification type is enabled for a channel
 */
notificationPreferenceSchema.methods.isEnabled = function (category, type, channel) {
  try {
    const preference = this[category]?.[type];
    if (!preference || !preference.enabled) return false;

    // Check global channel setting
    const channelKey = `${channel}Enabled`;
    if (this.globalSettings[channelKey] === false) return false;

    // Check specific preference channels
    if (preference.channels && !preference.channels.includes(channel)) return false;

    return true;
  } catch (error) {
    console.error('Error checking notification preference:', error);
    return false;
  }
};

/**
 * Check if user is in quiet hours
 */
notificationPreferenceSchema.methods.isInQuietHours = function (isCritical = false) {
  if (!this.globalSettings.quietHours.enabled) return false;
  if (isCritical && this.globalSettings.quietHours.excludeCritical) return false;

  const now = new Date();
  const currentTime = now.toTimeString().substring(0, 5); // HH:MM

  const start = this.globalSettings.quietHours.startTime;
  const end = this.globalSettings.quietHours.endTime;

  // Handle overnight quiet hours (e.g., 22:00 to 08:00)
  if (start > end) {
    return currentTime >= start || currentTime < end;
  }

  return currentTime >= start && currentTime < end;
};

/**
 * Check if daily notification limit reached
 */
notificationPreferenceSchema.methods.hasReachedDailyLimit = function (channel) {
  const limitKey = `max${channel.charAt(0).toUpperCase() + channel.slice(1)}PerDay`;
  const limit = this.globalSettings[limitKey];

  if (!limit) return false;

  // In production, you'd check a notification counter collection
  // For now, we'll use the metadata counter (simplified)
  const today = new Date().setHours(0, 0, 0, 0);
  const lastReset = new Date(this.metadata.notificationsSent.lastReset).setHours(0, 0, 0, 0);

  if (today !== lastReset) {
    // Reset counter for new day
    this.metadata.notificationsSent.total = 0;
    this.metadata.notificationsSent.lastReset = new Date();
  }

  return this.metadata.notificationsSent.total >= limit;
};

/**
 * Add push notification token
 */
notificationPreferenceSchema.methods.addPushToken = function (token, platform) {
  // Remove existing token if present
  this.globalSettings.pushTokens = this.globalSettings.pushTokens.filter(
    t => t.token !== token
  );

  // Add new token
  this.globalSettings.pushTokens.push({
    token,
    platform,
    addedAt: new Date(),
    lastUsed: new Date(),
    active: true
  });

  return this.save();
};

/**
 * Remove push notification token
 */
notificationPreferenceSchema.methods.removePushToken = function (token) {
  this.globalSettings.pushTokens = this.globalSettings.pushTokens.filter(
    t => t.token !== token
  );

  return this.save();
};

/**
 * Get active push tokens
 */
notificationPreferenceSchema.methods.getActivePushTokens = function () {
  return this.globalSettings.pushTokens.filter(t => t.active).map(t => t.token);
};

// ==================== STATIC METHODS ====================

/**
 * Get or create notification preferences for a user
 */
notificationPreferenceSchema.statics.getOrCreateForUser = async function (userId) {
  let preferences = await this.findOne({ user: userId });

  if (!preferences) {
    preferences = await this.create({ user: userId });
  }

  return preferences;
};

/**
 * Get users who want notifications for a specific type and channel
 */
notificationPreferenceSchema.statics.getUsersForNotification = async function (
  category,
  type,
  channel,
  additionalFilters = {}
) {
  const query = {
    ...additionalFilters
  };

  // Build query for enabled preferences
  query[`${category}.${type}.enabled`] = true;
  query[`${category}.${type}.channels`] = channel;
  query[`globalSettings.${channel}Enabled`] = true;

  return await this.find(query).populate('user', 'name email');
};

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);
