const NotificationPreference = require('../models/NotificationPreference');
const Notification = require('../models/Notification');
const { HTTP_STATUS } = require('../constants');
const { getPaginationParams } = require('../utils/pagination');

/**
 * Notification Controller
 *
 * Handles notification preferences and history
 * - User: View/update preferences, view notification history
 * - Admin: View all notifications, analytics
 */

class NotificationController {
  /**
   * Get current user's notification preferences
   * GET /api/notifications/preferences
   */
  async getMyPreferences(req, res, next) {
    try {
      const userId = req.user.id;

      const preferences = await NotificationPreference.getOrCreateForUser(userId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: { preferences }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update current user's notification preferences
   * PATCH /api/notifications/preferences
   * SECURITY: Whitelist pattern to prevent mass assignment attacks
   */
  async updateMyPreferences(req, res, next) {
    try {
      const userId = req.user.id;

      // SECURITY FIX: Destructure only allowed fields (whitelist pattern)
      // This prevents attackers from injecting 'user', '_id', or other protected fields
      const { subscription, content, engagement, premium, system, marketing, globalSettings } =
        req.body;

      let preferences = await NotificationPreference.getOrCreateForUser(userId);

      // Update only whitelisted preference categories
      // Protected fields (user, _id, metadata.updatedBy) cannot be modified via this endpoint
      if (subscription) {
        preferences.subscription = { ...preferences.subscription, ...subscription };
      }
      if (content) {
        preferences.content = { ...preferences.content, ...content };
      }
      if (engagement) {
        preferences.engagement = { ...preferences.engagement, ...engagement };
      }
      if (premium) {
        preferences.premium = { ...preferences.premium, ...premium };
      }
      if (system) {
        preferences.system = { ...preferences.system, ...system };
      }
      if (marketing) {
        preferences.marketing = { ...preferences.marketing, ...marketing };
      }
      if (globalSettings) {
        preferences.globalSettings = { ...preferences.globalSettings, ...globalSettings };
      }

      // Update metadata (server-controlled, not from user input)
      preferences.metadata.lastUpdated = new Date();
      preferences.metadata.updatedBy = userId;

      await preferences.save();

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Notification preferences updated successfully',
        data: { preferences }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add push notification token
   * POST /api/notifications/push-token
   */
  async addPushToken(req, res, next) {
    try {
      const userId = req.user.id;
      const { token, platform } = req.body;

      if (!token || !platform) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Token and platform are required'
        });
      }

      if (!['ios', 'android', 'web'].includes(platform)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Invalid platform. Must be ios, android, or web'
        });
      }

      const preferences = await NotificationPreference.getOrCreateForUser(userId);
      await preferences.addPushToken(token, platform);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Push token added successfully',
        data: {
          activeTokens: preferences.getActivePushTokens().length
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove push notification token
   * DELETE /api/notifications/push-token
   */
  async removePushToken(req, res, next) {
    try {
      const userId = req.user.id;
      const { token } = req.body;

      if (!token) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Token is required'
        });
      }

      const preferences = await NotificationPreference.getOrCreateForUser(userId);
      await preferences.removePushToken(token);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Push token removed successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user's notification history
   * GET /api/notifications/history
   */
  async getMyNotifications(req, res, next) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, type, priority, status } = req.query;
      const { skip, limitNum } = getPaginationParams(page, limit);

      // Build filter
      const filter = { type, priority };
      if (status === 'unread') {
        filter['channels.inApp.status'] = 'unread';
      } else if (status === 'read') {
        filter['channels.inApp.status'] = { $in: ['read', 'dismissed'] };
      }

      const notifications = await Notification.getHistoryForUser(
        userId,
        limitNum,
        skip,
        filter
      );

      const total = await Notification.countDocuments({
        recipient: userId,
        ...filter
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          notifications,
          pagination: {
            page: parseInt(page),
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get unread notifications count
   * GET /api/notifications/unread-count
   */
  async getUnreadCount(req, res, next) {
    try {
      const userId = req.user.id;

      const unreadNotifications = await Notification.getUnreadForUser(userId, 0); // Get all unread
      const count = unreadNotifications.length;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: { count }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark notification as read
   * PATCH /api/notifications/:notificationId/read
   */
  async markAsRead(req, res, next) {
    try {
      const userId = req.user.id;
      const { notificationId } = req.params;

      const notification = await Notification.findOne({
        _id: notificationId,
        recipient: userId
      });

      if (!notification) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Notification not found'
        });
      }

      await notification.markAsRead();

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark all notifications as read
   * POST /api/notifications/mark-all-read
   */
  async markAllAsRead(req, res, next) {
    try {
      const userId = req.user.id;

      const result = await Notification.updateMany(
        {
          recipient: userId,
          'channels.inApp.status': 'unread'
        },
        {
          $set: {
            'channels.inApp.status': 'read',
            'channels.inApp.readAt': new Date()
          }
        }
      );

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: `${result.modifiedCount} notifications marked as read`,
        data: {
          count: result.modifiedCount
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Dismiss notification
   * DELETE /api/notifications/:notificationId
   */
  async dismissNotification(req, res, next) {
    try {
      const userId = req.user.id;
      const { notificationId } = req.params;

      const notification = await Notification.findOne({
        _id: notificationId,
        recipient: userId
      });

      if (!notification) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Notification not found'
        });
      }

      await notification.markAsDismissed();

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Notification dismissed'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Track notification click
   * POST /api/notifications/:notificationId/click
   */
  async trackClick(req, res, next) {
    try {
      const userId = req.user.id;
      const { notificationId } = req.params;
      const { clickedUrl } = req.body;

      const notification = await Notification.findOne({
        _id: notificationId,
        recipient: userId
      });

      if (!notification) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Notification not found'
        });
      }

      await notification.trackClick(clickedUrl);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Click tracked'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Get notification analytics
   * GET /api/admin/notifications/analytics
   */
  async getAnalytics(req, res, next) {
    try {
      const { startDate, endDate, type } = req.query;

      const filter = {};
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }
      if (type) filter.type = type;

      const stats = await Notification.getStats(filter);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: { stats }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Get all notifications with filters
   * GET /api/admin/notifications
   */
  async getAllNotifications(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        type,
        priority,
        status,
        userId,
        channel
      } = req.query;

      const { skip, limitNum } = getPaginationParams(page, limit);

      // Build filter
      const filter = {};
      if (type) filter.type = type;
      if (priority) filter.priority = priority;
      if (status) filter.overallStatus = status;
      if (userId) filter.recipient = userId;
      if (channel && ['email', 'push', 'sms', 'inApp'].includes(channel)) {
        filter[`channels.${channel}.enabled`] = true;
      }

      const notifications = await Notification.find(filter)
        .populate('recipient', 'name email role')
        .sort('-createdAt')
        .limit(limitNum)
        .skip(skip);

      const total = await Notification.countDocuments(filter);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          notifications,
          pagination: {
            page: parseInt(page),
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Get user's notification preferences
   * GET /api/admin/users/:userId/notification-preferences
   */
  async getUserPreferences(req, res, next) {
    try {
      const { userId } = req.params;

      const preferences = await NotificationPreference.getOrCreateForUser(userId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: { preferences }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Test notification endpoint for development
   * POST /api/notifications/test (only in development)
   */
  async testNotification(req, res, next) {
    try {
      if (process.env.NODE_ENV === 'production') {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: 'Test notifications are only available in development'
        });
      }

      const userId = req.user.id;
      const { type = 'subscription:created', priority = 'medium', channels = ['in-app'] } = req.body;

      const notification = await Notification.create({
        recipient: userId,
        type,
        priority,
        title: 'Test Notification',
        body: 'This is a test notification sent from the API',
        richContent: {
          actionUrl: '/insights',
          actionText: 'View Insights'
        },
        channels: {
          inApp: {
            enabled: channels.includes('in-app'),
            status: 'unread'
          },
          email: {
            enabled: channels.includes('email'),
            status: 'pending'
          },
          push: {
            enabled: channels.includes('push'),
            status: 'pending'
          }
        },
        overallStatus: 'sent'
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Test notification created',
        data: { notification }
      });
    } catch (error) {
      next(error);
    }
  }
}

const controller = new NotificationController();

// Export bound methods to preserve 'this' context
module.exports = {
  getMyPreferences: controller.getMyPreferences.bind(controller),
  updateMyPreferences: controller.updateMyPreferences.bind(controller),
  addPushToken: controller.addPushToken.bind(controller),
  removePushToken: controller.removePushToken.bind(controller),
  getMyNotifications: controller.getMyNotifications.bind(controller),
  getUnreadCount: controller.getUnreadCount.bind(controller),
  markAsRead: controller.markAsRead.bind(controller),
  markAllAsRead: controller.markAllAsRead.bind(controller),
  dismissNotification: controller.dismissNotification.bind(controller),
  trackClick: controller.trackClick.bind(controller),
  testNotification: controller.testNotification.bind(controller),
  getAnalytics: controller.getAnalytics.bind(controller),
  getAllNotifications: controller.getAllNotifications.bind(controller),
  getUserPreferences: controller.getUserPreferences.bind(controller)
};
