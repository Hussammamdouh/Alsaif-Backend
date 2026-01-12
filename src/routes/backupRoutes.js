/**
 * Backup Routes
 *
 * Endpoints for backup management
 */

const express = require('express');
const router = express.Router();
const backupController = require('../controllers/backupController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

/**
 * All backup routes require superadmin authentication
 */
router.use(authenticateToken);
router.use(authorizeRoles(['superadmin']));

/**
 * @route   POST /api/backups/create
 * @desc    Create manual backup
 * @access  Superadmin
 */
router.post('/create', backupController.createBackup);

/**
 * @route   GET /api/backups
 * @desc    List all backups
 * @access  Superadmin
 */
router.get('/', backupController.listBackups);

/**
 * @route   GET /api/backups/stats
 * @desc    Get backup statistics
 * @access  Superadmin
 */
router.get('/stats', backupController.getStats);

/**
 * @route   POST /api/backups/:backupName/restore
 * @desc    Restore from backup
 * @access  Superadmin
 */
router.post('/:backupName/restore', backupController.restoreBackup);

/**
 * @route   DELETE /api/backups/:backupName
 * @desc    Delete a backup
 * @access  Superadmin
 */
router.delete('/:backupName', backupController.deleteBackup);

/**
 * @route   POST /api/backups/cleanup
 * @desc    Cleanup old backups
 * @access  Superadmin
 */
router.post('/cleanup', backupController.cleanupBackups);

/**
 * @route   GET /api/backups/scheduler/status
 * @desc    Get scheduler status
 * @access  Superadmin
 */
router.get('/scheduler/status', backupController.getSchedulerStatus);

module.exports = router;
