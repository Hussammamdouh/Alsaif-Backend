const mongoose = require('mongoose');
const { NOTIFICATION_EVENTS, NOTIFICATION_CHANNELS, NOTIFICATION_PRIORITIES } = require('../events/enhancedNotificationEvents');

/**
 * Notification Schema
 *
 * Purpose: Track all notifications sent to users
 * Features:
 * - Notification history and status tracking
 * - Delivery status per channel
 * - Retry logic for failed deliveries
 * - Read/unread tracking for in-app notifications
 * - Analytics and reporting
 */

const notificationSchema = new mongoose.Schema(
  {
    // ========== RECIPIENT INFORMATION ==========
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // ========== NOTIFICATION METADATA ==========
    type: {
      type: String,
      required: true,
      enum: Object.values(NOTIFICATION_EVENTS),
      index: true
    },

    priority: {
      type: String,
      required: true,
      enum: Object.values(NOTIFICATION_PRIORITIES),
      default: 'medium',
      index: true
    },

    // ========== NOTIFICATION CONTENT ==========
    title: {
      type: String,
      required: true,
      maxlength: 200
    },

    body: {
      type: String,
      required: true,
      maxlength: 1000
    },

    // Rich content (for in-app notifications)
    richContent: {
      imageUrl: String,
      actionUrl: String,
      actionText: String,
      ctaButtons: [
        {
          text: String,
          url: String,
          style: { type: String, enum: ['primary', 'secondary', 'danger'] }
        }
      ],
      metadata: mongoose.Schema.Types.Mixed // Additional data for rendering
    },

    // ========== DELIVERY CHANNELS ==========
    channels: {
      email: {
        enabled: { type: Boolean, default: false },
        status: {
          type: String,
          enum: ['pending', 'sent', 'delivered', 'failed', 'bounced', 'spam'],
          default: 'pending'
        },
        sentAt: Date,
        deliveredAt: Date,
        failedAt: Date,
        errorMessage: String,
        emailId: String, // External email service message ID
        attempts: { type: Number, default: 0 },
        lastAttemptAt: Date
      },

      push: {
        enabled: { type: Boolean, default: false },
        status: {
          type: String,
          enum: ['pending', 'sent', 'delivered', 'failed'],
          default: 'pending'
        },
        sentAt: Date,
        deliveredAt: Date,
        failedAt: Date,
        errorMessage: String,
        tokens: [String], // Push tokens sent to
        attempts: { type: Number, default: 0 },
        lastAttemptAt: Date
      },

      sms: {
        enabled: { type: Boolean, default: false },
        status: {
          type: String,
          enum: ['pending', 'sent', 'delivered', 'failed'],
          default: 'pending'
        },
        sentAt: Date,
        deliveredAt: Date,
        failedAt: Date,
        errorMessage: String,
        smsId: String, // External SMS service message ID
        phoneNumber: String,
        attempts: { type: Number, default: 0 },
        lastAttemptAt: Date
      },

      inApp: {
        enabled: { type: Boolean, default: true },
        status: {
          type: String,
          enum: ['unread', 'read', 'dismissed'],
          default: 'unread'
        },
        readAt: Date,
        dismissedAt: Date
      }
    },

    // ========== OVERALL STATUS ==========
    overallStatus: {
      type: String,
      enum: ['pending', 'processing', 'sent', 'partial', 'failed'],
      default: 'pending',
      index: true
    },

    // ========== SCHEDULING ==========
    scheduledFor: {
      type: Date,
      index: true
    },

    expiresAt: {
      type: Date
    },

    // ========== RETRY LOGIC ==========
    retryable: {
      type: Boolean,
      default: true
    },

    maxRetries: {
      type: Number,
      default: 3
    },

    nextRetryAt: {
      type: Date,
      index: true
    },

    // ========== GROUPING & BATCHING ==========
    groupKey: {
      type: String,
      index: true // For grouping similar notifications
    },

    batchId: {
      type: String // For batch sending
    },

    // ========== ANALYTICS ==========
    analytics: {
      clicked: { type: Boolean, default: false },
      clickedAt: Date,
      converted: { type: Boolean, default: false },
      convertedAt: Date,
      source: String, // Which event triggered this notification
      campaign: String // Marketing campaign ID if applicable
    },

    // ========== METADATA ==========
    metadata: {
      eventData: mongoose.Schema.Types.Mixed, // Original event data
      userPreferences: mongoose.Schema.Types.Mixed, // User preferences at time of creation
      systemInfo: {
        hostname: String,
        version: String,
        environment: String
      }
    }
  },
  {
    timestamps: true
  }
);

