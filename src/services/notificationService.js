const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');
const User = require('../models/User');
const { notificationEvents, NOTIFICATION_EVENTS, NOTIFICATION_CHANNELS, NOTIFICATION_PRIORITIES } = require('../events/enhancedNotificationEvents');

/**
 * Notification Service
 *
 * Purpose: Centralized notification delivery orchestration
 * Responsibilities:
 * - Listen to notification events
 * - Check user preferences
 * - Respect quiet hours and rate limits
 * - Create notification records
 * - Dispatch to appropriate channels
 * - Handle retries
 */

class NotificationService {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize notification service and set up event listeners
   * REFACTORED: Background sending now handled by job queue
   */
  initialize() {
    if (this.initialized) return;

    console.log('[NotificationService] Initializing...');

    // Listen to all notification events
    this.setupEventListeners();

    // Start simple maintenance worker (expiration marking)
    this.startExpirationWorker();

    this.initialized = true;
    console.log('[NotificationService] Initialized successfully (job queue enabled)');
  }

  /**
   * Set up listeners for all notification events
   */
  setupEventListeners() {
    // Generic listener for all notifications
    notificationEvents.on('notification', async (eventData) => {
      try {
        await this.processNotificationEvent(eventData);
      } catch (error) {
        console.error('[NotificationService] Error processing notification:', error);
      }
    });

    // Specific listeners for high-priority events
    notificationEvents.on(NOTIFICATION_EVENTS.SUBSCRIPTION_EXPIRING_TODAY, async (data) => {
      console.log(`[NotificationService] URGENT: Subscription expiring today for user ${data.data.userId}`);
      // Could trigger immediate SMS or push notification
    });

    notificationEvents.on(NOTIFICATION_EVENTS.SECURITY_ALERT, async (data) => {
      console.log(`[NotificationService] SECURITY ALERT for user ${data.data.userId}`);
      // Immediate multi-channel delivery
    });
  }

  /**
   * Process a notification event
   */
  async processNotificationEvent(eventData) {
    const { event, data, priority, channels, metadata } = eventData;

    console.log(`[NotificationService] Processing ${event} event`);

    // Determine recipient(s)
    const recipients = await this.determineRecipients(event, data);

    // Process each recipient
    for (const recipient of recipients) {
      try {
        await this.sendNotificationToUser(recipient, {
          type: event,
          data,
          priority,
          requestedChannels: channels,
          metadata
        });
      } catch (error) {
        console.error(`[NotificationService] Error sending to user ${recipient._id}:`, error);
      }
    }
  }

