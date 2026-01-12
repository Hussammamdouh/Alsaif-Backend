/**
 * Backup Controller
 *
 * Handles backup management endpoints
 */

const backupService = require('../services/backupService');
const backupScheduler = require('../workers/backupScheduler');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');

/**
 * Create manual backup
 * POST /api/backups/create
 */
exports.createBackup = async (req, res) => {
  try {
    const { name } = req.body;

    const backup = await backupService.createBackup({ name });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Backup created successfully',
      data: backup
    });
  } catch (error) {
    logger.error('[BackupController] Create backup failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to create backup',
      error: error.message
    });
  }
};

/**
 * List all backups
 * GET /api/backups
 */
exports.listBackups = async (req, res) => {
  try {
    const backups = await backupService.listBackups();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: backups
    });
  } catch (error) {
    logger.error('[BackupController] List backups failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to list backups',
      error: error.message
    });
  }
};

/**
 * Get backup statistics
 * GET /api/backups/stats
 */
exports.getStats = async (req, res) => {
  try {
    const stats = await backupService.getBackupStats();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('[BackupController] Get stats failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve backup statistics',
      error: error.message
    });
  }
};

/**
 * Restore from backup
 * POST /api/backups/:backupName/restore
 */
exports.restoreBackup = async (req, res) => {
  try {
    const { backupName } = req.params;

    const result = await backupService.restoreBackup(backupName);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Backup restored successfully',
      data: result
    });
  } catch (error) {
    logger.error('[BackupController] Restore backup failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to restore backup',
      error: error.message
    });
  }
};

/**
 * Delete a backup
 * DELETE /api/backups/:backupName
 */
exports.deleteBackup = async (req, res) => {
  try {
    const { backupName } = req.params;

    const result = await backupService.deleteBackup(backupName);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Backup deleted successfully',
      data: result
    });
  } catch (error) {
    logger.error('[BackupController] Delete backup failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to delete backup',
      error: error.message
    });
  }
};

/**
 * Cleanup old backups
 * POST /api/backups/cleanup
 */
exports.cleanupBackups = async (req, res) => {
  try {
    const deletedCount = await backupService.cleanupOldBackups();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Cleaned up ${deletedCount} old backups`,
      data: { deletedCount }
    });
  } catch (error) {
    logger.error('[BackupController] Cleanup backups failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to cleanup backups',
      error: error.message
    });
  }
};

/**
 * Get scheduler status
 * GET /api/backups/scheduler/status
 */
exports.getSchedulerStatus = async (req, res) => {
  try {
    const status = backupScheduler.getStatus();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('[BackupController] Get scheduler status failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve scheduler status',
      error: error.message
    });
  }
};
