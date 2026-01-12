const express = require('express');
const router = express.Router();
const superadminController = require('../controllers/superadminController');
const auditLogController = require('../controllers/auditLogController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { ROLES } = require('../constants');
const {
  createAdminValidation,
  updateUserRoleValidation,
  paginationValidation
} = require('../middleware/validation');

// All routes require authentication and superadmin role only
router.use(authenticateToken);
router.use(authorizeRoles(ROLES.SUPERADMIN));

// User management
router.get('/users', paginationValidation, superadminController.getAllUsers);
router.post('/admins', createAdminValidation, superadminController.createAdmin);
router.patch('/users/:userId/role', updateUserRoleValidation, superadminController.updateUserRole);
router.post('/users/:userId/suspend', superadminController.suspendUser);
router.post('/users/:userId/unsuspend', superadminController.unsuspendUser);
router.delete('/users/:userId', superadminController.hardDeleteUser);
router.post('/users/bulk', superadminController.bulkUserOperations);

// System statistics
router.get('/system/stats', superadminController.getSystemStats);
router.get('/system/config', superadminController.getSystemConfiguration);
router.get('/system/info', superadminController.getSystemInfo);
router.get('/system/health', superadminController.getHealthStatus);

// Database management
router.get('/database/stats', superadminController.getDatabaseStats);
router.get('/database/analysis', superadminController.getCollectionAnalysis);
router.post('/database/maintenance', superadminController.performDatabaseMaintenance);

// Performance monitoring
router.get('/performance/metrics', superadminController.getPerformanceMetrics);
router.get('/performance/realtime', superadminController.getRealTimeMetrics);
router.get('/performance/endpoints', superadminController.getEndpointStats);
router.post('/performance/reset', superadminController.resetMetrics);

// Job queue management
router.post('/jobs/clear-failed', superadminController.clearFailedJobs);
router.post('/jobs/retry-failed', superadminController.retryFailedJobs);

// Audit logs (superadmin only)
router.get('/audit-logs', paginationValidation, superadminController.getAuditLogs);
router.get('/audit-logs/stats', auditLogController.getAuditStats);
router.get('/audit-logs/critical', auditLogController.getCriticalEvents);
router.get('/audit-logs/failures', auditLogController.getFailedOperations);
router.get('/audit-logs/user/:userId', paginationValidation, auditLogController.getUserAuditTrail);
router.get('/audit-logs/resource/:resourceId', paginationValidation, auditLogController.getResourceAuditTrail);

module.exports = router;
