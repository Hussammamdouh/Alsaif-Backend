/**
 * Analytics Controller
 *
 * Handles analytics API endpoints
 */

const analyticsService = require('../services/analyticsService');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');

/**
 * Get dashboard analytics overview
 * GET /api/analytics/dashboard
 */
exports.getDashboard = async (req, res) => {
  try {
    const { period = 'daily', days = 30 } = req.query;

    const analytics = await analyticsService.getDashboardAnalytics(
      period,
      parseInt(days)
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('[AnalyticsController] Get dashboard failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve analytics',
      error: error.message
    });
  }
};

/**
 * Get user analytics
 * GET /api/analytics/users
 */
exports.getUserAnalytics = async (req, res) => {
  try {
    const { period = 'daily', days = 30 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const Analytics = require('../models/Analytics');
    const analytics = await Analytics.getRange(startDate, endDate, period);

    const userMetrics = analytics.map((a) => ({
      date: a.date,
      dailyActiveUsers: a.users.dailyActiveUsers,
      weeklyActiveUsers: a.users.weeklyActiveUsers,
      monthlyActiveUsers: a.users.monthlyActiveUsers,
      newUsers: a.users.newUsers,
      churnedUsers: a.users.churnedUsers,
      bySubscription: a.users.bySubscription
    }));

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: userMetrics
    });
  } catch (error) {
    logger.error('[AnalyticsController] Get user analytics failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve user analytics',
      error: error.message
    });
  }
};

/**
 * Get content analytics
 * GET /api/analytics/content
 */
exports.getContentAnalytics = async (req, res) => {
  try {
    const { period = 'daily', days = 30 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const Analytics = require('../models/Analytics');
    const analytics = await Analytics.getRange(startDate, endDate, period);

    const contentMetrics = analytics.map((a) => ({
      date: a.date,
      insightsPublished: a.content.insightsPublished,
      totalViews: a.content.totalViews,
      uniqueViews: a.content.uniqueViews,
      totalLikes: a.content.totalLikes,
      totalComments: a.content.totalComments,
      totalSaves: a.content.totalSaves,
      avgViewsPerInsight: a.content.avgViewsPerInsight,
      topInsights: a.content.topInsights
    }));

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: contentMetrics
    });
  } catch (error) {
    logger.error('[AnalyticsController] Get content analytics failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve content analytics',
      error: error.message
    });
  }
};

/**
 * Get business analytics
 * GET /api/analytics/business
 */
exports.getBusinessAnalytics = async (req, res) => {
  try {
    const { period = 'daily', days = 30 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const Analytics = require('../models/Analytics');
    const analytics = await Analytics.getRange(startDate, endDate, period);

    const businessMetrics = analytics.map((a) => ({
      date: a.date,
      newSubscriptions: a.business.newSubscriptions,
      canceledSubscriptions: a.business.canceledSubscriptions,
      revenue: a.business.revenue,
      userGrowthRate: a.business.userGrowthRate,
      revenueGrowthRate: a.business.revenueGrowthRate,
      conversions: {
        freeToBasic: a.business.freeToBasicConversion,
        basicToPremium: a.business.basicToPremiumConversion
      }
    }));

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: businessMetrics
    });
  } catch (error) {
    logger.error('[AnalyticsController] Get business analytics failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve business analytics',
      error: error.message
    });
  }
};

/**
 * Get engagement analytics
 * GET /api/analytics/engagement
 */
exports.getEngagementAnalytics = async (req, res) => {
  try {
    const { period = 'daily', days = 30 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const Analytics = require('../models/Analytics');
    const analytics = await Analytics.getRange(startDate, endDate, period);

    const engagementMetrics = analytics.map((a) => ({
      date: a.date,
      avgSessionDuration: a.engagement.avgSessionDuration,
      avgTimePerInsight: a.engagement.avgTimePerInsight,
      totalSessions: a.engagement.totalSessions,
      avgPagesPerSession: a.engagement.avgPagesPerSession,
      overallEngagementScore: a.engagement.overallEngagementScore
    }));

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: engagementMetrics
    });
  } catch (error) {
    logger.error('[AnalyticsController] Get engagement analytics failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve engagement analytics',
      error: error.message
    });
  }
};

/**
 * Get content performance report
 * GET /api/analytics/content/performance
 */
exports.getContentPerformance = async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const report = await analyticsService.getContentPerformance(startDate, endDate);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('[AnalyticsController] Get content performance failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve content performance report',
      error: error.message
    });
  }
};

/**
 * Trigger manual analytics aggregation (admin only)
 * POST /api/analytics/aggregate
 */
exports.aggregateAnalytics = async (req, res) => {
  try {
    const { date } = req.body;
    const aggregationDate = date ? new Date(date) : new Date();

    const analytics = await analyticsService.aggregateDailyAnalytics(aggregationDate);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Analytics aggregated successfully',
      data: analytics
    });
  } catch (error) {
    logger.error('[AnalyticsController] Aggregate analytics failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to aggregate analytics',
      error: error.message
    });
  }
};

/**
 * Get category performance
 * GET /api/analytics/categories
 */
exports.getCategoryPerformance = async (req, res) => {
  try {
    const { period = 'daily' } = req.query;

    const Analytics = require('../models/Analytics');
    const latest = await Analytics.findOne({ period }).sort({ date: -1 });

    if (!latest) {
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        data: []
      });
    }

    const categories = Array.from(latest.content.byCategory.entries()).map(
      ([category, stats]) => ({
        category,
        ...stats
      })
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('[AnalyticsController] Get category performance failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve category performance',
      error: error.message
    });
  }
};