  /**
   * Determine who should receive this notification
   */
  async determineRecipients(event, data) {
    // For single-user events (most subscription and premium events)
    if (data.userId) {
      const user = await User.findById(data.userId);
      return user ? [user] : [];
    }

    // For content publishing events (broadcast to interested users)
    if (event.startsWith('insight:')) {
      return await this.getInterestedUsersForContent(data);
    }

    // For admin events
    if (event === 'insight_request:submitted') {
      // Return all admins
      return await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: true });
    }

    // Default: return empty array
    return [];
  }

  /**
   * Get users interested in specific content
   */
  async getInterestedUsersForContent(contentData) {
    // For new insights, find users who want content notifications
    const { type, category } = contentData;

    const preferences = await NotificationPreference.find({
      'content.newInsights.enabled': true
    }).populate('user');

    return preferences
      .filter(pref => {
        // Filter by user's category preferences
        if (pref.content.newInsights.categories.length > 0) {
          return pref.content.newInsights.categories.includes(category);
        }

        // Filter premium content notifications
        if (type === 'premium' && !pref.content.newInsights.premiumOnly) {
          return pref.user.hasPremiumAccess; // Only send premium notifications to premium users
        }

        return true;
      })
      .map(pref => pref.user);
  }

  /**
   * Send notification to a specific user
   */
  async sendNotificationToUser(user, options) {
    const { type, data, priority, requestedChannels, metadata } = options;

    // Get user's notification preferences
    const preferences = await NotificationPreference.getOrCreateForUser(user._id);

    // Determine category and notification type from event
    const { category, notificationType } = this.parseEventType(type);

    // Check if user wants this notification
    if (!category || !notificationType) {
      console.warn(`[NotificationService] Unknown event type: ${type}`);
      return;
    }

    // Determine which channels to use
    const enabledChannels = this.determineChannels(
      preferences,
      category,
      notificationType,
      requestedChannels,
      priority
    );

    if (enabledChannels.length === 0) {
      console.log(`[NotificationService] User ${user._id} has disabled all channels for ${type}`);
      return;
    }

    // Generate notification content
    const content = this.generateNotificationContent(type, data, user);

    // Create notification record
    const notification = await this.createNotificationRecord({
      recipient: user._id,
      type,
      priority,
      content,
      channels: enabledChannels,
      metadata: {
        eventData: data,
        userPreferences: {
          category,
          notificationType,
          enabledChannels
        },
        ...metadata
      }
    });

    // Send to each channel
    await this.dispatchToChannels(notification, user, preferences);

    return notification;
  }

  /**
   * Parse event type to extract category and notification type
   */
  parseEventType(eventType) {
    // subscription:granted → category: subscription, type: lifecycle
    // insight:published → category: content, type: newInsights

    const mapping = {
      'subscription:created': { category: 'subscription', notificationType: 'lifecycle' },
      'subscription:granted': { category: 'subscription', notificationType: 'lifecycle' },
      'subscription:upgraded': { category: 'subscription', notificationType: 'lifecycle' },
      'subscription:downgraded': { category: 'subscription', notificationType: 'lifecycle' },
      'subscription:renewed': { category: 'subscription', notificationType: 'renewals' },
      'subscription:extended': { category: 'subscription', notificationType: 'renewals' },
      'subscription:cancelled': { category: 'subscription', notificationType: 'lifecycle' },
      'subscription:expired': { category: 'subscription', notificationType: 'lifecycle' },
      'subscription:expiring-soon': { category: 'subscription', notificationType: 'reminders' },
      'subscription:expiring-today': { category: 'subscription', notificationType: 'reminders' },
      'subscription:expired-reminder': { category: 'subscription', notificationType: 'reminders' },

      'insight:published': { category: 'content', notificationType: 'newInsights' },
      'insight:premium-published': { category: 'premium', notificationType: 'newPremiumContent' },
      'insight:free-published': { category: 'content', notificationType: 'newInsights' },
      'insight:featured': { category: 'content', notificationType: 'featuredInsights' },
      'insight:updated': { category: 'content', notificationType: 'newInsights' },

      'premium:access-granted': { category: 'premium', notificationType: 'newPremiumContent' },
      'premium:content-unlocked': { category: 'premium', notificationType: 'newPremiumContent' },

      'system:welcome': { category: 'system', notificationType: 'announcements' },
      'system:security-alert': { category: 'system', notificationType: 'securityAlerts' },
      'system:announcement': { category: 'system', notificationType: 'announcements' },

      'insight_request:submitted': { category: 'system', notificationType: 'announcements' }, // Admins get system announcements
      'insight_request:approved': { category: 'content', notificationType: 'newInsights' },
      'insight_request:rejected': { category: 'content', notificationType: 'newInsights' }
    };

    return mapping[eventType] || {};
  }

  /**
   * Determine which channels to use for this notification
   */
  determineChannels(preferences, category, notificationType, requestedChannels, priority) {
    const enabledChannels = [];

    for (const channel of requestedChannels) {
      // Check if channel is globally enabled
      const globalKey = `${channel}Enabled`;
      if (preferences.globalSettings[globalKey] === false) continue;

      // Check if user is in quiet hours (except for critical notifications)
      if (preferences.isInQuietHours(priority === NOTIFICATION_PRIORITIES.CRITICAL)) {
        if (priority !== NOTIFICATION_PRIORITIES.CRITICAL) continue;
      }

      // Check if daily limit reached
      if (preferences.hasReachedDailyLimit(channel)) {
        console.log(`[NotificationService] Daily limit reached for ${channel}`);
        continue;
      }

      // Check if this specific notification type is enabled for this channel
      if (preferences.isEnabled(category, notificationType, channel)) {
        enabledChannels.push(channel);
      }
    }

    return enabledChannels;
  }

  /**
   * Generate notification content based on type and data
   */
  generateNotificationContent(type, data, user) {
    // This would typically use templates
    // For now, simple string generation

    const templates = {
      'subscription:granted': {
        title: 'Premium Access Granted! 🎉',
        body: `Congratulations ${user.name}! You now have ${data.isLifetime ? 'lifetime' : `${data.daysUntilExpiry}-day`} premium access.`,
        actionUrl: data.ctaUrl || '/insights/premium',
        actionText: 'Explore Premium Content'
      },
      'subscription:expiring-soon': {
        title: 'Subscription Expiring Soon ⏰',
        body: `Your premium subscription expires in ${data.daysRemaining} day${data.daysRemaining !== 1 ? 's' : ''}. Renew now to keep your access!`,
        actionUrl: data.renewUrl || '/subscriptions/renew',
        actionText: 'Renew Now'
      },
      'subscription:expired': {
        title: 'Subscription Expired',
        body: 'Your premium subscription has expired. Renew now to regain access to premium insights.',
        actionUrl: data.renewUrl || '/subscriptions/renew',
        actionText: 'Renew Subscription'
      },
      'insight:published': {
        title: `New Insight: ${data.title}`,
        body: data.excerpt || 'A new insight has been published.',
        actionUrl: data.url,
        actionText: 'Read Now',
        imageUrl: data.coverImage
      },
      'insight:premium-published': {
        title: `🌟 New Premium Insight: ${data.title}`,
        body: data.excerpt || 'Exclusive premium content now available.',
        actionUrl: data.url,
        actionText: 'Read Now',
        imageUrl: data.coverImage
      },
      'insight_request:submitted': {
        title: 'New Insight Request 📝',
        body: `A new insight request has been submitted by ${data.userName}: ${data.title}`,
        actionUrl: data.adminUrl,
        actionText: 'Review Request'
      },
      'insight_request:approved': {
        title: 'Insight Request Approved! 🎉',
        body: `Congratulations! Your insight request "${data.title}" has been approved.`,
        actionUrl: data.ctaUrl,
        actionText: 'View Content'
      },
      'insight_request:rejected': {
        title: 'Insight Request Update',
        body: `Your insight request "${data.title}" was not approved. Reason: ${data.reason}`,
        actionUrl: '/',
        actionText: 'Close'
      }
    };

    const template = templates[type] || {
      title: 'Notification',
      body: JSON.stringify(data),
      actionUrl: '/',
      actionText: 'View'
    };

    return {
      title: template.title,
      body: template.body,
      richContent: {
        imageUrl: template.imageUrl,
        actionUrl: template.actionUrl,
        actionText: template.actionText,
        ctaButtons: template.ctaButtons || [
          {
            text: template.actionText,
            url: template.actionUrl,
            style: 'primary'
          }
        ]
      }
    };
  }

  /**
   * Create notification record in database
   */
  async createNotificationRecord(options) {
    const { recipient, type, priority, content, channels, metadata } = options;

    const channelsObj = {};
    for (const channel of Object.values(NOTIFICATION_CHANNELS)) {
      channelsObj[channel] = {
        enabled: channels.includes(channel),
        status: channel === 'in-app' ? 'unread' : 'pending'
      };
    }

    const notification = await Notification.create({
      recipient,
      type,
      priority,
      title: content.title,
      body: content.body,
      richContent: content.richContent,
      channels: channelsObj,
      overallStatus: 'pending',
      metadata,
      retryable: priority !== NOTIFICATION_PRIORITIES.LOW
    });

    return notification;
  }

  /**
   * Dispatch notification to all enabled channels
   * REFACTORED: Now creates background jobs instead of sending directly
   */
  async dispatchToChannels(notification, user, preferences) {
    const Job = require('../models/Job');
    const { JOB_TYPES } = Job;

    const jobs = [];

    // Create email job (background)
    if (notification.channels.email.enabled) {
      jobs.push({
        type: JOB_TYPES.EMAIL,
        payload: {
          notificationId: notification._id,
          userId: user._id
        },
        priority: this.getJobPriority(notification.priority),
        maxAttempts: 3
      });
    }

    // Create push job (background)
    if (notification.channels.push.enabled) {
      jobs.push({
        type: JOB_TYPES.PUSH,
        payload: {
          notificationId: notification._id,
          userId: user._id
        },
        priority: this.getJobPriority(notification.priority),
        maxAttempts: 3
      });
    }

    // Create SMS job (background)
    if (notification.channels.sms.enabled) {
      jobs.push({
        type: JOB_TYPES.SMS,
        payload: {
          notificationId: notification._id,
          userId: user._id
        },
        priority: this.getJobPriority(notification.priority),
        maxAttempts: 2 // SMS is expensive, fewer retries
      });
    }

    // In-app is already created, no need to "send"
    if (notification.channels.inApp.enabled) {
      await notification.updateChannelStatus('inApp', 'unread');
    }

    // Create all jobs asynchronously (non-blocking)
    if (jobs.length > 0) {
      await Job.createBulkJobs(jobs);
      console.log(
        `[NotificationService] Created ${jobs.length} background jobs for notification: ${notification._id}`
      );
    }

    // Update overall status
    notification.updateOverallStatus();
    await notification.save();
  }

  /**
   * Map notification priority to job priority
   */
  getJobPriority(notificationPriority) {
    const mapping = {
      critical: 10,
      high: 7,
      medium: 5,
      low: 2
    };
    return mapping[notificationPriority] || 5;
  }

  /**
   * REMOVED: Direct sending methods (sendEmail, sendPush, sendSMS)
   * Now handled by background job workers (see jobHandlers.js)
   * This keeps the notification service non-blocking
   */

  /**
   * REMOVED: Retry and scheduled workers
   * Now handled by job queue system
   * Retries happen automatically via Job.markFailed() exponential backoff
   */

  /**
   * Mark expired notifications (keep this - simple maintenance task)
   */
  async markExpiredNotifications() {
    try {
      const result = await Notification.markExpired();
      if (result.modifiedCount > 0) {
        console.log(`[NotificationService] Marked ${result.modifiedCount} notifications as expired`);
      }
    } catch (error) {
      console.error('[NotificationService] Expiration worker error:', error);
    }
  }

  /**
   * Start expiration worker (runs every hour)
   * This is a simple maintenance task, no need for job queue
   */
  startExpirationWorker() {
    setInterval(() => {
      this.markExpiredNotifications();
    }, 60 * 60 * 1000); // 1 hour
  }
}

// Export singleton instance
const notificationService = new NotificationService();

module.exports = notificationService;
