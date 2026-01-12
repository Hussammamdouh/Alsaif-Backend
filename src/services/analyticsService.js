/**
 * Analytics Service
 *
 * Handles analytics data collection, aggregation, and reporting
 */

const Analytics = require('../models/Analytics');
const User = require('../models/User');
const Insight = require('../models/Insight');
const logger = require('../utils/logger');

class AnalyticsService {
  /**
   * Record user activity
   */
  async recordUserActivity(userId, activityType, metadata = {}) {
    try {
      const today = new Date();
      const analytics = await Analytics.getOrCreate(today, 'daily');

      // Update daily active users (this would need deduplication in production)
      // For now, we increment - in production, use a Set or separate tracking

      if (activityType === 'login') {
        await analytics.incrementUserCount('dailyActiveUsers');
      }

      if (activityType === 'register') {
        await analytics.incrementUserCount('newUsers');
      }

      logger.info('[Analytics] Recorded user activity', { userId, activityType });
    } catch (error) {
      logger.error('[Analytics] Failed to record user activity:', error);
    }
  }

  /**
   * Record content view
   */
  async recordContentView(insightId, userId = null, isUnique = true) {
    try {
      const today = new Date();
      const analytics = await Analytics.getOrCreate(today, 'daily');

      await analytics.incrementContentMetric('totalViews');
      if (isUnique) {
        await analytics.incrementContentMetric('uniqueViews');
      }

      logger.info('[Analytics] Recorded content view', { insightId, userId });
    } catch (error) {
      logger.error('[Analytics] Failed to record content view:', error);
    }
  }

  /**
   * Record engagement (like, comment, save)
   */
  async recordEngagement(type, insightId, userId) {
    try {
      const today = new Date();
      const analytics = await Analytics.getOrCreate(today, 'daily');

      const metricMap = {
        like: 'totalLikes',
        comment: 'totalComments',
        save: 'totalSaves'
      };

      const metric = metricMap[type];
      if (metric) {
        await analytics.incrementContentMetric(metric);
      }

      logger.info('[Analytics] Recorded engagement', { type, insightId, userId });
    } catch (error) {
      logger.error('[Analytics] Failed to record engagement:', error);
    }
  }

  /**
   * Aggregate daily analytics
   * This should be run once per day via cron job
   */
  async aggregateDailyAnalytics(date = new Date()) {
    try {
      logger.info('[Analytics] Starting daily aggregation for', date);

      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const analytics = await Analytics.getOrCreate(startOfDay, 'daily');

      // Aggregate user stats
      await this.aggregateUserStats(analytics, startOfDay, endOfDay);

      // Aggregate content stats
      await this.aggregateContentStats(analytics, startOfDay, endOfDay);

      // Aggregate business stats
      await this.aggregateBusinessStats(analytics, startOfDay, endOfDay);

      // Calculate derived metrics
      await analytics.calculateDerivedMetrics();

      logger.info('[Analytics] Daily aggregation completed');
      return analytics;
    } catch (error) {
      logger.error('[Analytics] Failed to aggregate daily analytics:', error);
      throw error;
    }
  }

