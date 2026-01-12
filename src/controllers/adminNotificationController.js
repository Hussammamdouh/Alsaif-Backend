/**
 * Admin Notification Controller
 * Handle broadcast notifications and notification management for admins
 */

const Notification = require('../models/Notification');
const User = require('../models/User');
const NotificationPreference = require('../models/NotificationPreference');
const { notificationEvents, NOTIFICATION_EVENTS } = require('../events/enhancedNotificationEvents');
const { getPaginationParams, getPaginationMeta } = require('../utils/pagination');
const { HTTP_STATUS, AUDIT_ACTIONS } = require('../constants');
const AuditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');
const pushNotificationService = require('../services/pushNotificationService');

class AdminNotificationController {
  /**
   * Broadcast notification to target audience
   */
  async broadcastNotification(req, res, next) {
    try {
      const {
        title,
        body,
        target, // 'all', 'premium', 'basic', 'admins', 'active'
        priority = 'medium',
        actionUrl,
        scheduledFor,
        imageUrl
      } = req.body;

      // Build user query based on target
      let userQuery = { isActive: true };

      switch (target) {
        case 'premium': {
          const Subscription = require('../models/Subscription');
          const activeSubscriptions = await Subscription.find({
            status: { $in: ['active', 'trial'] },
            tier: { $ne: 'free' }
          }).select('user');
          const premiumUserIds = activeSubscriptions.map(s => s.user);
          userQuery._id = { $in: premiumUserIds };
          break;
        }
        case 'basic': {
          const Subscription = require('../models/Subscription');
          const nonBasicSubs = await Subscription.find({
            status: { $in: ['active', 'trial'] },
            tier: { $ne: 'free' }
          }).select('user');
          const nonBasicUserIds = nonBasicSubs.map(s => s.user);
          userQuery._id = { $nin: nonBasicUserIds };
          break;
        }
        case 'admins':
          userQuery.role = { $in: ['admin', 'superadmin'] };
          break;
        case 'active':
          userQuery.lastLogin = {
            $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          };
          break;
        case 'all':
          // No additional filter
          break;
        default:
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Invalid target audience'
          });
      }

      // Get target users
      const targetUsers = await User.find(userQuery).select('_id email');

      if (targetUsers.length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'No users match the target criteria'
        });
      }

      const userIds = targetUsers.map(u => u._id.toString());

      // Create notification records for each user
      const notifications = await Promise.all(
        targetUsers.map(async (user) => {
          return await Notification.create({
            recipient: user._id,
            type: NOTIFICATION_EVENTS.ANNOUNCEMENT,
            priority,
            title,
            body,
            richContent: {
              actionUrl,
              imageUrl,
              metadata: {
                broadcast: true,
                target,
                adminId: req.user.id,
                adminEmail: req.user.email
              }
            },
            channels: {
              push: { enabled: true },
              inApp: { enabled: true },
              email: { enabled: target === 'all' || target === 'premium' }
            },
            scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
            overallStatus: 'pending'
          });
        })
      );

      // Send via PushNotification if initialized
      if (pushNotificationService.initialized) {
        try {
          const pushPayload = {
            title,
            body,
            icon: imageUrl || '/icon-192x192.png',
            data: {
              url: actionUrl || '/',
              type: 'broadcast',
              target
            }
          };

          await pushNotificationService.sendToUsers(userIds, pushPayload);
          logger.info('[AdminNotification] Sent via PushNotification', {
            target,
            recipientCount: userIds.length
          });
        } catch (error) {
          logger.error('[AdminNotification] PushNotification send failed:', error);
          // Continue anyway - in-app notifications still created
        }
      }

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.BROADCAST_NOTIFICATION,
        target: {
          resourceType: 'Notification',
          resourceId: 'broadcast',
          resourceName: title
        },
        metadata: {
          target,
          recipientCount: targetUsers.length,
          priority,
          scheduledFor: scheduledFor || 'immediate'
        }
      });

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: `Notification broadcast to ${targetUsers.length} users`,
        data: {
          recipientCount: targetUsers.length,
          target,
          scheduledFor: scheduledFor || null
        }
      });
    } catch (error) {
      logger.error('[AdminNotification] Broadcast failed:', error);
      next(error);
    }
  }

  /**
   * Get broadcast notification history
   */
  async getBroadcastHistory(req, res, next) {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);

      // Query for broadcast notifications (check metadata)
      const [notifications, total] = await Promise.all([
        Notification.find({
          'richContent.metadata.broadcast': true
        })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select('title body priority richContent.metadata overallStatus createdAt')
          .lean(),
        Notification.countDocuments({
          'richContent.metadata.broadcast': true
        })
      ]);

      const pagination = getPaginationMeta(total, page, limit);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Broadcast history retrieved',
        data: {
          notifications,
          pagination
        }
      });
    } catch (error) {
      logger.error('[AdminNotification] Failed to get history:', error);
      next(error);
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(req, res, next) {
    try {
      const stats = await Notification.aggregate([
        {
          $facet: {
            totalByType: [
              {
                $group: {
                  _id: '$type',
                  count: { $sum: 1 }
                }
              }
            ],
            totalByStatus: [
              {
                $group: {
                  _id: '$overallStatus',
                  count: { $sum: 1 }
                }
              }
            ],
            totalByPriority: [
              {
                $group: {
                  _id: '$priority',
                  count: { $sum: 1 }
                }
              }
            ],
            broadcastCount: [
              {
                $match: {
                  'richContent.metadata.broadcast': true
                }
              },
              {
                $count: 'count'
              }
            ],
            recentBroadcasts: [
              {
                $match: {
                  'richContent.metadata.broadcast': true
                }
              },
              {
                $sort: { createdAt: -1 }
              },
              {
                $limit: 10
              },
              {
                $project: {
                  title: 1,
                  'richContent.metadata.target': 1,
                  'richContent.metadata.adminEmail': 1,
                  createdAt: 1,
                  overallStatus: 1
                }
              }
            ]
          }
        }
      ]);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Notification statistics retrieved',
        data: stats[0]
      });
    } catch (error) {
      logger.error('[AdminNotification] Failed to get stats:', error);
      next(error);
    }
  }
}

module.exports = new AdminNotificationController();
