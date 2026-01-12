/**
 * Export Controller
 *
 * Handles data export endpoints
 */

const exportService = require('../services/exportService');
const Insight = require('../models/Insight');
const Comment = require('../models/Comment');
const Like = require('../models/Like');
const Save = require('../models/Save');
const Analytics = require('../models/Analytics');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');
const path = require('path');

/**
 * Export insight to PDF
 * GET /api/export/insights/:id/pdf
 */
exports.exportInsightPDF = async (req, res) => {
  try {
    const { id } = req.params;

    const insight = await Insight.findById(id).populate('author', 'name');

    if (!insight) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Insight not found'
      });
    }

    const result = await exportService.exportInsightToPDF(insight);

    // Send file
    res.download(result.filepath, result.filename, (err) => {
      if (err) {
        logger.error('[ExportController] Download failed:', err);
      }
    });
  } catch (error) {
    logger.error('[ExportController] Export insight PDF failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to export insight',
      error: error.message
    });
  }
};

/**
 * Export analytics to CSV
 * GET /api/export/analytics/csv
 */
exports.exportAnalyticsCSV = async (req, res) => {
  try {
    const { period = 'daily', days = 30 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const analytics = await Analytics.getRange(startDate, endDate, period);

    const result = await exportService.exportAnalyticsToCSV(analytics, period);

    res.download(result.filepath, result.filename, (err) => {
      if (err) {
        logger.error('[ExportController] Download failed:', err);
      }
    });
  } catch (error) {
    logger.error('[ExportController] Export analytics CSV failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to export analytics',
      error: error.message
    });
  }
};

/**
 * Export user data (GDPR)
 * GET /api/export/my-data
 */
exports.exportUserData = async (req, res) => {
  try {
    const userId = req.user.id;
    const User = require('../models/User');

    const [user, insights, comments, likes, saves] = await Promise.all([
      User.findById(userId),
      Insight.find({ author: userId }),
      Comment.find({ author: userId }),
      Like.find({ user: userId }),
      Save.find({ user: userId })
    ]);

    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const result = await exportService.exportUserData(user, insights, comments, likes, saves);

    res.download(result.filepath, result.filename, (err) => {
      if (err) {
        logger.error('[ExportController] Download failed:', err);
      }
    });
  } catch (error) {
    logger.error('[ExportController] Export user data failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to export user data',
      error: error.message
    });
  }
};

/**
 * Export insights to CSV (admin)
 * GET /api/export/insights/csv
 */
exports.exportInsightsCSV = async (req, res) => {
  try {
    const { status, category, limit = 1000 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;

    const insights = await Insight.find(query)
      .populate('author', 'name')
      .limit(parseInt(limit))
      .sort({ publishedAt: -1 });

    const result = await exportService.exportInsightsToCSV(insights);

    res.download(result.filepath, result.filename, (err) => {
      if (err) {
        logger.error('[ExportController] Download failed:', err);
      }
    });
  } catch (error) {
    logger.error('[ExportController] Export insights CSV failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to export insights',
      error: error.message
    });
  }
};