// ==================== INDEXES ====================

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, 'channels.inApp.status': 1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ overallStatus: 1, nextRetryAt: 1 });
notificationSchema.index({ scheduledFor: 1, overallStatus: 1 });
notificationSchema.index({ expiresAt: 1 });
notificationSchema.index({ batchId: 1 });

// Compound index for in-app notifications query
notificationSchema.index({ recipient: 1, 'channels.inApp.enabled': 1, 'channels.inApp.status': 1 });

// TTL index to auto-delete old notifications (optional)
// notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }); // 90 days

// ==================== VIRTUAL PROPERTIES ====================

/**
 * Check if notification is expired
 */
notificationSchema.virtual('isExpired').get(function () {
  return this.expiresAt && this.expiresAt < new Date();
});

/**
 * Check if notification needs retry
 */
notificationSchema.virtual('needsRetry').get(function () {
  if (!this.retryable) return false;
  if (this.overallStatus === 'sent') return false;
  if (this.isExpired) return false;

  const hasFailedChannel = ['email', 'push', 'sms'].some(channel => {
    const ch = this.channels[channel];
    return (
      ch.enabled &&
      ch.status === 'failed' &&
      ch.attempts < this.maxRetries
    );
  });

  return hasFailedChannel;
});

// ==================== INSTANCE METHODS ====================

/**
 * Mark notification as read (for in-app)
 */
notificationSchema.methods.markAsRead = async function () {
  if (this.channels.inApp.enabled && this.channels.inApp.status === 'unread') {
    this.channels.inApp.status = 'read';
    this.channels.inApp.readAt = new Date();
    await this.save();
  }
  return this;
};

/**
 * Mark notification as dismissed (for in-app)
 */
notificationSchema.methods.markAsDismissed = async function () {
  if (this.channels.inApp.enabled) {
    this.channels.inApp.status = 'dismissed';
    this.channels.inApp.dismissedAt = new Date();
    await this.save();
  }
  return this;
};

/**
 * Track click event
 */
notificationSchema.methods.trackClick = async function () {
  if (!this.analytics.clicked) {
    this.analytics.clicked = true;
    this.analytics.clickedAt = new Date();
    await this.save();
  }
  return this;
};

/**
 * Track conversion event
 */
notificationSchema.methods.trackConversion = async function () {
  if (!this.analytics.converted) {
    this.analytics.converted = true;
    this.analytics.convertedAt = new Date();
    await this.save();
  }
  return this;
};

/**
 * Update channel status
 */
notificationSchema.methods.updateChannelStatus = async function (channel, status, additionalData = {}) {
  if (!this.channels[channel]) {
    throw new Error(`Invalid channel: ${channel}`);
  }

  this.channels[channel].status = status;
  this.channels[channel].lastAttemptAt = new Date();
  this.channels[channel].attempts += 1;

  if (status === 'sent') {
    this.channels[channel].sentAt = new Date();
  } else if (status === 'delivered') {
    this.channels[channel].deliveredAt = new Date();
  } else if (status === 'failed') {
    this.channels[channel].failedAt = new Date();
    this.channels[channel].errorMessage = additionalData.errorMessage;

    // Schedule retry if retryable
    if (this.retryable && this.channels[channel].attempts < this.maxRetries) {
      const retryDelay = Math.pow(2, this.channels[channel].attempts) * 60 * 1000; // Exponential backoff
      this.nextRetryAt = new Date(Date.now() + retryDelay);
    }
  }

  // Update overall status
  this.updateOverallStatus();

  await this.save();
  return this;
};

/**
 * Update overall notification status based on channel statuses
 */
