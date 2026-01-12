/**
 * Push Notification Service
 *
 * Web Push API implementation without third-party services
 * Uses VAPID for authentication
 */

const webpush = require('web-push');
const logger = require('../utils/logger');
const PushSubscription = require('../models/PushSubscription');

class PushNotificationService {
  constructor() {
    this.vapidKeys = null;
    this.initialized = false;
  }

  /**
   * Initialize Web Push with VAPID keys
   */
  async initialize() {
    try {
      // Get VAPID keys from environment or generate new ones
      const publicKey = process.env.VAPID_PUBLIC_KEY;
      const privateKey = process.env.VAPID_PRIVATE_KEY;
      const email = process.env.VAPID_EMAIL || process.env.SMTP_FROM_EMAIL || 'noreply@elsaif.com';

      if (!publicKey || !privateKey) {
        logger.warn('[PushNotification] VAPID keys not found in environment. Generating new keys...');
        const keys = webpush.generateVAPIDKeys();
        logger.info('[PushNotification] Generated VAPID keys:');
        logger.info(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
        logger.info(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
        logger.warn('[PushNotification] Add these keys to your .env file for production!');

        this.vapidKeys = keys;
      } else {
        this.vapidKeys = { publicKey, privateKey };
      }

      // Set VAPID details for web-push
      webpush.setVapidDetails(
        `mailto:${email}`,
        this.vapidKeys.publicKey,
        this.vapidKeys.privateKey
      );

      this.initialized = true;
      logger.info('[PushNotification] Service initialized successfully');
    } catch (error) {
      logger.error('[PushNotification] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Get VAPID public key (for client-side subscription)
   */
  getPublicKey() {
    if (!this.initialized) {
      throw new Error('Push notification service not initialized');
    }
    return this.vapidKeys.publicKey;
  }

  /**
   * Subscribe user to push notifications
   */
  async subscribe(userId, subscription) {
    try {
      // Check if subscription already exists
      const existing = await PushSubscription.findOne({
        userId,
        'subscription.endpoint': subscription.endpoint
      });

      if (existing) {
        // Update existing subscription
        existing.subscription = subscription;
        existing.updatedAt = new Date();
        await existing.save();
        logger.info('[PushNotification] Updated subscription', { userId });
        return existing;
      }

      // Create new subscription
      const newSubscription = await PushSubscription.create({
        userId,
        subscription,
        isActive: true
      });

      logger.info('[PushNotification] Created subscription', { userId });
      return newSubscription;
    } catch (error) {
      logger.error('[PushNotification] Failed to subscribe:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe user from push notifications
   */
  async unsubscribe(userId, endpoint) {
    try {
      const result = await PushSubscription.findOneAndUpdate(
        { userId, 'subscription.endpoint': endpoint },
        { isActive: false, updatedAt: new Date() },
        { new: true }
      );

      if (result) {
        logger.info('[PushNotification] Unsubscribed', { userId });
      }

      return result;
    } catch (error) {
      logger.error('[PushNotification] Failed to unsubscribe:', error);
      throw error;
    }
  }

  /**
   * Send push notification to specific user
   */
  async sendToUser(userId, payload) {
    try {
      // Get all active subscriptions for user
      const subscriptions = await PushSubscription.find({
        userId,
        isActive: true
      });

      if (subscriptions.length === 0) {
        logger.warn('[PushNotification] No active subscriptions for user', { userId });
        return { sent: 0, failed: 0 };
      }

      const results = await this.sendToSubscriptions(subscriptions, payload);

      logger.info('[PushNotification] Sent to user', {
        userId,
        sent: results.sent,
        failed: results.failed
      });

      return results;
    } catch (error) {
      logger.error('[PushNotification] Failed to send to user:', error);
      throw error;
    }
  }

  /**
   * Send push notification to multiple subscriptions
   */
  async sendToSubscriptions(subscriptions, payload) {
    const results = { sent: 0, failed: 0, errors: [] };

    const payloadString = JSON.stringify(payload);

    const promises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub.subscription, payloadString);

        // Update success metrics
        sub.successCount = (sub.successCount || 0) + 1;
        sub.lastSuccess = new Date();
        await sub.save();

        results.sent++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          endpoint: sub.subscription.endpoint,
          error: error.message
        });

        // Update failure metrics
        sub.failureCount = (sub.failureCount || 0) + 1;
        sub.lastFailure = new Date();

        // Deactivate subscription if it's expired or invalid
        if (error.statusCode === 410 || error.statusCode === 404) {
          sub.isActive = false;
          logger.warn('[PushNotification] Deactivated expired subscription', {
            userId: sub.userId,
            statusCode: error.statusCode
          });
        }

        await sub.save();

        logger.error('[PushNotification] Failed to send notification:', {
          endpoint: sub.subscription.endpoint.substring(0, 50),
          error: error.message
        });
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Send push notification to multiple users
   */
  async sendToUsers(userIds, payload) {
    try {
      const subscriptions = await PushSubscription.find({
        userId: { $in: userIds },
        isActive: true
      });

      if (subscriptions.length === 0) {
        logger.warn('[PushNotification] No active subscriptions for users', { count: userIds.length });
        return { sent: 0, failed: 0 };
      }

      const results = await this.sendToSubscriptions(subscriptions, payload);

      logger.info('[PushNotification] Sent to multiple users', {
        userCount: userIds.length,
        sent: results.sent,
        failed: results.failed
      });

      return results;
    } catch (error) {
      logger.error('[PushNotification] Failed to send to users:', error);
      throw error;
    }
  }

  /**
   * Send notification with deep link
   */
  async sendWithDeepLink(userId, notification) {
    const payload = {
      title: notification.title,
      body: notification.body,
      icon: notification.icon || '/icon-192x192.png',
      badge: notification.badge || '/badge-72x72.png',
      data: {
        url: notification.url || '/',
        id: notification.id,
        type: notification.type,
        timestamp: new Date().toISOString()
      },
      actions: notification.actions || []
    };

    return this.sendToUser(userId, payload);
  }

  /**
   * Schedule push notification
   */
  async scheduleNotification(userId, payload, sendAt) {
    try {
      const delay = new Date(sendAt).getTime() - Date.now();

      if (delay <= 0) {
        // Send immediately if scheduled time is in the past
        return this.sendToUser(userId, payload);
      }

      // Schedule using setTimeout (for short delays)
      // For production, use a job queue for reliability
      setTimeout(async () => {
        try {
          await this.sendToUser(userId, payload);
          logger.info('[PushNotification] Scheduled notification sent', { userId });
        } catch (error) {
          logger.error('[PushNotification] Failed to send scheduled notification:', error);
        }
      }, delay);

      logger.info('[PushNotification] Notification scheduled', {
        userId,
        sendAt,
        delay
      });

      return { scheduled: true, sendAt, delay };
    } catch (error) {
      logger.error('[PushNotification] Failed to schedule notification:', error);
      throw error;
    }
  }

  /**
   * Get user subscriptions
   */
  async getUserSubscriptions(userId) {
    return PushSubscription.find({ userId, isActive: true });
  }

  /**
   * Get subscription statistics
   */
  async getStatistics() {
    try {
      const [total, active, inactive] = await Promise.all([
        PushSubscription.countDocuments(),
        PushSubscription.countDocuments({ isActive: true }),
        PushSubscription.countDocuments({ isActive: false })
      ]);

      const topUsers = await PushSubscription.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);

      return {
        total,
        active,
        inactive,
        topUsers
      };
    } catch (error) {
      logger.error('[PushNotification] Failed to get statistics:', error);
      throw error;
    }
  }

  /**
   * Clean up inactive subscriptions
   */
  async cleanup(daysInactive = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

      const result = await PushSubscription.deleteMany({
        isActive: false,
        updatedAt: { $lt: cutoffDate }
      });

      logger.info('[PushNotification] Cleaned up inactive subscriptions', {
        deleted: result.deletedCount
      });

      return result.deletedCount;
    } catch (error) {
      logger.error('[PushNotification] Failed to cleanup:', error);
      throw error;
    }
  }
}

module.exports = new PushNotificationService();
