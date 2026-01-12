/**
 * Admin Dashboard Service
 *
 * Provides comprehensive dashboard metrics and analytics for admin panel
 */

const User = require('../models/User');
const Insight = require('../models/Insight');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const Comment = require('../models/Comment');
const AuditLog = require('../models/AuditLog');
const Job = require('../models/Job');
const monitoringService = require('./monitoringService');
const logger = require('../utils/logger');

class AdminDashboardService {
  async getOverviewStats(timeRange = '30d') {
    try {
      const dateFilter = this.getDateFilter(timeRange);

      const [
        totalUsers,
        newUsers,
        activeUsers,
        suspendedUsers,
        adminUsers,
        premiumUsers,
        totalInsights,
        publishedInsights,
        draftInsights,
        premiumInsights,
        totalSubscriptions,
        activeSubscriptions,
        expiredSubscriptions,
        totalRevenue
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ createdAt: { $gte: dateFilter } }),
        User.countDocuments({ lastLogin: { $gte: dateFilter } }),
        User.countDocuments({ isActive: false }),
        User.countDocuments({ role: { $in: ['admin', 'superadmin'] } }),
        Subscription.countDocuments({ status: 'active', tier: 'premium' }), // Count based on active premium subs
        Insight.countDocuments({ isDeleted: { $ne: true } }),
        Insight.countDocuments({ status: 'published', isDeleted: { $ne: true } }),
        Insight.countDocuments({ status: 'draft', isDeleted: { $ne: true } }),
        Insight.countDocuments({ type: 'premium', isDeleted: { $ne: true } }),
        Subscription.countDocuments(),
        Subscription.countDocuments({ status: 'active' }),
        Subscription.countDocuments({ status: 'expired' }),
        this.calculateRevenue(dateFilter)
      ]);

      const userGrowthRate = await this.calculateGrowthRate('User', timeRange);
      const insightGrowthRate = await this.calculateGrowthRate('Insight', timeRange);

      return {
        users: {
          total: totalUsers,
          new: newUsers,
          active: activeUsers,
          suspended: suspendedUsers,
          admins: adminUsers,
          premium: premiumUsers,
          growthRate: userGrowthRate
        },
        insights: {
          total: totalInsights,
          published: publishedInsights,
          drafts: draftInsights,
          premium: premiumInsights,
          growthRate: insightGrowthRate
        },
        subscriptions: {
          total: totalSubscriptions,
          active: activeSubscriptions,
          expired: expiredSubscriptions,
          revenue: totalRevenue
        },
        revenue: {
          total: totalRevenue,
          currency: 'USD'
        },
        timeRange
      };
    } catch (error) {
      logger.error('[AdminDashboard] Failed to get overview stats:', error);
      throw error;
    }
  }

  /**
   * Get user analytics
   */
  async getUserAnalytics(timeRange = '30d') {
    try {
      const dateFilter = this.getDateFilter(timeRange);

      // User growth over time
      const userGrowth = await User.aggregate([
        {
          $match: {
            createdAt: { $gte: dateFilter },
            isDeleted: false
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // User distribution by role
      const usersByRole = await User.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 }
          }
        }
      ]);

      // Active vs inactive users
      const activeThreshold = new Date();
      activeThreshold.setDate(activeThreshold.getDate() - 30);

      const [activeCount, inactiveCount] = await Promise.all([
        User.countDocuments({ lastLogin: { $gte: activeThreshold }, isDeleted: false }),
        User.countDocuments({ lastLogin: { $lt: activeThreshold }, isDeleted: false })
      ]);

      // Top active users
      const topUsers = await User.find({ isDeleted: false })
        .select('name email role lastLogin createdAt')
        .sort({ lastLogin: -1 })
        .limit(10);

      return {
        growth: userGrowth,
        byRole: usersByRole,
        activity: {
          active: activeCount,
          inactive: inactiveCount
        },
        topUsers
      };
    } catch (error) {
      logger.error('[AdminDashboard] Failed to get user analytics:', error);
      throw error;
    }
  }

  /**
   * Get content analytics
   */
  async getContentAnalytics(timeRange = '30d') {
    try {
      const dateFilter = this.getDateFilter(timeRange);

      // Content distribution by category
      const contentByCategory = await Insight.aggregate([
        { $match: { status: 'published', isDeleted: false } },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            totalViews: { $sum: '$analytics.views' },
            totalLikes: { $sum: '$analytics.likes' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Content by type
      const contentByType = await Insight.aggregate([
        { $match: { status: 'published', isDeleted: false } },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        }
      ]);

      // Top performing insights
      const topInsights = await Insight.find({
        status: 'published',
        isDeleted: false
      })
        .select('title category type analytics.views analytics.likes createdAt')
        .sort({ 'analytics.views': -1 })
        .limit(10);

      // Recent insights
      const recentInsights = await Insight.find({
        createdAt: { $gte: dateFilter },
        isDeleted: false
      })
        .select('title status category type createdAt author')
        .populate('author', 'name email')
        .sort({ createdAt: -1 })
        .limit(10);

      return {
        byCategory: contentByCategory,
        byType: contentByType,
        topPerforming: topInsights,
        recent: recentInsights
      };
    } catch (error) {
      logger.error('[AdminDashboard] Failed to get content analytics:', error);
      throw error;
    }
  }

  /**
   * Get engagement metrics
   */
  async getEngagementMetrics(timeRange = '30d') {
    try {
      const dateFilter = this.getDateFilter(timeRange);

      // Comments over time
      const commentsTrend = await Comment.aggregate([
        {
          $match: {
            createdAt: { $gte: dateFilter }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Total engagement metrics
      const [totalComments, approvedComments, pendingComments] = await Promise.all([
        Comment.countDocuments(),
        Comment.countDocuments({ isApproved: true }),
        Comment.countDocuments({ isApproved: false })
      ]);

      // Engagement rate by insight
      const engagementByInsight = await Insight.aggregate([
        { $match: { status: 'published', isDeleted: false } },
        {
          $project: {
            title: 1,
            views: '$analytics.views',
            likes: '$analytics.likes',
            comments: '$analytics.comments',
            engagementRate: {
              $cond: [
                { $gt: ['$analytics.views', 0] },
                {
                  $multiply: [
                    {
                      $divide: [
                        { $add: ['$analytics.likes', '$analytics.comments'] },
                        '$analytics.views'
                      ]
                    },
                    100
                  ]
                },
                0
              ]
            }
          }
        },
        { $sort: { engagementRate: -1 } },
        { $limit: 10 }
      ]);

      return {
        comments: {
          total: totalComments,
          approved: approvedComments,
          pending: pendingComments,
          trend: commentsTrend
        },
        topEngaging: engagementByInsight
      };
    } catch (error) {
      logger.error('[AdminDashboard] Failed to get engagement metrics:', error);
      throw error;
    }
  }

  /**
   * Get system health metrics
   */
  async getSystemHealth() {
    try {
      // Get monitoring metrics
      const metrics = monitoringService.getMetrics();

      // Database health
      const dbHealth = await this.checkDatabaseHealth();

      // Job queue health
      const jobStats = await Job.getStats();

      // Recent errors from audit logs
      const recentErrors = await AuditLog.find({
        action: { $in: ['error', 'critical_error'] }
      })
        .sort({ timestamp: -1 })
        .limit(10)
        .select('action resource metadata timestamp');

      return {
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        },
        api: {
          requests: metrics.requests,
          performance: metrics.performance,
          errors: metrics.errors
        },
        database: dbHealth,
        jobs: jobStats,
        recentErrors
      };
    } catch (error) {
      logger.error('[AdminDashboard] Failed to get system health:', error);
      throw error;
    }
  }

  /**
   * Get activity logs
   */
  async getActivityLogs(options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        action,
        userId,
        resource,
        startDate,
        endDate
      } = options;

      const query = {};

      if (action) query.action = action;
      if (userId) query.performedBy = userId;
      if (resource) query.resource = resource;
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .populate('performedBy', 'name email role')
          .sort({ timestamp: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        AuditLog.countDocuments(query)
      ]);

      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('[AdminDashboard] Failed to get activity logs:', error);
      throw error;
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(timeRange = '30d') {
    try {
      const dateFilter = this.getDateFilter(timeRange);

      const [totalSent, byChannel, byType] = await Promise.all([
        Notification.countDocuments({
          createdAt: { $gte: dateFilter },
          overallStatus: 'sent'
        }),
        Notification.aggregate([
          { $match: { createdAt: { $gte: dateFilter } } },
          {
            $project: {
              channels: { $objectToArray: '$channels' }
            }
          },
          { $unwind: '$channels' },
          {
            $group: {
              _id: '$channels.k',
              sent: {
                $sum: {
                  $cond: [{ $eq: ['$channels.v.status', 'sent'] }, 1, 0]
                }
              },
              failed: {
                $sum: {
                  $cond: [{ $eq: ['$channels.v.status', 'failed'] }, 1, 0]
                }
              }
            }
          }
        ]),
        Notification.aggregate([
          { $match: { createdAt: { $gte: dateFilter } } },
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } }
        ])
      ]);

      return {
        totalSent,
        byChannel,
        byType
      };
    } catch (error) {
      logger.error('[AdminDashboard] Failed to get notification stats:', error);
      throw error;
    }
  }

  /**
   * Helper: Get date filter based on time range
   */
  getDateFilter(timeRange) {
    const now = new Date();
    const value = parseInt(timeRange);
    const unit = timeRange.replace(value.toString(), '');

    switch (unit) {
      case 'd': // days
        return new Date(now.setDate(now.getDate() - value));
      case 'w': // weeks
        return new Date(now.setDate(now.getDate() - value * 7));
      case 'm': // months
        return new Date(now.setMonth(now.getMonth() - value));
      case 'y': // years
        return new Date(now.setFullYear(now.getFullYear() - value));
      default:
        return new Date(now.setDate(now.getDate() - 30)); // Default 30 days
    }
  }

  /**
   * Helper: Calculate growth rate
   */
  async calculateGrowthRate(model, timeRange) {
    try {
      const dateFilter = this.getDateFilter(timeRange);
      const previousPeriod = new Date(dateFilter);
      previousPeriod.setDate(previousPeriod.getDate() - (Date.now() - dateFilter.getTime()) / (1000 * 60 * 60 * 24));

      const ModelClass = require(`../models/${model}`);

      const [currentCount, previousCount] = await Promise.all([
        ModelClass.countDocuments({ createdAt: { $gte: dateFilter } }),
        ModelClass.countDocuments({
          createdAt: { $gte: previousPeriod, $lt: dateFilter }
        })
      ]);

      if (previousCount === 0) return currentCount > 0 ? 100 : 0;

      return ((currentCount - previousCount) / previousCount) * 100;
    } catch (error) {
      logger.error('[AdminDashboard] Failed to calculate growth rate:', error);
      return 0;
    }
  }

  /**
   * Helper: Calculate revenue
   */
  async calculateRevenue(dateFilter) {
    try {
      const subscriptions = await Subscription.find({
        createdAt: { $gte: dateFilter },
        status: { $in: ['active', 'cancelled', 'expired'] }
      }).populate('plan').lean();

      return subscriptions.reduce((sum, sub) => {
        const price = sub.plan?.price || sub.price || 0;
        return sum + price;
      }, 0);
    } catch (error) {
      logger.error('[AdminDashboard] Failed to calculate revenue:', error);
      return 0;
    }
  }

  /**
   * Helper: Check database health
   */
  async checkDatabaseHealth() {
    try {
      const mongoose = require('mongoose');
      const db = mongoose.connection;

      return {
        status: db.readyState === 1 ? 'healthy' : 'unhealthy',
        readyState: db.readyState,
        host: db.host,
        name: db.name
      };
    } catch (error) {
      logger.error('[AdminDashboard] Failed to check database health:', error);
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = new AdminDashboardService();
