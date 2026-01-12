/**
 * Superadmin Controller
 */

const superadminService = require('../services/superadminService');
const performanceMonitoringService = require('../services/performanceMonitoringService');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');

exports.getAllUsers = async (req, res) => {
  try {
    const { page, limit, role, status, search, sortBy, sortOrder } = req.query;
    const result = await superadminService.getAllUsers({ page: parseInt(page) || 1, limit: parseInt(limit) || 50, role, status, search, sortBy, sortOrder });
    res.status(HTTP_STATUS.OK).json({ success: true, data: result.users, pagination: result.pagination });
  } catch (error) {
    logger.error('[SuperadminController] Failed to get all users:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: 'Failed to get users' });
  }
};

exports.createAdmin = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Name, email, and password are required' });
    const admin = await superadminService.createAdmin({ name, email, password, role: role || 'admin' });
    res.status(HTTP_STATUS.CREATED).json({ success: true, message: 'Admin created successfully', data: admin });
  } catch (error) {
    logger.error('[SuperadminController] Failed to create admin:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: error.message || 'Failed to create admin' });
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    if (!role) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Role is required' });
    const user = await superadminService.updateUserRole(userId, role);
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'User role updated successfully', data: user });
  } catch (error) {
    logger.error('[SuperadminController] Failed to update user role:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: error.message || 'Failed to update user role' });
  }
};

exports.suspendUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const user = await superadminService.suspendUser(userId, reason);
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'User suspended successfully', data: user });
  } catch (error) {
    logger.error('[SuperadminController] Failed to suspend user:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: error.message || 'Failed to suspend user' });
  }
};

exports.unsuspendUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await superadminService.unsuspendUser(userId);
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'User unsuspended successfully', data: user });
  } catch (error) {
    logger.error('[SuperadminController] Failed to unsuspend user:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: error.message || 'Failed to unsuspend user' });
  }
};

exports.hardDeleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    await superadminService.hardDeleteUser(userId);
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'User permanently deleted' });
  } catch (error) {
    logger.error('[SuperadminController] Failed to delete user:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: error.message || 'Failed to delete user' });
  }
};

exports.bulkUserOperations = async (req, res) => {
  try {
    const { userIds, operation, data } = req.body;
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'userIds array is required' });
    if (!operation) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'operation is required' });
    const result = await superadminService.bulkUpdateUsers(userIds, operation, data);
    res.status(HTTP_STATUS.OK).json({ success: true, message: `Bulk operation completed: ${result.success} successful, ${result.failed} failed`, data: result });
  } catch (error) {
    logger.error('[SuperadminController] Bulk operation failed:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: error.message || 'Bulk operation failed' });
  }
};

exports.getSystemStats = async (req, res) => {
  try {
    const stats = await superadminService.getSystemStats();
    res.status(HTTP_STATUS.OK).json({ success: true, data: stats });
  } catch (error) {
    logger.error('[SuperadminController] Failed to get system stats:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: 'Failed to get system statistics' });
  }
};

exports.getDatabaseStats = async (req, res) => {
  try {
    const stats = await superadminService.getDatabaseStats();
    res.status(HTTP_STATUS.OK).json({ success: true, data: stats });
  } catch (error) {
    logger.error('[SuperadminController] Failed to get database stats:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: 'Failed to get database statistics' });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const { page, limit, action, userId, resource, startDate, endDate, severity } = req.query;
    const result = await superadminService.getAuditLogs({ page: parseInt(page) || 1, limit: parseInt(limit) || 100, action, userId, resource, startDate, endDate, severity });
    res.status(HTTP_STATUS.OK).json({ success: true, data: result.logs, pagination: result.pagination });
  } catch (error) {
    logger.error('[SuperadminController] Failed to get audit logs:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: 'Failed to get audit logs' });
  }
};

exports.clearFailedJobs = async (req, res) => {
  try {
    const result = await superadminService.clearFailedJobs();
    res.status(HTTP_STATUS.OK).json({ success: true, message: `Cleared ${result.deletedCount} failed jobs`, data: result });
  } catch (error) {
    logger.error('[SuperadminController] Failed to clear failed jobs:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: 'Failed to clear failed jobs' });
  }
};

exports.retryFailedJobs = async (req, res) => {
  try {
    const result = await superadminService.retryFailedJobs();
    res.status(HTTP_STATUS.OK).json({ success: true, message: `Retried ${result.retriedCount} failed jobs`, data: result });
  } catch (error) {
    logger.error('[SuperadminController] Failed to retry jobs:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: 'Failed to retry failed jobs' });
  }
};

exports.getSystemConfiguration = async (req, res) => {
  try {
    const config = await superadminService.getSystemConfiguration();
    res.status(HTTP_STATUS.OK).json({ success: true, data: config });
  } catch (error) {
    logger.error('[SuperadminController] Failed to get system configuration:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: 'Failed to get system configuration' });
  }
};

exports.performDatabaseMaintenance = async (req, res) => {
  try {
    const result = await superadminService.performDatabaseMaintenance();
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'Database maintenance completed', data: result });
  } catch (error) {
    logger.error('[SuperadminController] Database maintenance failed:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: 'Database maintenance failed' });
  }
};

exports.getCollectionAnalysis = async (req, res) => {
  try {
    const analysis = await superadminService.getCollectionAnalysis();
    res.status(HTTP_STATUS.OK).json({ success: true, data: analysis });
  } catch (error) {
    logger.error('[SuperadminController] Collection analysis failed:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: 'Collection analysis failed' });
  }
};

exports.getPerformanceMetrics = async (req, res) => {
  try {
    const metrics = performanceMonitoringService.getMetrics();
    res.status(HTTP_STATUS.OK).json({ success: true, data: metrics });
  } catch (error) {
    logger.error('[SuperadminController] Failed to get performance metrics:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: 'Failed to get performance metrics' });
  }
};

exports.getSystemInfo = async (req, res) => {
  try {
    const info = performanceMonitoringService.getSystemInfo();
    res.status(HTTP_STATUS.OK).json({ success: true, data: info });
  } catch (error) {
    logger.error('[SuperadminController] Failed to get system info:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: 'Failed to get system information' });
  }
};

exports.getHealthStatus = async (req, res) => {
  try {
    const health = performanceMonitoringService.getHealthStatus();
    res.status(HTTP_STATUS.OK).json({ success: true, data: health });
  } catch (error) {
    logger.error('[SuperadminController] Failed to get health status:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: 'Failed to get health status' });
  }
};

exports.getEndpointStats = async (req, res) => {
  try {
    const stats = performanceMonitoringService.getEndpointStats();
    res.status(HTTP_STATUS.OK).json({ success: true, data: stats });
  } catch (error) {
    logger.error('[SuperadminController] Failed to get endpoint stats:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: 'Failed to get endpoint statistics' });
  }
};

exports.getRealTimeMetrics = async (req, res) => {
  try {
    const metrics = performanceMonitoringService.getRealTimeMetrics();
    res.status(HTTP_STATUS.OK).json({ success: true, data: metrics });
  } catch (error) {
    logger.error('[SuperadminController] Failed to get real-time metrics:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: 'Failed to get real-time metrics' });
  }
};

exports.resetMetrics = async (req, res) => {
  try {
    performanceMonitoringService.reset();
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'Performance metrics reset successfully' });
  } catch (error) {
    logger.error('[SuperadminController] Failed to reset metrics:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({ success: false, message: 'Failed to reset metrics' });
  }
};
