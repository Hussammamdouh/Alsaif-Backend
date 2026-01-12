const AuditLog = require('../models/AuditLog');
const logger = require('./logger');

/**
 * Audit Logger Utility
 *
 * Purpose: Centralized audit logging for all sensitive operations
 * Usage: Import and call logAudit() with action details
 */

class AuditLogger {
  /**
   * Log an audit event
   * @param {Object} params - Audit log parameters
   * @param {Object} params.actor - Who performed the action
   * @param {string} params.action - Action type (from AuditLog enum)
   * @param {Object} params.target - What was affected
   * @param {Object} params.changes - Before/after state
   * @param {Object} params.metadata - Additional context
   * @param {Object} params.request - HTTP request details
   * @param {string} params.status - success/failure/partial
   * @param {Object} params.error - Error details if failed
   */
  static async log({
    actor,
    action,
    target,
    changes = {},
    metadata = {},
    request = {},
    status = 'success',
    error = null
  }) {
    try {
      // Sanitize request body (remove sensitive fields)
      const sanitizedRequest = this.sanitizeRequest(request);

      const auditData = {
        actor: {
          userId: actor.userId || actor.id,
          email: actor.email,
          role: actor.role,
          ip: actor.ip,
          userAgent: actor.userAgent
        },
        action,
        target: {
          resourceType: target.resourceType,
          resourceId: target.resourceId,
          resourceName: target.resourceName
        },
        changes: {
          before: changes.before || null,
          after: changes.after || null
        },
        metadata: {
          reason: metadata.reason,
          notes: metadata.notes,
          automated: metadata.automated || false,
          severity: metadata.severity || this.determineSeverity(action)
        },
        request: {
          path: sanitizedRequest.path,
          method: sanitizedRequest.method,
          query: sanitizedRequest.query,
          body: sanitizedRequest.body
        },
        status,
        error: error ? {
          message: error.message,
          code: error.code
        } : undefined
      };

      const log = await AuditLog.log(auditData);

      // Also log to winston for real-time monitoring
      if (status === 'failure' || metadata.severity === 'critical') {
        logger.warn(`[AUDIT] ${action} by ${actor.email} - ${status}`, {
          auditLogId: log._id,
          action,
          actor: actor.email,
          target: target.resourceId
        });
      }

      return log;
    } catch (err) {
      // Critical: Log audit failure but don't break the main operation
      logger.error('[AUDIT LOG FAILURE]', {
        error: err.message,
        action,
        actor: actor?.email
      });
      // Don't throw - audit log failures shouldn't break user operations
      return null;
    }
  }

  /**
   * Log from Express request object (convenience method)
   */
  static async logFromRequest(req, {
    action,
    target,
    changes,
    metadata,
    status = 'success',
    error = null
  }) {
    if (!req.user) {
      throw new Error('Cannot create audit log without authenticated user');
    }

    return this.log({
      actor: {
        userId: req.user.id,
        email: req.user.email,
        role: req.user.role,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action,
      target,
      changes,
      metadata,
      request: {
        path: req.path,
        method: req.method,
        query: req.query,
        body: req.body
      },
      status,
      error
    });
  }

  /**
   * Sanitize request data (remove sensitive fields)
   */
  static sanitizeRequest(request) {
    if (!request.body) {
      return request;
    }

    const sanitized = { ...request };
    const sensitiveFields = ['password', 'token', 'refreshToken', 'secret', 'accessToken'];

    if (sanitized.body) {
      sanitized.body = { ...sanitized.body };
      sensitiveFields.forEach(field => {
        if (sanitized.body[field]) {
          sanitized.body[field] = '[REDACTED]';
        }
      });
    }

    return sanitized;
  }

  /**
   * Determine severity based on action type
   */
  static determineSeverity(action) {
    const criticalActions = [
      'USER_DELETED',
      'ADMIN_CREATED',
      'ADMIN_REMOVED',
      'USER_ROLE_CHANGED',
      'CONFIG_UPDATED',
      'ACCOUNT_LOCKED'
    ];

    const highActions = [
      'USER_SUSPENDED',
      'USER_BANNED',
      'INSIGHT_DELETED',
      'CHAT_DELETED'
    ];

    const mediumActions = [
      'USER_CREATED',
      'USER_UPDATED',
      'USER_ACTIVATED',
      'INSIGHT_CREATED',
      'INSIGHT_UPDATED'
    ];

    if (criticalActions.includes(action)) return 'critical';
    if (highActions.includes(action)) return 'high';
    if (mediumActions.includes(action)) return 'medium';
    return 'low';
  }

  /**
   * Bulk log multiple audit events (for batch operations)
   */
  static async logBulk(auditLogs) {
    try {
      const logs = await AuditLog.insertMany(auditLogs);
      return logs;
    } catch (err) {
      logger.error('[BULK AUDIT LOG FAILURE]', {
        error: err.message,
        count: auditLogs.length
      });
      return [];
    }
  }

  /**
   * Query audit logs (superadmin only - enforce in controller)
   */
  static async query(filters, options) {
    return AuditLog.query(filters, options);
  }

  /**
   * Get audit logs for a specific user
   */
  static async getUserAuditTrail(userId, options = {}) {
    return AuditLog.query({ actorId: userId }, options);
  }

  /**
   * Get audit logs for a specific resource
   */
  static async getResourceAuditTrail(resourceId, options = {}) {
    return AuditLog.query({ resourceId }, options);
  }

  /**
   * Get recent critical events
   */
  static async getCriticalEvents(limit = 100) {
    return AuditLog.query({ severity: 'critical' }, { limit });
  }

  /**
   * Get failed operations
   */
  static async getFailedOperations(limit = 100) {
    return AuditLog.query({ status: 'failure' }, { limit });
  }
}

module.exports = AuditLogger;
