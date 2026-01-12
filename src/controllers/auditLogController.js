const AuditLogger = require('../utils/auditLogger');
const { HTTP_STATUS } = require('../constants');
const { getPaginationParams } = require('../utils/pagination');

/**
 * Audit Log Controller
 *
 * Purpose: Superadmin-only endpoints for viewing audit logs
 * Security: Only accessible by superadmin role
 */

class AuditLogController {
  /**
   * Get all audit logs with filters
   * GET /api/superadmin/audit-logs
   */
  async getAuditLogs(req, res, next) {
    try {
      const { page, limit } = getPaginationParams(req.query);

      const filters = {
        actorId: req.query.actorId,
        action: req.query.action,
        resourceType: req.query.resourceType,
        resourceId: req.query.resourceId,
        severity: req.query.severity,
        status: req.query.status,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      };

      // Remove undefined values
      Object.keys(filters).forEach(key =>
        filters[key] === undefined && delete filters[key]
      );

      const result = await AuditLogger.query(filters, { page, limit });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Audit logs retrieved successfully',
        data: {
          logs: result.logs,
          pagination: result.pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get audit logs for a specific user
   * GET /api/superadmin/audit-logs/user/:userId
   */
  async getUserAuditTrail(req, res, next) {
    try {
      const { userId } = req.params;
      const { page, limit } = getPaginationParams(req.query);

      const result = await AuditLogger.getUserAuditTrail(userId, { page, limit });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'User audit trail retrieved successfully',
        data: {
          userId,
          logs: result.logs,
          pagination: result.pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get audit logs for a specific resource
   * GET /api/superadmin/audit-logs/resource/:resourceId
   */
  async getResourceAuditTrail(req, res, next) {
    try {
      const { resourceId } = req.params;
      const { page, limit } = getPaginationParams(req.query);

      const result = await AuditLogger.getResourceAuditTrail(resourceId, { page, limit });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Resource audit trail retrieved successfully',
        data: {
          resourceId,
          logs: result.logs,
          pagination: result.pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get recent critical events
   * GET /api/superadmin/audit-logs/critical
   */
  async getCriticalEvents(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 100;

      const result = await AuditLogger.getCriticalEvents(limit);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Critical events retrieved successfully',
        data: {
          logs: result.logs,
          total: result.logs.length
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get failed operations
   * GET /api/superadmin/audit-logs/failures
   */
  async getFailedOperations(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 100;

      const result = await AuditLogger.getFailedOperations(limit);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Failed operations retrieved successfully',
        data: {
          logs: result.logs,
          total: result.logs.length
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get audit log statistics
   * GET /api/superadmin/audit-logs/stats
   */
  async getAuditStats(req, res, next) {
    try {
      const AuditLog = require('../models/AuditLog');

      const stats = await AuditLog.aggregate([
        {
          $facet: {
            totalByAction: [
              {
                $group: {
                  _id: '$action',
                  count: { $sum: 1 }
                }
              },
              { $sort: { count: -1 } },
              { $limit: 10 }
            ],
            totalBySeverity: [
              {
                $group: {
                  _id: '$metadata.severity',
                  count: { $sum: 1 }
                }
              }
            ],
            totalByStatus: [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 }
                }
              }
            ],
            recentActivity: [
              { $sort: { createdAt: -1 } },
              { $limit: 10 },
              {
                $project: {
                  action: 1,
                  'actor.email': 1,
                  'target.resourceName': 1,
                  createdAt: 1,
                  status: 1,
                  'metadata.severity': 1
                }
              }
            ],
            totalLogs: [
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 }
                }
              }
            ]
          }
        }
      ]);

      const result = stats[0];

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Audit log statistics retrieved successfully',
        data: {
          total: result.totalLogs[0]?.count || 0,
          byAction: result.totalByAction,
          bySeverity: result.totalBySeverity,
          byStatus: result.totalByStatus,
          recentActivity: result.recentActivity
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuditLogController();
