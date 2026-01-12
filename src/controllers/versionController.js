/**
 * Version Controller
 *
 * Handles version management endpoints
 */

const versioningService = require('../services/versioningService');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');

/**
 * Auto-save draft
 * POST /api/versions/autosave
 */
exports.autoSaveDraft = async (req, res) => {
  try {
    const { insightId, ...insightData } = req.body;
    const userId = req.user.id;

    const result = await versioningService.autoSaveDraft(insightId, insightData, userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        insightId: result.insight._id,
        version: result.version.version
      }
    });
  } catch (error) {
    logger.error('[VersionController] Auto-save failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to auto-save draft',
      error: error.message
    });
  }
};

/**
 * Get version history for an insight
 * GET /api/versions/:insightId/history
 */
exports.getHistory = async (req, res) => {
  try {
    const { insightId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const result = await versioningService.getHistory(insightId, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('[VersionController] Get history failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve version history',
      error: error.message
    });
  }
};

/**
 * Get a specific version
 * GET /api/versions/:insightId/:versionNumber
 */
exports.getVersion = async (req, res) => {
  try {
    const { insightId, versionNumber } = req.params;

    const version = await versioningService.getVersion(
      insightId,
      parseInt(versionNumber)
    );

    if (!version) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Version not found'
      });
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: version
    });
  } catch (error) {
    logger.error('[VersionController] Get version failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve version',
      error: error.message
    });
  }
};

/**
 * Compare two versions
 * GET /api/versions/:insightId/compare/:version1/:version2
 */
exports.compareVersions = async (req, res) => {
  try {
    const { insightId, version1, version2 } = req.params;

    const comparison = await versioningService.compareVersions(
      insightId,
      parseInt(version1),
      parseInt(version2)
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: comparison
    });
  } catch (error) {
    logger.error('[VersionController] Compare versions failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to compare versions',
      error: error.message
    });
  }
};

/**
 * Restore to a specific version
 * POST /api/versions/:insightId/restore/:versionNumber
 */
exports.restoreVersion = async (req, res) => {
  try {
    const { insightId, versionNumber } = req.params;
    const userId = req.user.id;

    const result = await versioningService.restoreVersion(
      insightId,
      parseInt(versionNumber),
      userId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Version restored successfully',
      data: {
        insight: result.insight,
        newVersion: result.version
      }
    });
  } catch (error) {
    logger.error('[VersionController] Restore version failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to restore version',
      error: error.message
    });
  }
};

/**
 * Get storage usage for an insight's versions
 * GET /api/versions/:insightId/storage
 */
exports.getStorageUsage = async (req, res) => {
  try {
    const { insightId } = req.params;

    const usage = await versioningService.getStorageUsage(insightId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: usage
    });
  } catch (error) {
    logger.error('[VersionController] Get storage usage failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve storage usage',
      error: error.message
    });
  }
};

/**
 * Cleanup old versions
 * DELETE /api/versions/:insightId/cleanup
 */
exports.cleanupVersions = async (req, res) => {
  try {
    const { insightId } = req.params;
    const { keepCount = 50 } = req.query;

    const deletedCount = await versioningService.cleanupOldVersions(
      insightId,
      parseInt(keepCount)
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Deleted ${deletedCount} old versions`,
      data: { deletedCount }
    });
  } catch (error) {
    logger.error('[VersionController] Cleanup versions failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to cleanup versions',
      error: error.message
    });
  }
};

/**
 * Batch cleanup (admin only)
 * POST /api/versions/batch-cleanup
 */
exports.batchCleanup = async (req, res) => {
  try {
    const { keepCount = 50 } = req.body;

    const result = await versioningService.batchCleanup(parseInt(keepCount));

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Batch cleanup completed',
      data: result
    });
  } catch (error) {
    logger.error('[VersionController] Batch cleanup failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to perform batch cleanup',
      error: error.message
    });
  }
};
