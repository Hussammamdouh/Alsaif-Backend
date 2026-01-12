const AccountSecurity = require('../models/AccountSecurity');
const User = require('../models/User');
const { HTTP_STATUS, AUDIT_ACTIONS } = require('../constants');
const { getPaginationParams, getPaginationMeta } = require('../utils/pagination');
const AuditLogger = require('../utils/auditLogger');

/**
 * Abuse Management Controller
 *
 * Purpose: Admin endpoints for managing abuse, locks, and security
 * Access: Admin and Superadmin
 */

class AbuseController {
  /**
   * Get all locked accounts
   * GET /api/admin/abuse/locked
   */
  async getLockedAccounts(req, res, next) {
    try {
      const accounts = await AccountSecurity.getLockedAccounts();

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Locked accounts retrieved successfully',
        data: {
          accounts,
          total: accounts.length
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get accounts with spam flags
   * GET /api/admin/abuse/spam
   */
  async getSpamAccounts(req, res, next) {
    try {
      const threshold = parseInt(req.query.threshold) || 2;
      const accounts = await AccountSecurity.getSpamAccounts(threshold);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Spam accounts retrieved successfully',
        data: {
          accounts,
          total: accounts.length,
          threshold
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get accounts with suspicious activity
   * GET /api/admin/abuse/suspicious
   */
  async getSuspiciousAccounts(req, res, next) {
    try {
      const accounts = await AccountSecurity.getSuspiciousAccounts();

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Suspicious accounts retrieved successfully',
        data: {
          accounts,
          total: accounts.length
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get security details for a specific user
   * GET /api/admin/abuse/user/:userId
   */
  async getUserSecurityDetails(req, res, next) {
    try {
      const { userId } = req.params;

      const security = await AccountSecurity.findOne({ user: userId })
        .populate('user', 'name email role isActive')
        .populate('locked.lockedBy', 'name email role')
        .populate('interventions.admin', 'name email role');

      if (!security) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'No security record found for this user'
        });
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'User security details retrieved successfully',
        data: {
          security
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Manually lock a user account
   * POST /api/admin/abuse/lock/:userId
   */
  async lockUserAccount(req, res, next) {
    try {
      const { userId } = req.params;
      const { reason, durationMinutes, notes } = req.body;

      // Validate user exists
      const user = await User.findById(userId);
      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'User not found'
        });
      }

      // Prevent locking superadmins
      if (user.role === 'superadmin') {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: 'Cannot lock superadmin accounts'
        });
      }

      // Get or create security record
      const security = await AccountSecurity.getOrCreate(userId);

      // Lock the account
      await security.lockAccount(
        reason || 'MANUAL_ADMIN',
        req.user.id,
        durationMinutes
      );

      // Add intervention record
      await security.addIntervention(
        req.user.id,
        'LOCKED',
        reason || 'Manual lock by admin',
        notes
      );

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.ACCOUNT_LOCKED,
        target: {
          resourceType: 'User',
          resourceId: userId,
          resourceName: user.email
        },
        metadata: {
          severity: 'high',
          reason: reason || 'Manual lock',
          notes,
          durationMinutes
        }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Account locked successfully',
        data: {
          user: {
            id: user._id,
            email: user.email
          },
          locked: true,
          lockedUntil: security.locked.lockedUntil
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Manually unlock a user account
   * POST /api/admin/abuse/unlock/:userId
   */
  async unlockUserAccount(req, res, next) {
    try {
      const { userId } = req.params;
      const { notes } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'User not found'
        });
      }

      const security = await AccountSecurity.findOne({ user: userId });
      if (!security || !security.locked.isLocked) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Account is not locked'
        });
      }

      // Unlock the account
      await security.unlockAccount(req.user.id);

      // Add intervention record
      await security.addIntervention(
        req.user.id,
        'UNLOCKED',
        'Manual unlock by admin',
        notes
      );

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.ACCOUNT_UNLOCKED,
        target: {
          resourceType: 'User',
          resourceId: userId,
          resourceName: user.email
        },
        metadata: {
          severity: 'medium',
          notes
        }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Account unlocked successfully',
        data: {
          user: {
            id: user._id,
            email: user.email
          },
          locked: false
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Clear spam flags for a user
   * POST /api/admin/abuse/clear-spam/:userId
   */
  async clearSpamFlags(req, res, next) {
    try {
      const { userId } = req.params;
      const { notes } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'User not found'
        });
      }

      const security = await AccountSecurity.findOne({ user: userId });
      if (!security) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'No security record found'
        });
      }

      const previousFlags = security.messageSpam.spamFlags;

      // Clear spam flags
      security.messageSpam.spamFlags = 0;
      security.messageSpam.lastSpamFlagTime = null;
      await security.save();

      // Add intervention record
      await security.addIntervention(
        req.user.id,
        'SPAM_FLAG_CLEARED',
        `Cleared ${previousFlags} spam flags`,
        notes
      );

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.SPAM_DETECTED,
        target: {
          resourceType: 'User',
          resourceId: userId,
          resourceName: user.email
        },
        metadata: {
          severity: 'medium',
          notes,
          previousFlags
        }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Spam flags cleared successfully',
        data: {
          user: {
            id: user._id,
            email: user.email
          },
          previousFlags,
          currentFlags: 0
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reset failed login attempts for a user
   * POST /api/admin/abuse/reset-failures/:userId
   */
  async resetFailedLogins(req, res, next) {
    try {
      const { userId } = req.params;
      const { notes } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'User not found'
        });
      }

      const security = await AccountSecurity.findOne({ user: userId });
      if (!security) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'No security record found'
        });
      }

      const previousCount = security.failedLoginAttempts.count;

      // Reset failed logins
      await security.resetFailedLogins();

      // Add intervention record
      await security.addIntervention(
        req.user.id,
        'SECURITY_REVIEW',
        `Reset ${previousCount} failed login attempts`,
        notes
      );

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Failed login attempts reset successfully',
        data: {
          user: {
            id: user._id,
            email: user.email
          },
          previousCount,
          currentCount: 0
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get abuse statistics
   * GET /api/admin/abuse/stats
   */
  async getAbuseStats(req, res, next) {
    try {
      const AccountSecurity = require('../models/AccountSecurity');

      const stats = await AccountSecurity.aggregate([
        {
          $facet: {
            lockedAccounts: [
              { $match: { 'locked.isLocked': true } },
              { $count: 'count' }
            ],
            spamAccounts: [
              { $match: { 'messageSpam.spamFlags': { $gte: 1 } } },
              { $count: 'count' }
            ],
            suspiciousAccounts: [
              { $match: { $expr: { $gte: [{ $size: '$suspiciousActivity' }, 1] } } },
              { $count: 'count' }
            ],
            highFailedLogins: [
              { $match: { 'failedLoginAttempts.count': { $gte: 5 } } },
              { $count: 'count' }
            ]
          }
        }
      ]);

      const result = stats[0];

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Abuse statistics retrieved successfully',
        data: {
          locked: result.lockedAccounts[0]?.count || 0,
          spam: result.spamAccounts[0]?.count || 0,
          suspicious: result.suspiciousAccounts[0]?.count || 0,
          highFailedLogins: result.highFailedLogins[0]?.count || 0
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AbuseController();
