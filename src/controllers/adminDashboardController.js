/**
 * Admin Dashboard Controller
 *
 * Handles admin dashboard endpoints
 */

const adminDashboardService = require('../services/adminDashboardService');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');

/**
 * Get dashboard overview
 */
exports.getOverview = async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;

    const stats = await adminDashboardService.getOverviewStats(timeRange);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('[AdminDashboardController] Failed to get overview:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to get dashboard overview'
    });
  }
};

/**
 * Get user analytics
 */
exports.getUserAnalytics = async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;

    const analytics = await adminDashboardService.getUserAnalytics(timeRange);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('[AdminDashboardController] Failed to get user analytics:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to get user analytics'
    });
  }
};

/**
 * Get content analytics
 */
exports.getContentAnalytics = async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;

    const analytics = await adminDashboardService.getContentAnalytics(timeRange);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('[AdminDashboardController] Failed to get content analytics:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to get content analytics'
    });
  }
};

/**
 * Get engagement metrics
 */
exports.getEngagementMetrics = async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;

    const metrics = await adminDashboardService.getEngagementMetrics(timeRange);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('[AdminDashboardController] Failed to get engagement metrics:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to get engagement metrics'
    });
  }
};

/**
 * Get system health
 */
exports.getSystemHealth = async (req, res) => {
  try {
    const health = await adminDashboardService.getSystemHealth();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('[AdminDashboardController] Failed to get system health:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to get system health'
    });
  }
};

/**
 * Get activity logs
 */
exports.getActivityLogs = async (req, res) => {
  try {
    const {
      page,
      limit,
      action,
      userId,
      resource,
      startDate,
      endDate
    } = req.query;

    const result = await adminDashboardService.getActivityLogs({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      action,
      userId,
      resource,
      startDate,
      endDate
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result.logs,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('[AdminDashboardController] Failed to get activity logs:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to get activity logs'
    });
  }
};

/**
 * Get notification statistics
 */
exports.getNotificationStats = async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;

    const stats = await adminDashboardService.getNotificationStats(timeRange);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('[AdminDashboardController] Failed to get notification stats:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to get notification statistics'
    });
  }
};

/**
 * Get all dashboard data (for initial load)
 */
exports.getAllDashboardData = async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;

    const [
      overview,
      userAnalytics,
      contentAnalytics,
      engagement,
      systemHealth,
      notificationStats
    ] = await Promise.all([
      adminDashboardService.getOverviewStats(timeRange),
      adminDashboardService.getUserAnalytics(timeRange),
      adminDashboardService.getContentAnalytics(timeRange),
      adminDashboardService.getEngagementMetrics(timeRange),
      adminDashboardService.getSystemHealth(),
      adminDashboardService.getNotificationStats(timeRange)
    ]);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        overview,
        userAnalytics,
        contentAnalytics,
        engagement,
        systemHealth,
        notificationStats,
        timeRange
      }
    });
  } catch (error) {
    logger.error('[AdminDashboardController] Failed to get all dashboard data:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to load dashboard data'
    });
  }
};
