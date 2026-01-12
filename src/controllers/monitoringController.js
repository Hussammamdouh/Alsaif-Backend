/**
 * Monitoring Controller
 *
 * Provides metrics and monitoring endpoints
 */

const monitoringService = require('../services/monitoringService');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');

/**
 * Get all metrics
 * GET /api/monitoring/metrics
 */
exports.getMetrics = async (req, res) => {
  try {
    const metrics = monitoringService.getMetrics();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('[MonitoringController] Get metrics failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve metrics',
      error: error.message
    });
  }
};

/**
 * Get system metrics
 * GET /api/monitoring/system
 */
exports.getSystemMetrics = async (req, res) => {
  try {
    const system = monitoringService.getSystemMetrics();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: system
    });
  } catch (error) {
    logger.error('[MonitoringController] Get system metrics failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve system metrics',
      error: error.message
    });
  }
};

/**
 * Get health status
 * GET /api/monitoring/health
 */
exports.getHealth = async (req, res) => {
  try {
    const health = monitoringService.getHealthStatus();

    const statusCode =
      health.status === 'healthy' ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;

    res.status(statusCode).json({
      success: health.status === 'healthy',
      data: health
    });
  } catch (error) {
    logger.error('[MonitoringController] Get health failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve health status',
      error: error.message
    });
  }
};

/**
 * Get top endpoints
 * GET /api/monitoring/endpoints/top
 */
exports.getTopEndpoints = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const endpoints = monitoringService.getTopEndpoints(parseInt(limit));

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: endpoints
    });
  } catch (error) {
    logger.error('[MonitoringController] Get top endpoints failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve top endpoints',
      error: error.message
    });
  }
};

/**
 * Get slow endpoints
 * GET /api/monitoring/endpoints/slow
 */
exports.getSlowEndpoints = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const endpoints = monitoringService.getSlowEndpoints(parseInt(limit));

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: endpoints
    });
  } catch (error) {
    logger.error('[MonitoringController] Get slow endpoints failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve slow endpoints',
      error: error.message
    });
  }
};

/**
 * Get error rate trend
 * GET /api/monitoring/errors/trend
 */
exports.getErrorTrend = async (req, res) => {
  try {
    const { minutes = 60 } = req.query;
    const trend = monitoringService.getErrorRateTrend(parseInt(minutes));

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: trend
    });
  } catch (error) {
    logger.error('[MonitoringController] Get error trend failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve error trend',
      error: error.message
    });
  }
};

/**
 * Reset metrics (admin only)
 * POST /api/monitoring/reset
 */
exports.resetMetrics = async (req, res) => {
  try {
    monitoringService.reset();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Metrics reset successfully'
    });
  } catch (error) {
    logger.error('[MonitoringController] Reset metrics failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to reset metrics',
      error: error.message
    });
  }
};

/**
 * Export metrics (admin only)
 * GET /api/monitoring/export
 */
exports.exportMetrics = async (req, res) => {
  try {
    const metrics = monitoringService.exportMetrics();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('[MonitoringController] Export metrics failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to export metrics',
      error: error.message
    });
  }
};
