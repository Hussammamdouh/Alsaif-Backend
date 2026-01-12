/**
 * Notification Helper
 *
 * Simplified interface for creating notifications from controllers
 * Integrates with the existing notification service and event system
 */

const Notification = require('../models/Notification');
const { notificationEvents, NOTIFICATION_PRIORITIES } = require('../events/enhancedNotificationEvents');

/**
 * Create a notification for a user
 *
 * @param {Object} options - Notification options
 * @param {String} options.userId - Recipient user ID
 * @param {String} options.type - Notification type (e.g., 'comment_on_insight', 'reply_to_comment')
 * @param {String} options.title - Notification title
 * @param {String} options.message - Notification message/body
 * @param {Object} options.data - Additional data (insightId, commentId, etc.)
 * @param {String} options.priority - Priority level ('low', 'medium', 'high', 'urgent')
 * @param {Array<String>} options.channels - Channels to use (['in_app', 'email', 'push'])
 * @returns {Promise<Object>} Created notification
 */
async function createNotification({
  userId,
  type,
  title,
  message,
  data = {},
  priority = NOTIFICATION_PRIORITIES.MEDIUM,
  channels = ['in_app'] // Default to in-app only
}) {
  try {
    // Validate required fields
    if (!userId) {
      throw new Error('userId is required for creating notification');
    }
    if (!type) {
      throw new Error('type is required for creating notification');
    }
    if (!title) {
      throw new Error('title is required for creating notification');
    }
    if (!message) {
      throw new Error('message is required for creating notification');
    }

    // Determine which channels to enable
    const channelConfig = {
      email: {
        enabled: channels.includes('email'),
        status: 'pending'
      },
      push: {
        enabled: channels.includes('push'),
        status: 'pending'
      },
      sms: {
        enabled: channels.includes('sms'),
        status: 'pending'
      },
      inApp: {
        enabled: channels.includes('in_app'),
        status: 'pending',
        read: false
      }
    };

    // Create notification record
    const notification = await Notification.create({
      recipient: userId,
      type,
      priority,
      title,
      body: message,
      channels: channelConfig,
      richContent: {
        metadata: data
      },
      scheduledFor: new Date(), // Send immediately
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Expire in 30 days
    });

    // Emit notification event for processing by notification service
    // This will handle actual delivery through configured channels
    notificationEvents.emit('notification', {
      event: type,
      data: {
        userId,
        notificationId: notification._id,
        ...data
      },
      priority,
      channels,
      metadata: {
        title,
        body: message,
        createdAt: new Date()
      }
    });

    console.log(`[NotificationHelper] Created ${type} notification for user ${userId}`);

    return {
      success: true,
      notification
    };
  } catch (error) {
    console.error('[NotificationHelper] Error creating notification:', error);

    // Don't throw error - notification failure shouldn't break the main flow
    // Just log and return failure
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create a comment notification
 * Convenience method for comment-related notifications
 */
async function createCommentNotification({
  recipientId,
  type,
  insightId,
  commentId,
  commentAuthorName,
  insightTitle
}) {
  let title, message;

  switch (type) {
    case 'comment_on_insight':
      title = 'New comment on your insight';
      message = `${commentAuthorName} commented on "${insightTitle}"`;
      break;
    case 'reply_to_comment':
      title = 'New reply to your comment';
      message = `${commentAuthorName} replied to your comment on "${insightTitle}"`;
      break;
    case 'comment_liked':
      title = 'Someone liked your comment';
      message = `${commentAuthorName} liked your comment on "${insightTitle}"`;
      break;
    default:
      title = 'New activity';
      message = 'You have new activity on your content';
  }

  return createNotification({
    userId: recipientId,
    type,
    title,
    message,
    data: {
      insightId,
      commentId,
      actionUrl: `/insights/${insightId}#comment-${commentId}`
    },
    priority: NOTIFICATION_PRIORITIES.MEDIUM,
    channels: ['in_app', 'email'] // Send via in-app and email
  });
}

/**
 * Batch create notifications for multiple users
 * Useful for broadcast notifications
 */
async function createBulkNotifications(notifications) {
  const results = await Promise.allSettled(
    notifications.map(notification => createNotification(notification))
  );

  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.length - successful;

  console.log(`[NotificationHelper] Bulk notifications: ${successful} successful, ${failed} failed`);

  return {
    total: results.length,
    successful,
    failed,
    results
  };
}

module.exports = {
  createNotification,
  createCommentNotification,
  createBulkNotifications
};
