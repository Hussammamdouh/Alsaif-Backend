const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const logger = require('../utils/logger');
const { SUBSCRIPTION_STATUS } = require('../constants');

/**
 * Job Handlers - Business Logic for Background Jobs
 *
 * Each handler receives:
 * - payload: Job-specific data
 * - job: Full job document (for metadata, attempts, etc.)
 *
 * Handlers must:
 * - Be idempotent (safe to retry)
 * - Throw errors for retryable failures
 * - Log appropriately
 * - Not modify the job document directly
 */

// ==================== EMAIL HANDLER ====================

/**
 * Send email notification
 *
 * Payload:
 * - notificationId: ID of notification to send
 * - userId: Recipient user ID
 */
async function handleEmailJob(payload, job) {
  const { notificationId, userId } = payload;

  logger.info(`[EmailHandler] Processing email job for notification: ${notificationId}`);

  // Fetch notification
  const notification = await Notification.findById(notificationId);
  if (!notification) {
    logger.warn(`[EmailHandler] Notification not found: ${notificationId}`);
    return; // Not retryable, notification was deleted
  }

  // Fetch user
  const user = await User.findById(userId);
  if (!user || !user.email) {
    logger.warn(`[EmailHandler] User or email not found: ${userId}`);
    await notification.updateChannelStatus('email', 'failed', {
      errorMessage: 'User or email not found',
      failedAt: new Date()
    });
    return; // Not retryable
  }

  try {
    // TODO: Integrate with actual email service (SendGrid, AWS SES, etc.)
    // For now, simulate email sending
    logger.info(`[EmailHandler] Simulating email send to: ${user.email}`);
    logger.info(`[EmailHandler] Subject: ${notification.title}`);
    logger.info(`[EmailHandler] Body: ${notification.body.substring(0, 100)}...`);

    // Simulate success (in production, this would be actual API call)
    await notification.updateChannelStatus('email', 'sent', {
      sentAt: new Date(),
      emailId: `mock-${Date.now()}`
    });

    logger.info(`[EmailHandler] Email sent successfully for notification: ${notificationId}`);
  } catch (error) {
    // Update notification status
    await notification.updateChannelStatus('email', 'failed', {
      errorMessage: error.message,
      failedAt: new Date()
    });

    // Rethrow for job retry logic
    throw error;
  }
}

// ==================== PUSH NOTIFICATION HANDLER ====================

/**
 * Send push notification
 *
 * Payload:
 * - notificationId: ID of notification to send
 * - userId: Recipient user ID
 */
