const User = require('../models/User');
const { getPaginationParams, getPaginationMeta } = require('../utils/pagination');
const { HTTP_STATUS, SUCCESS_MESSAGES, ERROR_MESSAGES, AUDIT_ACTIONS } = require('../constants');
const AuditLogger = require('../utils/auditLogger');

class AdminController {
  async getAllUsers(req, res, next) {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);

      // SECURITY FIX: Validate role filter against allowed enum values
      const { ROLES } = require('../constants');
      const validRoles = Object.values(ROLES);

      // Filters with validation
      const filter = {};
      if (req.query.role) {
        // Prevent NoSQL injection via role parameter
        if (!validRoles.includes(req.query.role)) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Invalid role filter',
            validRoles
          });
        }
        filter.role = req.query.role;
      }
      if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

      // Advanced search (case-insensitive regex on name or email)
      if (req.query.search) {
        const searchRegex = new RegExp(req.query.search, 'i');
        filter.$or = [
          { name: searchRegex },
          { email: searchRegex }
        ];
      }

      const [users, total] = await Promise.all([
        User.find(filter)
          .select('-password')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(filter)
      ]);

      // Transform _id to id for frontend compatibility
      const transformedUsers = users.map(user => ({
        ...user,
        id: user._id.toString(),
        _id: undefined
      }));

      const pagination = getPaginationMeta(total, page, limit);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Users retrieved successfully',
        data: {
          users: transformedUsers,
          pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async updateUserStatus(req, res, next) {
    try {
      const { userId } = req.params;
      const { isActive } = req.body;

      // Get current user state for audit log
      const currentUser = await User.findById(userId).select('-password');

      if (!currentUser) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.USER_NOT_FOUND
        });
      }

      const wasActive = currentUser.isActive;

      // Update user
      const user = await User.findByIdAndUpdate(
        userId,
        { isActive },
        { new: true, runValidators: true }
      ).select('-password');

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: isActive ? AUDIT_ACTIONS.USER_ACTIVATED : AUDIT_ACTIONS.USER_SUSPENDED,
        target: {
          resourceType: 'User',
          resourceId: userId,
          resourceName: user.email
        },
        changes: {
          before: { isActive: wasActive },
          after: { isActive }
        },
        metadata: {
          reason: req.body.reason || 'No reason provided'
        }
      });

      // Transform _id to id for frontend compatibility
      const userResponse = user.toObject();
      userResponse.id = userResponse._id.toString();
      delete userResponse._id;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.STATUS_UPDATED,
        data: { user: userResponse }
      });
    } catch (error) {
      next(error);
    }
  }

  async getDashboardStats(req, res, next) {
    try {
      // Single aggregation query instead of multiple counts
      const stats = await User.aggregate([
        {
          $facet: {
            totalByRole: [
              {
                $group: {
                  _id: '$role',
                  count: { $sum: 1 }
                }
              }
            ],
            totalByStatus: [
              {
                $group: {
                  _id: '$isActive',
                  count: { $sum: 1 }
                }
              }
            ],
            totalUsers: [
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 }
                }
              }
            ],
            recentUsers: [
              { $sort: { createdAt: -1 } },
              { $limit: 5 },
              {
                $project: {
                  name: 1,
                  email: 1,
                  role: 1,
                  createdAt: 1
                }
              }
            ]
          }
        }
      ]);

      const result = stats[0];

      // Process aggregation results
      const roleStats = {};
      result.totalByRole.forEach(item => {
        roleStats[item._id] = item.count;
      });

      const activeUsers = result.totalByStatus.find(s => s._id === true)?.count || 0;
      const inactiveUsers = result.totalByStatus.find(s => s._id === false)?.count || 0;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Admin dashboard stats',
        data: {
          totalUsers: result.totalUsers[0]?.count || 0,
          activeUsers,
          inactiveUsers,
          roleStats,
          recentUsers: result.recentUsers
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk suspend users
   * POST /api/admin/users/bulk-suspend
   */
  async bulkSuspendUsers(req, res, next) {
    try {
      const { userIds, reason } = req.body;

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'User IDs array is required'
        });
      }

      // Prevent suspending superadmins
      const users = await User.find({ _id: { $in: userIds } });
      const superadminIds = users
        .filter(u => u.role === 'superadmin')
        .map(u => u._id.toString());

      if (superadminIds.length > 0) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: 'Cannot suspend superadmin users',
          data: { superadminIds }
        });
      }

      // Bulk update
      const result = await User.updateMany(
        { _id: { $in: userIds }, role: { $ne: 'superadmin' } },
        { isActive: false }
      );

      // Audit log for each user
      const auditPromises = users
        .filter(u => u.role !== 'superadmin')
        .map(user =>
          AuditLogger.logFromRequest(req, {
            action: AUDIT_ACTIONS.USER_SUSPENDED,
            target: {
              resourceType: 'User',
              resourceId: user._id,
              resourceName: user.email
            },
            changes: {
              before: { isActive: user.isActive },
              after: { isActive: false }
            },
            metadata: {
              severity: 'high',
              reason: reason || 'Bulk suspension',
              bulkOperation: true
            }
          })
        );

      await Promise.all(auditPromises);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Users suspended successfully',
        data: {
          modifiedCount: result.modifiedCount,
          requestedCount: userIds.length,
          skippedSuperadmins: superadminIds.length
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk activate users
   * POST /api/admin/users/bulk-activate
   */
  async bulkActivateUsers(req, res, next) {
    try {
      const { userIds, reason } = req.body;

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'User IDs array is required'
        });
      }

      // Get users for audit logging
      const users = await User.find({ _id: { $in: userIds } });

      // Bulk update
      const result = await User.updateMany(
        { _id: { $in: userIds } },
        { isActive: true }
      );

      // Audit log for each user
      const auditPromises = users.map(user =>
        AuditLogger.logFromRequest(req, {
          action: AUDIT_ACTIONS.USER_ACTIVATED,
          target: {
            resourceType: 'User',
            resourceId: user._id,
            resourceName: user.email
          },
          changes: {
            before: { isActive: user.isActive },
            after: { isActive: true }
          },
          metadata: {
            severity: 'medium',
            reason: reason || 'Bulk activation',
            bulkOperation: true
          }
        })
      );

      await Promise.all(auditPromises);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Users activated successfully',
        data: {
          modifiedCount: result.modifiedCount,
          requestedCount: userIds.length
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk delete users
   * POST /api/admin/users/bulk-delete
   */
  async bulkDeleteUsers(req, res, next) {
    try {
      const { userIds, reason } = req.body;

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'User IDs array is required'
        });
      }

      // Prevent deleting superadmins and self
      const users = await User.find({ _id: { $in: userIds } });
      const superadminIds = users
        .filter(u => u.role === 'superadmin')
        .map(u => u._id.toString());

      // Prevent self-deletion
      const selfId = req.user.id.toString();
      if (userIds.includes(selfId)) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.CANNOT_DELETE_SELF
        });
      }

      if (superadminIds.length > 0) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.CANNOT_DELETE_SUPERADMIN,
          data: { superadminIds }
        });
      }

      // Audit log BEFORE deletion (to capture user data)
      const auditPromises = users
        .filter(u => u.role !== 'superadmin' && u._id.toString() !== selfId)
        .map(user =>
          AuditLogger.logFromRequest(req, {
            action: AUDIT_ACTIONS.USER_DELETED,
            target: {
              resourceType: 'User',
              resourceId: user._id,
              resourceName: user.email
            },
            changes: {
              before: {
                name: user.name,
                email: user.email,
                role: user.role
              }
            },
            metadata: {
              severity: 'critical',
              reason: reason || 'Bulk deletion',
              bulkOperation: true
            }
          })
        );

      await Promise.all(auditPromises);

      // Bulk delete
      const result = await User.deleteMany({
        _id: { $in: userIds },
        role: { $ne: 'superadmin' },
        _id: { $ne: req.user.id }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Users deleted successfully',
        data: {
          deletedCount: result.deletedCount,
          requestedCount: userIds.length,
          skippedSuperadmins: superadminIds.length,
          skippedSelf: userIds.includes(selfId) ? 1 : 0
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new user
   * POST /api/admin/users
   */
  async createUser(req, res, next) {
    try {
      const { name, email, password, role } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          message: 'User with this email already exists'
        });
      }

      // Validate role
      const { ROLES } = require('../constants');
      const validRoles = Object.values(ROLES);
      if (role && !validRoles.includes(role)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Invalid role',
          validRoles
        });
      }

      // Create user
      const user = new User({
        name,
        email,
        password, // Will be hashed by pre-save middleware
        role: role || ROLES.USER,
        isActive: true
      });

      await user.save();

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.USER_CREATED,
        target: {
          resourceType: 'User',
          resourceId: user._id,
          resourceName: user.email
        },
        changes: {
          after: {
            name: user.name,
            email: user.email,
            role: user.role
          }
        },
        metadata: {
          severity: 'medium',
          reason: 'User created by admin'
        }
      });

      // Return user without password and transform _id to id
      const userResponse = user.toObject();
      delete userResponse.password;
      userResponse.id = userResponse._id.toString();
      delete userResponse._id;

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'User created successfully',
        data: { user: userResponse }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a user
   * PATCH /api/admin/users/:userId
   */
  async updateUser(req, res, next) {
    try {
      const { userId } = req.params;
      const { name, email, role } = req.body;

      // Get current user for audit log
      const currentUser = await User.findById(userId).select('-password');

      if (!currentUser) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.USER_NOT_FOUND
        });
      }

      // Prevent modifying superadmin
      if (currentUser.role === 'superadmin') {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: 'Cannot modify superadmin user'
        });
      }

      // Validate role if provided
      if (role) {
        const { ROLES } = require('../constants');
        const validRoles = Object.values(ROLES);
        if (!validRoles.includes(role)) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Invalid role',
            validRoles
          });
        }
      }

      // Check if email is being changed and already exists
      if (email && email !== currentUser.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return res.status(HTTP_STATUS.CONFLICT).json({
            success: false,
            message: 'User with this email already exists'
          });
        }
      }

      // Prepare update data
      const updateData = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (role) updateData.role = role;

      // Update user
      const user = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.USER_UPDATED,
        target: {
          resourceType: 'User',
          resourceId: userId,
          resourceName: user.email
        },
        changes: {
          before: {
            name: currentUser.name,
            email: currentUser.email,
            role: currentUser.role
          },
          after: {
            name: user.name,
            email: user.email,
            role: user.role
          }
        },
        metadata: {
          severity: 'medium',
          reason: 'User updated by admin'
        }
      });

      // Transform _id to id for frontend compatibility
      const userResponse = user.toObject();
      userResponse.id = userResponse._id.toString();
      delete userResponse._id;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'User updated successfully',
        data: { user: userResponse }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a single user
   * DELETE /api/admin/users/:userId
   */
  async deleteUser(req, res, next) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;

      // Get user before deletion
      const user = await User.findById(userId).select('-password');

      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.USER_NOT_FOUND
        });
      }

      // Prevent deleting superadmin
      if (user.role === 'superadmin') {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.CANNOT_DELETE_SUPERADMIN
        });
      }

      // Prevent self-deletion
      if (userId === req.user.id.toString()) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.CANNOT_DELETE_SELF
        });
      }

      // Audit log BEFORE deletion
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.USER_DELETED,
        target: {
          resourceType: 'User',
          resourceId: userId,
          resourceName: user.email
        },
        changes: {
          before: {
            name: user.name,
            email: user.email,
            role: user.role
          }
        },
        metadata: {
          severity: 'critical',
          reason: reason || 'User deleted by admin'
        }
      });

      // Delete user
      await User.findByIdAndDelete(userId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminController();
