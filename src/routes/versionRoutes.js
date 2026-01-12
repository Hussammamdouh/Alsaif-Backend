/**
 * Version Routes
 *
 * Endpoints for content versioning
 */

const express = require('express');
const router = express.Router();
const versionController = require('../controllers/versionController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

/**
 * All version routes require authentication
 */
router.use(authenticateToken);

/**
 * @route   POST /api/versions/autosave
 * @desc    Auto-save draft version
 * @access  Private
 */
router.post('/autosave', versionController.autoSaveDraft);

/**
 * @route   GET /api/versions/:insightId/history
 * @desc    Get version history for an insight
 * @access  Private (author or admin)
 */
router.get('/:insightId/history', versionController.getHistory);

/**
 * @route   GET /api/versions/:insightId/:versionNumber
 * @desc    Get a specific version
 * @access  Private (author or admin)
 */
router.get('/:insightId/:versionNumber', versionController.getVersion);

/**
 * @route   GET /api/versions/:insightId/compare/:version1/:version2
 * @desc    Compare two versions
 * @access  Private (author or admin)
 */
router.get('/:insightId/compare/:version1/:version2', versionController.compareVersions);

/**
 * @route   POST /api/versions/:insightId/restore/:versionNumber
 * @desc    Restore to a specific version
 * @access  Private (author or admin)
 */
router.post('/:insightId/restore/:versionNumber', versionController.restoreVersion);

/**
 * @route   GET /api/versions/:insightId/storage
 * @desc    Get storage usage for insight versions
 * @access  Private (author or admin)
 */
router.get('/:insightId/storage', versionController.getStorageUsage);

/**
 * @route   DELETE /api/versions/:insightId/cleanup
 * @desc    Cleanup old versions for an insight
 * @access  Private (admin only)
 */
router.delete('/:insightId/cleanup', authorizeRoles(['admin', 'superadmin']), versionController.cleanupVersions);

/**
 * @route   POST /api/versions/batch-cleanup
 * @desc    Batch cleanup old versions for all insights
 * @access  Private (admin only)
 */
router.post('/batch-cleanup', authorizeRoles(['admin', 'superadmin']), versionController.batchCleanup);

module.exports = router;
