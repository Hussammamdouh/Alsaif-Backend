/**
 * Push Notification Controller
 *
 * Handles Web Push API subscription and notification endpoints
 */

const pushNotificationService = require('../services/pushNotificationService');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');

/**
 * Get VAPID public key for client-side subscription
 */
exports.getPublicKey = async (req, res) => {
  try {
    const publicKey = pushNotificationService.getPublicKey();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { publicKey }
    });
  } catch (error) {
    logger.error('[PushController] Failed to get public key:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to get public key'
    });
  }
};

/**
 * Subscribe to push notifications
 */
exports.subscribe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subscription, deviceInfo } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Invalid subscription data'
      });
    }

    // Add device info if provided
    const subscriptionData = {
      ...subscription,
      deviceInfo: deviceInfo || {
        userAgent: req.headers['user-agent'],
        platform: req.headers['sec-ch-ua-platform'],
        browser: req.headers['sec-ch-ua']
      }
    };

    const result = await pushNotificationService.subscribe(userId, subscription);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Subscribed to push notifications',
      data: {
        id: result._id,
        createdAt: result.createdAt
      }
    });
  } catch (error) {
    logger.error('[PushController] Failed to subscribe:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to subscribe to push notifications'
    });
  }
};

/**
 * Unsubscribe from push notifications
 */
exports.unsubscribe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Endpoint is required'
      });
    }

    await pushNotificationService.unsubscribe(userId, endpoint);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Unsubscribed from push notifications'
    });
  } catch (error) {
    logger.error('[PushController] Failed to unsubscribe:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to unsubscribe'
    });
  }
};

/**
 * Get user's subscriptions
 */
exports.getSubscriptions = async (req, res) => {
  try {
    const userId = req.user.id;

    const subscriptions = await pushNotificationService.getUserSubscriptions(userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: subscriptions.map(sub => ({
        id: sub._id,
        endpoint: sub.subscription.endpoint.substring(0, 50) + '...',
        isActive: sub.isActive,
        deviceInfo: sub.deviceInfo,
        successCount: sub.successCount,
        failureCount: sub.failureCount,
        lastSuccess: sub.lastSuccess,
        createdAt: sub.createdAt
      }))
    });
  } catch (error) {
    logger.error('[PushController] Failed to get subscriptions:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to get subscriptions'
    });
  }
};

/**
 * Send test notification (user can test their own subscription)
 */
exports.sendTestNotification = async (req, res) => {
  try {
    const userId = req.user.id;

    const payload = {
      title: 'Test Notification',
      body: 'This is a test notification from ElSaif Stock Insights',
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      data: {
        url: '/',
        type: 'test',
        timestamp: new Date().toISOString()
      }
    };

    const result = await pushNotificationService.sendToUser(userId, payload);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Test notification sent',
      data: result
    });
  } catch (error) {
    logger.error('[PushController] Failed to send test notification:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to send test notification'
    });
  }
};

/**
 * Admin: Send notification to specific user
 */
exports.sendToUser = async (req, res) => {
  try {
    const { userId, title, body, url, icon, badge } = req.body;

    if (!userId || !title || !body) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'userId, title, and body are required'
      });
    }

    const payload = {
      title,
      body,
      icon: icon || '/icon-192x192.png',
      badge: badge || '/badge-72x72.png',
      data: {
        url: url || '/',
        type: 'admin',
        timestamp: new Date().toISOString()
      }
    };

    const result = await pushNotificationService.sendToUser(userId, payload);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Notification sent',
      data: result
    });
  } catch (error) {
    logger.error('[PushController] Failed to send notification:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to send notification'
    });
  }
};

/**
 * Admin: Send notification to multiple users
 */
exports.sendToUsers = async (req, res) => {
  try {
    const { userIds, title, body, url, icon, badge } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'userIds array is required'
      });
    }

    if (!title || !body) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'title and body are required'
      });
    }

    const payload = {
      title,
      body,
      icon: icon || '/icon-192x192.png',
      badge: badge || '/badge-72x72.png',
      data: {
        url: url || '/',
        type: 'admin',
        timestamp: new Date().toISOString()
      }
    };

    const result = await pushNotificationService.sendToUsers(userIds, payload);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Notification sent to ${userIds.length} users`,
      data: result
    });
  } catch (error) {
    logger.error('[PushController] Failed to send notifications:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to send notifications'
    });
  }
};

/**
 * Admin: Get push notification statistics
 */
exports.getStatistics = async (req, res) => {
  try {
    const stats = await pushNotificationService.getStatistics();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('[PushController] Failed to get statistics:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to get statistics'
    });
  }
};

/**
 * Admin: Clean up inactive subscriptions
 */
exports.cleanup = async (req, res) => {
  try {
    const { daysInactive } = req.query;
    const days = parseInt(daysInactive) || 90;

    const deletedCount = await pushNotificationService.cleanup(days);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Cleaned up ${deletedCount} inactive subscriptions`,
      data: { deletedCount }
    });
  } catch (error) {
    logger.error('[PushController] Failed to cleanup:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to cleanup subscriptions'
    });
  }
};