async function handlePushJob(payload, job) {
  const { notificationId, userId } = payload;

  logger.info(`[PushHandler] Processing push job for notification: ${notificationId}`);

  // Fetch notification
  const notification = await Notification.findById(notificationId);
  if (!notification) {
    logger.warn(`[PushHandler] Notification not found: ${notificationId}`);
    return; // Not retryable
  }

  try {
    // Use Web Push API service
    const pushNotificationService = require('../services/pushNotificationService');

    // Prepare payload from notification
    const pushPayload = {
      title: notification.title,
      body: notification.body,
      icon: notification.richContent?.imageUrl || '/icon-192x192.png',
      badge: '/badge-72x72.png',
      data: {
        url: notification.richContent?.actionUrl || '/',
        id: notification._id.toString(),
        type: notification.type,
        timestamp: new Date().toISOString()
      }
    };

    // Add actions if available
    if (notification.richContent?.ctaButtons && notification.richContent.ctaButtons.length > 0) {
      pushPayload.actions = notification.richContent.ctaButtons.map((btn, idx) => ({
        action: `action-${idx}`,
        title: btn.text,
        icon: btn.icon
      }));
    }

    // Send push notification
    const result = await pushNotificationService.sendToUser(userId, pushPayload);

    // Mobile Push Integration
    const mobilePushService = require('../services/mobilePushService');
    const mobileResults = await mobilePushService.sendToUser(userId, pushPayload);

    if (result.sent > 0 || mobileResults.sent > 0) {
      await notification.updateChannelStatus('push', 'sent', {
        sentAt: new Date(),
        pushId: `push-${Date.now()}`,
        sentCount: (result.sent || 0) + (mobileResults.sent || 0),
        failedCount: (result.failed || 0) + (mobileResults.failed || 0)
      });

      logger.info(
        `[PushHandler] Push sent successfully for notification: ${notificationId} (Web: ${result.sent}, Mobile: ${mobileResults.sent})`
      );
    } else if (result.failed > 0 || mobileResults.failed > 0) {
      // All sends failed
      await notification.updateChannelStatus('push', 'failed', {
        errorMessage: 'All push sends failed (Web and Mobile)',
        failedAt: new Date(),
        failedCount: (result.failed || 0) + (mobileResults.failed || 0)
      });

      throw new Error(`All push sends failed (Web: ${result.failed}, Mobile: ${mobileResults.failed})`);
    } else {
      // No active subscriptions
      logger.info(`[PushHandler] No active push subscriptions (Web or Mobile) for user: ${userId}`);
      await notification.updateChannelStatus('push', 'sent', {
        sentAt: new Date(),
        pushId: 'no-subscriptions'
      });
    }
  } catch (error) {
    await notification.updateChannelStatus('push', 'failed', {
      errorMessage: error.message,
      failedAt: new Date()
    });

    throw error;
  }
}

// ==================== SMS HANDLER ====================

/**
 * Send SMS notification
 *
 * Payload:
 * - notificationId: ID of notification to send
 * - userId: Recipient user ID
 */
async function handleSMSJob(payload, job) {
  const { notificationId, userId } = payload;

  logger.info(`[SMSHandler] Processing SMS job for notification: ${notificationId}`);

  // Fetch notification
  const notification = await Notification.findById(notificationId);
  if (!notification) {
    logger.warn(`[SMSHandler] Notification not found: ${notificationId}`);
    return;
  }

  // Fetch user preferences (for phone number)
  const preferences = await NotificationPreference.findOne({ user: userId });
  if (!preferences || !preferences.globalSettings.phoneNumber) {
    logger.warn(`[SMSHandler] Phone number not found for user: ${userId}`);
    await notification.updateChannelStatus('sms', 'failed', {
      errorMessage: 'Phone number not found',
      failedAt: new Date()
    });
    return;
  }

  if (!preferences.globalSettings.phoneVerified) {
    logger.warn(`[SMSHandler] Phone number not verified for user: ${userId}`);
    await notification.updateChannelStatus('sms', 'failed', {
      errorMessage: 'Phone number not verified',
      failedAt: new Date()
    });
    return;
  }

  try {
    // TODO: Integrate with Twilio or AWS SNS
    // For now, simulate SMS sending
    logger.info(`[SMSHandler] Simulating SMS to: ${preferences.globalSettings.phoneNumber}`);
    logger.info(`[SMSHandler] Message: ${notification.body.substring(0, 160)}`);

    // Simulate success
    await notification.updateChannelStatus('sms', 'sent', {
      sentAt: new Date(),
      smsId: `mock-${Date.now()}`
    });

    logger.info(`[SMSHandler] SMS sent successfully for notification: ${notificationId}`);
  } catch (error) {
    await notification.updateChannelStatus('sms', 'failed', {
      errorMessage: error.message,
      failedAt: new Date()
    });

    throw error;
  }
}

// ==================== SUBSCRIPTION EXPIRY HANDLER ====================

/**
 * Check and process expired subscriptions
 *
 * Payload:
 * - batchSize: Number of subscriptions to process (default: 100)
 */