notificationSchema.methods.updateOverallStatus = function () {
  const enabledChannels = Object.keys(this.channels).filter(
    ch => this.channels[ch].enabled
  );

  if (enabledChannels.length === 0) {
    this.overallStatus = 'failed';
    return;
  }

  const statuses = enabledChannels.map(ch => this.channels[ch].status);

  if (statuses.every(s => s === 'sent' || s === 'delivered' || s === 'read')) {
    this.overallStatus = 'sent';
  } else if (statuses.every(s => s === 'failed')) {
    this.overallStatus = 'failed';
  } else if (statuses.some(s => s === 'sent' || s === 'delivered')) {
    this.overallStatus = 'partial';
  } else if (statuses.some(s => s === 'pending')) {
    this.overallStatus = 'pending';
  } else {
    this.overallStatus = 'processing';
  }
};

// ==================== STATIC METHODS ====================

/**
 * Get unread in-app notifications for user
 */
notificationSchema.statics.getUnreadForUser = async function (userId, limit = 50) {
  return await this.find({
    recipient: userId,
    'channels.inApp.enabled': true,
    'channels.inApp.status': 'unread'
  })
    .sort({ createdAt: -1 })
    .limit(limit);
};

/**
 * Get notification history for user
 */
notificationSchema.statics.getHistoryForUser = async function (
  userId,
  options = {}
) {
  const {
    page = 1,
    limit = 20,
    type,
    status,
    startDate,
    endDate
  } = options;

  const query = { recipient: userId };

  if (type) query.type = type;
  if (status) query.overallStatus = status;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const [notifications, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    this.countDocuments(query)
  ]);

  return {
    notifications,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: limit
    }
  };
};

/**
 * Get notifications that need retry
 */
notificationSchema.statics.getNotificationsNeedingRetry = async function () {
  return await this.find({
    retryable: true,
    overallStatus: { $in: ['pending', 'partial', 'failed'] },
    nextRetryAt: { $lte: new Date() },
    $or: [
      { 'channels.email.enabled': true, 'channels.email.status': 'failed', 'channels.email.attempts': { $lt: 3 } },
      { 'channels.push.enabled': true, 'channels.push.status': 'failed', 'channels.push.attempts': { $lt: 3 } },
      { 'channels.sms.enabled': true, 'channels.sms.status': 'failed', 'channels.sms.attempts': { $lt: 3 } }
    ]
  }).limit(100);
};

/**
 * Get scheduled notifications ready to send
 */
notificationSchema.statics.getScheduledReadyToSend = async function () {
  return await this.find({
    overallStatus: 'pending',
    scheduledFor: { $lte: new Date() }
  });
};

/**
 * Get notification statistics
 */
notificationSchema.statics.getStats = async function (options = {}) {
  const { userId, startDate, endDate, type } = options;

  const matchStage = {};
  if (userId) matchStage.recipient = new mongoose.Types.ObjectId(userId);
  if (type) matchStage.type = type;
  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $facet: {
        totalByType: [
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ],
        totalByStatus: [
          { $group: { _id: '$overallStatus', count: { $sum: 1 } } }
        ],
        totalByPriority: [
          { $group: { _id: '$priority', count: { $sum: 1 } } }
        ],
        channelStats: [
          {
            $project: {
              emailSent: { $cond: ['$channels.email.enabled', 1, 0] },
              pushSent: { $cond: ['$channels.push.enabled', 1, 0] },
              smsSent: { $cond: ['$channels.sms.enabled', 1, 0] },
              inAppSent: { $cond: ['$channels.inApp.enabled', 1, 0] }
            }
          },
          {
            $group: {
              _id: null,
              totalEmail: { $sum: '$emailSent' },
              totalPush: { $sum: '$pushSent' },
              totalSms: { $sum: '$smsSent' },
              totalInApp: { $sum: '$inAppSent' }
            }
          }
        ],
        engagementStats: [
          {
            $group: {
              _id: null,
              totalClicked: { $sum: { $cond: ['$analytics.clicked', 1, 0] } },
              totalConverted: { $sum: { $cond: ['$analytics.converted', 1, 0] } }
            }
          }
        ]
      }
    }
  ]);

  return stats[0];
};

/**
 * Mark old notifications as expired
 */
notificationSchema.statics.markExpired = async function () {
  const result = await this.updateMany(
    {
      expiresAt: { $lte: new Date() },
      overallStatus: { $in: ['pending', 'processing'] }
    },
    {
      $set: { overallStatus: 'failed' }
    }
  );

  return result;
};

module.exports = mongoose.model('Notification', notificationSchema);
