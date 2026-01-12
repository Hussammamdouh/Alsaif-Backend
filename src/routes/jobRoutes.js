const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { adminAnalyticsLimiter } = require('../middleware/advancedRateLimit');
const { ROLES } = require('../constants');

/**
 * Job Routes (Admin only)
 *
 * Endpoints for job queue management and monitoring
 * SECURITY: Admin analytics endpoints protected with stricter rate limiting
 */

/**
 * @route   GET /api/admin/jobs/stats
 * @desc    Get job statistics
 * @access  Private (Admin, Superadmin)
 * @security Rate limited: 50 req/15min (admins), 100 req/15min (superadmins)
 */
router.get(
  '/stats',
  authenticateToken,
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN),
  adminAnalyticsLimiter,
  jobController.getJobStats
);

/**
 * @route   GET /api/admin/jobs
 * @desc    Get jobs with filters
 * @access  Private (Admin, Superadmin)
 * @security Rate limited: 50 req/15min (admins), 100 req/15min (superadmins)
 */
router.get(
  '/',
  authenticateToken,
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN),
  adminAnalyticsLimiter,
  jobController.getJobs
);

/**
 * @route   GET /api/admin/jobs/dead-letter-queue
 * @desc    Get dead letter queue (failed jobs)
 * @access  Private (Admin, Superadmin)
 * @security Rate limited: 50 req/15min (admins), 100 req/15min (superadmins)
 */
router.get(
  '/dead-letter-queue',
  authenticateToken,
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN),
  adminAnalyticsLimiter,
  jobController.getDeadLetterQueue
);

/**
 * @route   POST /api/admin/jobs/:jobId/retry
 * @desc    Retry a dead/failed job
 * @access  Private (Admin, Superadmin)
 */
router.post(
  '/:jobId/retry',
  authenticateToken,
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN),
  jobController.retryJob
);

/**
 * @route   DELETE /api/admin/jobs/cleanup
 * @desc    Cleanup old completed jobs
 * @access  Private (Admin, Superadmin)
 */
router.delete(
  '/cleanup',
  authenticateToken,
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN),
  jobController.cleanupJobs
);

/**
 * @route   POST /api/admin/jobs/test
 * @desc    Create a test job
 * @access  Private (Admin, Superadmin)
 */
router.post(
  '/test',
  authenticateToken,
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN),
  jobController.createTestJob
);

module.exports = router;