  /**
   * Aggregate user statistics
   */
  async aggregateUserStats(analytics, startOfDay, endOfDay) {
    // New users
    const newUsers = await User.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });
    analytics.users.newUsers = newUsers;

    // Users by subscription type
    const subscriptionCounts = await User.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$subscription.type',
          count: { $sum: 1 }
        }
      }
    ]);

    subscriptionCounts.forEach(({ _id, count }) => {
      if (analytics.users.bySubscription[_id] !== undefined) {
        analytics.users.bySubscription[_id] = count;
      }
    });

    // Total active users (simplified - would need session tracking in production)
    const totalActiveUsers = await User.countDocuments({ isActive: true });
    analytics.users.monthlyActiveUsers = totalActiveUsers;

    await analytics.save();
  }

  /**
   * Aggregate content statistics
   */
  async aggregateContentStats(analytics, startOfDay, endOfDay) {
    // Insights published today
    const insightsPublished = await Insight.countDocuments({
      publishedAt: { $gte: startOfDay, $lte: endOfDay },
      status: 'published'
    });
    analytics.content.insightsPublished = insightsPublished;

    // Get top performing insights (all time)
    const topInsights = await Insight.find({ status: 'published' })
      .sort({ 'analytics.views': -1 })
      .limit(10)
      .select('title analytics');

    await analytics.updateTopInsights(topInsights);

    // Performance by category
    const categoryStats = await Insight.aggregate([
      { $match: { status: 'published' } },
      {
        $group: {
          _id: '$category',
          views: { $sum: '$analytics.views' },
          likes: { $sum: '$analytics.likes' },
          insights: { $sum: 1 }
        }
      }
    ]);

    const categoryMap = new Map();
    categoryStats.forEach(({ _id, views, likes, insights }) => {
      categoryMap.set(_id, { views, likes, insights });
    });
    analytics.content.byCategory = categoryMap;

    await analytics.save();
  }

  /**
   * Aggregate business statistics
   */
  async aggregateBusinessStats(analytics, startOfDay, endOfDay) {
    // Count subscription changes (would need subscription history in production)
    // For now, just count current active subscriptions
    const totalSubscriptions = await User.countDocuments({
      'subscription.type': { $ne: 'free' },
      isActive: true
    });

    // This is simplified - in production you'd track actual subscription events
    analytics.business.newSubscriptions = 0;
    analytics.business.canceledSubscriptions = 0;

    // Calculate user growth rate (compare to yesterday)
    const yesterday = new Date(startOfDay);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayAnalytics = await Analytics.findOne({
      date: Analytics.getStartOfPeriod(yesterday, 'daily'),
      period: 'daily'
    });

    if (yesterdayAnalytics) {
      const totalUsersToday = analytics.users.monthlyActiveUsers;
      const totalUsersYesterday = yesterdayAnalytics.users.monthlyActiveUsers;

      if (totalUsersYesterday > 0) {
        analytics.business.userGrowthRate = (
          ((totalUsersToday - totalUsersYesterday) / totalUsersYesterday) *
          100
        ).toFixed(2);
      }
    }

    await analytics.save();
  }

  /**
   * Get dashboard analytics
   */
  async getDashboardAnalytics(period = 'daily', days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const analytics = await Analytics.getRange(startDate, endDate, period);

      // Calculate totals and trends
      const totals = this.calculateTotals(analytics);
      const trends = this.calculateTrends(analytics);

      return {
        period,
        days,
        analytics,
        totals,
        trends
      };
    } catch (error) {
      logger.error('[Analytics] Failed to get dashboard analytics:', error);
      throw error;
    }
  }

  /**
   * Calculate totals from analytics array
   */
  calculateTotals(analytics) {
    return analytics.reduce(
      (acc, curr) => {
        acc.totalViews += curr.content.totalViews;
        acc.totalLikes += curr.content.totalLikes;
        acc.totalComments += curr.content.totalComments;
        acc.newUsers += curr.users.newUsers;
        acc.insightsPublished += curr.content.insightsPublished;
        return acc;
      },
      {
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0,
        newUsers: 0,
        insightsPublished: 0
      }
    );
  }

  /**
   * Calculate trends from analytics array
   */
  calculateTrends(analytics) {
    if (analytics.length < 2) {
      return {
        views: 0,
        likes: 0,
        comments: 0,
        users: 0
      };
    }

    const recent = analytics.slice(-7); // Last 7 days
    const previous = analytics.slice(-14, -7); // Previous 7 days

    const recentAvg = {
      views: recent.reduce((sum, a) => sum + a.content.totalViews, 0) / recent.length,
      likes: recent.reduce((sum, a) => sum + a.content.totalLikes, 0) / recent.length,
      comments: recent.reduce((sum, a) => sum + a.content.totalComments, 0) / recent.length,
      users: recent.reduce((sum, a) => sum + a.users.newUsers, 0) / recent.length
    };

    const previousAvg = {
      views: previous.reduce((sum, a) => sum + a.content.totalViews, 0) / previous.length,
      likes: previous.reduce((sum, a) => sum + a.content.totalLikes, 0) / previous.length,
      comments: previous.reduce((sum, a) => sum + a.content.totalComments, 0) / previous.length,
      users: previous.reduce((sum, a) => sum + a.users.newUsers, 0) / previous.length
    };

    return {
      views: this.calculatePercentageChange(previousAvg.views, recentAvg.views),
      likes: this.calculatePercentageChange(previousAvg.likes, recentAvg.likes),
      comments: this.calculatePercentageChange(previousAvg.comments, recentAvg.comments),
      users: this.calculatePercentageChange(previousAvg.users, recentAvg.users)
    };
  }

  /**
   * Calculate percentage change
   */
  calculatePercentageChange(oldValue, newValue) {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return Math.round(((newValue - oldValue) / oldValue) * 100);
  }

  /**
   * Get user retention metrics
   */
  async getUserRetention(cohortDate) {
    // This is a simplified version
    // In production, you'd track user sessions and calculate actual retention
    const users = await User.find({
      createdAt: {
        $gte: cohortDate,
        $lte: new Date(cohortDate.getTime() + 24 * 60 * 60 * 1000)
      }
    });

    return {
      cohortSize: users.length,
      day1: 0, // Would calculate from session data
      day7: 0,
      day30: 0
    };
  }

  /**
   * Get content performance report
   */
  async getContentPerformance(startDate, endDate) {
    const insights = await Insight.find({
      publishedAt: { $gte: startDate, $lte: endDate },
      status: 'published'
    })
      .select('title category analytics publishedAt')
      .sort({ 'analytics.views': -1 })
      .limit(50);

    return {
      totalInsights: insights.length,
      insights: insights.map((i) => ({
        id: i._id,
        title: i.title,
        category: i.category,
        publishedAt: i.publishedAt,
        views: i.analytics?.views || 0,
        likes: i.analytics?.likes || 0,
        comments: i.analytics?.comments || 0,
        engagementRate:
          i.analytics?.views > 0
            ? (((i.analytics?.likes || 0) + (i.analytics?.comments || 0)) /
                i.analytics.views) *
              100
            : 0
      }))
    };
  }
}

module.exports = new AnalyticsService();