async function handleSubscriptionExpiryCheck(payload, job) {
  const { batchSize = 100 } = payload;

  logger.info(`[SubscriptionExpiryHandler] Starting expiry check (batch size: ${batchSize})`);

  // Find expired subscriptions that haven't been processed
  const expiredSubscriptions = await Subscription.find({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    tier: 'premium',
    endDate: { $lte: new Date(), $ne: null }
  })
    .limit(batchSize)
    .populate('user', 'name email');

  logger.info(
    `[SubscriptionExpiryHandler] Found ${expiredSubscriptions.length} expired subscriptions`
  );

  const results = {
    processed: 0,
    failed: 0,
    errors: []
  };

  for (const subscription of expiredSubscriptions) {
    try {
      // Call the expire method
      await subscription.expire();

      logger.info(
        `[SubscriptionExpiryHandler] Expired subscription: ${subscription._id} for user: ${subscription.user?._id}`
      );
      results.processed++;
    } catch (error) {
      logger.error(
        `[SubscriptionExpiryHandler] Failed to expire subscription: ${subscription._id}`,
        error
      );
      results.failed++;
      results.errors.push({
        subscriptionId: subscription._id,
        error: error.message
      });
    }
  }

  logger.info(
    `[SubscriptionExpiryHandler] Completed: ${results.processed} processed, ${results.failed} failed`
  );

  // If all failed, throw error for retry
  if (results.processed === 0 && results.failed > 0) {
    throw new Error(`All ${results.failed} subscription expirations failed`);
  }

  return results;
}

// ==================== CLEANUP NOTIFICATIONS HANDLER ====================

/**
 * Cleanup old notifications
 *
 * Payload:
 * - retentionDays: Number of days to keep notifications (default: 90)
 */
async function handleCleanupNotifications(payload, job) {
  const { retentionDays = 90 } = payload;

  logger.info(`[CleanupNotificationsHandler] Starting cleanup (retention: ${retentionDays} days)`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  // Delete old read/dismissed notifications
  const result = await Notification.deleteMany({
    createdAt: { $lte: cutoffDate },
    'channels.inApp.status': { $in: ['read', 'dismissed'] }
  });

  logger.info(`[CleanupNotificationsHandler] Deleted ${result.deletedCount} old notifications`);

  return { deletedCount: result.deletedCount };
}

// ==================== CLEANUP AUDIT LOGS HANDLER ====================

/**
 * Cleanup old audit logs
 *
 * Payload:
 * - retentionDays: Number of days to keep logs (default: 365)
 */
async function handleCleanupAuditLogs(payload, job) {
  const { retentionDays = 365 } = payload;

  logger.info(`[CleanupAuditLogsHandler] Starting cleanup (retention: ${retentionDays} days)`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const AuditLog = require('../models/AuditLog');

  // Keep critical logs forever, delete info-level logs
  const result = await AuditLog.deleteMany({
    timestamp: { $lte: cutoffDate },
    'metadata.severity': { $nin: ['critical', 'high'] }
  });

  logger.info(`[CleanupAuditLogsHandler] Deleted ${result.deletedCount} old audit logs`);

  return { deletedCount: result.deletedCount };
}

// ==================== CONTENT DIGEST HANDLER ====================

/**
 * Generate and send content digest
 *
 * Payload:
 * - period: 'daily' | 'weekly' | 'monthly'
 * - userId: (optional) specific user, or all users if not provided
 */
async function handleContentDigest(payload, job) {
  const { period = 'weekly', userId } = payload;

  logger.info(`[ContentDigestHandler] Generating ${period} digest`);

  const NotificationPreference = require('../models/NotificationPreference');
  const Insight = require('../models/Insight');
  const Job = require('../models/Job');

  // Find users who want this digest
  const query = {
    'content.personalizedDigest.enabled': true,
    'content.personalizedDigest.frequency': period,
    'globalSettings.emailEnabled': true
  };

  if (userId) {
    query.user = userId;
  }

  const preferences = await NotificationPreference.find(query).populate('user', 'name email');

  logger.info(`[ContentDigestHandler] Found ${preferences.length} users for ${period} digest`);

  // Calculate date range based on period
  const endDate = new Date();
  const startDate = new Date();
  if (period === 'daily') {
    startDate.setDate(startDate.getDate() - 1);
  } else if (period === 'weekly') {
    startDate.setDate(startDate.getDate() - 7);
  } else if (period === 'monthly') {
    startDate.setMonth(startDate.getMonth() - 1);
  }

  // Get insights from period
  const insights = await Insight.find({
    status: 'published',
    isDeleted: false,
    createdAt: { $gte: startDate, $lte: endDate }
  })
    .sort('-viewCount -likes')
    .limit(10)
    .select('title excerpt type category coverImage');

  if (insights.length === 0) {
    logger.info(`[ContentDigestHandler] No insights in period, skipping digest`);
    return { sent: 0 };
  }

  // Create email jobs for each user
  let jobsCreated = 0;
  for (const pref of preferences) {
    if (!pref.user) continue;

    try {
      // Create notification for digest
      const notification = await Notification.create({
        recipient: pref.user._id,
        type: `content:${period}-digest`,
        priority: 'low',
        title: `Your ${period.charAt(0).toUpperCase() + period.slice(1)} Content Digest`,
        body: `Here are the top ${insights.length} insights from the past ${period}`,
        richContent: {
          insights: insights.map((i) => ({
            id: i._id,
            title: i.title,
            excerpt: i.excerpt,
            type: i.type,
            category: i.category
          }))
        },
        channels: {
          email: { enabled: true, status: 'pending' },
          inApp: { enabled: true, status: 'unread' }
        },
        overallStatus: 'pending'
      });

      // Create email job
      await Job.createJob({
        type: 'email',
        payload: {
          notificationId: notification._id,
          userId: pref.user._id
        },
        priority: 3, // Lower priority for digest
        maxAttempts: 2
      });

      jobsCreated++;
    } catch (error) {
      logger.error(
        `[ContentDigestHandler] Failed to create digest for user ${pref.user._id}:`,
        error
      );
    }
  }

  logger.info(`[ContentDigestHandler] Created ${jobsCreated} digest jobs`);

  return { sent: jobsCreated };
}

/**
 * Process and publish scheduled insights
 */
async function handlePublishInsights(payload, job) {
  logger.info('[PublishInsightsHandler] Checking for scheduled insights to publish');

  const Insight = require('../models/Insight');
  const { emitInsightPublished } = require('../events/enhancedNotificationEvents');

  const now = new Date();

  // Find insights that are scheduled and the time has come
  const scheduledInsights = await Insight.find({
    status: 'scheduled',
    isDeleted: false,
    scheduledFor: { $lte: now }
  });

  logger.info(`[PublishInsightsHandler] Found ${scheduledInsights.length} insights to publish`);

  const results = {
    published: 0,
    failed: 0,
    errors: []
  };

  for (const insight of scheduledInsights) {
    try {
      insight.status = 'published';
      insight.publishedAt = now;
      await insight.save();

      // Emit publication event
      emitInsightPublished({
        insight,
        authorId: insight.author,
        type: insight.type
      });

      logger.info(`[PublishInsightsHandler] Published insight: ${insight._id} (${insight.title})`);
      results.published++;
    } catch (error) {
      logger.error(`[PublishInsightsHandler] Failed to publish insight: ${insight._id}`, error);
      results.failed++;
      results.errors.push({
        insightId: insight._id,
        error: error.message
      });
    }
  }

  return results;
}

// ==================== EXPORTS ====================

module.exports = {
  handleEmailJob,
  handlePushJob,
  handleSMSJob,
  handleSubscriptionExpiryCheck,
  handleCleanupNotifications,
  handleCleanupAuditLogs,
  handleContentDigest,
  handlePublishInsights
};
