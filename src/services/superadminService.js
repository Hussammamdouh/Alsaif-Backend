/**
 * Superadmin Service
 *
 * Provides system-wide control and management capabilities
 */

const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Job = require('../models/Job');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

class SuperadminService {
  /**
   * Get all users with detailed information
   */
  async getAllUsers(options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        role,
        status,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;

      const query = {};

      if (role) query.role = role;
      if (status === 'active') query.isDeleted = false;
      if (status === 'deleted') query.isDeleted = true;
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const [users, total] = await Promise.all([
        User.find(query)
          .select('-password')
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        User.countDocuments(query)
      ]);

      // Add additional metrics for each user
      const usersWithMetrics = await Promise.all(
        users.map(async (user) => {
          const [insightCount, commentCount, loginCount] = await Promise.all([
            mongoose.model('Insight').countDocuments({ author: user._id }),
            mongoose.model('Comment').countDocuments({ author: user._id }),
            AuditLog.countDocuments({
              performedBy: user._id,
              action: 'login'
            })
          ]);

          return {
            ...user,
            metrics: {
              insights: insightCount,
              comments: commentCount,
              logins: loginCount
            }
          };
        })
      );

      return {
        users: usersWithMetrics,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('[Superadmin] Failed to get all users:', error);
      throw error;
    }
  }

  /**
   * Create new admin user
   */
  async createAdmin(data) {
    try {
      const { name, email, password, role = 'admin' } = data;

      // Check if user already exists
      const existing = await User.findOne({ email });
      if (existing) {
        throw new Error('User with this email already exists');
      }

      // Validate role
      if (!['admin', 'superadmin'].includes(role)) {
        throw new Error('Invalid role. Must be admin or superadmin');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await User.create({
        name,
        email,
        password: hashedPassword,
        role,
        isDeleted: false
      });

      logger.info('[Superadmin] Created new admin user:', {
        userId: user._id,
        email: user.email,
        role: user.role
      });

      return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      };
    } catch (error) {
      logger.error('[Superadmin] Failed to create admin:', error);
      throw error;
    }
  }

  /**
   * Update user role
   */
  async updateUserRole(userId, newRole) {
    try {
      const validRoles = ['user', 'admin', 'superadmin'];
      if (!validRoles.includes(newRole)) {
        throw new Error('Invalid role');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const oldRole = user.role;
      user.role = newRole;
      await user.save();

      logger.info('[Superadmin] Updated user role:', {
        userId,
        oldRole,
        newRole
      });

      return user;
    } catch (error) {
      logger.error('[Superadmin] Failed to update user role:', error);
      throw error;
    }
  }

  /**
   * Suspend user account
   */
  async suspendUser(userId, reason) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (user.role === 'superadmin') {
        throw new Error('Cannot suspend superadmin users');
      }

      user.isSuspended = true;
      user.suspensionReason = reason;
      user.suspendedAt = new Date();
      await user.save();

      logger.info('[Superadmin] Suspended user:', { userId, reason });

      return user;
    } catch (error) {
      logger.error('[Superadmin] Failed to suspend user:', error);
      throw error;
    }
  }

  /**
   * Unsuspend user account
   */
  async unsuspendUser(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      user.isSuspended = false;
      user.suspensionReason = null;
      user.suspendedAt = null;
      await user.save();

      logger.info('[Superadmin] Unsuspended user:', { userId });

      return user;
    } catch (error) {
      logger.error('[Superadmin] Failed to unsuspend user:', error);
      throw error;
    }
  }

  /**
   * Hard delete user (permanent)
   */
  async hardDeleteUser(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (user.role === 'superadmin') {
        throw new Error('Cannot delete superadmin users');
      }

      // Delete user's data
      await Promise.all([
        mongoose.model('Insight').deleteMany({ author: userId }),
        mongoose.model('Comment').deleteMany({ author: userId }),
        mongoose.model('Notification').deleteMany({ recipient: userId }),
        mongoose.model('NotificationPreference').deleteMany({ user: userId }),
        mongoose.model('PushSubscription').deleteMany({ userId }),
        User.findByIdAndDelete(userId)
      ]);

      logger.warn('[Superadmin] Hard deleted user:', { userId });

      return { success: true };
    } catch (error) {
      logger.error('[Superadmin] Failed to hard delete user:', error);
      throw error;
    }
  }

  /**
   * Get system statistics
   */
  async getSystemStats() {
    try {
      const [
        totalUsers,
        activeUsers,
        totalInsights,
        totalJobs,
        pendingJobs,
        failedJobs,
        dbStats
      ] = await Promise.all([
        User.countDocuments({ isDeleted: false }),
        User.countDocuments({ isDeleted: false, lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
        mongoose.model('Insight').countDocuments(),
        Job.countDocuments(),
        Job.countDocuments({ status: 'pending' }),
        Job.countDocuments({ status: 'failed' }),
        this.getDatabaseStats()
      ]);

      return {
        users: {
          total: totalUsers,
          active: activeUsers
        },
        content: {
          totalInsights
        },
        jobs: {
          total: totalJobs,
          pending: pendingJobs,
          failed: failedJobs
        },
        database: dbStats,
        server: {
          uptime: process.uptime(),
          nodeVersion: process.version,
          platform: process.platform,
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        }
      };
    } catch (error) {
      logger.error('[Superadmin] Failed to get system stats:', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats() {
    try {
      const db = mongoose.connection.db;
      const stats = await db.stats();

      const collections = await db.listCollections().toArray();
      const collectionStats = await Promise.all(
        collections.map(async (col) => {
          const colStats = await db.collection(col.name).stats();
          return {
            name: col.name,
            count: colStats.count,
            size: colStats.size,
            avgObjSize: colStats.avgObjSize,
            storageSize: colStats.storageSize,
            indexes: colStats.nindexes
          };
        })
      );

      return {
        database: stats.db,
        collections: stats.collections,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        indexSize: stats.indexSize,
        avgObjSize: stats.avgObjSize,
        collectionDetails: collectionStats.sort((a, b) => b.size - a.size)
      };
    } catch (error) {
      logger.error('[Superadmin] Failed to get database stats:', error);
      throw error;
    }
  }

  /**
   * Bulk user operations
   */
  async bulkUpdateUsers(userIds, operation, data) {
    try {
      const results = {
        success: 0,
        failed: 0,
        errors: []
      };

      for (const userId of userIds) {
        try {
          switch (operation) {
            case 'changeRole':
              await this.updateUserRole(userId, data.role);
              break;
            case 'suspend':
              await this.suspendUser(userId, data.reason);
              break;
            case 'unsuspend':
              await this.unsuspendUser(userId);
              break;
            case 'delete':
              await User.findByIdAndUpdate(userId, { isDeleted: true });
              break;
            default:
              throw new Error('Invalid operation');
          }
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            userId,
            error: error.message
          });
        }
      }

      logger.info('[Superadmin] Bulk operation completed:', {
        operation,
        success: results.success,
        failed: results.failed
      });

      return results;
    } catch (error) {
      logger.error('[Superadmin] Bulk operation failed:', error);
      throw error;
    }
  }

  /**
   * Get audit logs with advanced filtering
   */
  async getAuditLogs(options = {}) {
    try {
      const {
        page = 1,
        limit = 100,
        action,
        userId,
        resource,
        startDate,
        endDate,
        severity
      } = options;

      const query = {};

      if (action) query.action = action;
      if (userId) query.performedBy = userId;
      if (resource) query.resource = resource;
      if (severity) query['metadata.severity'] = severity;
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .populate('performedBy', 'name email role')
          .sort({ timestamp: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        AuditLog.countDocuments(query)
      ]);

      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('[Superadmin] Failed to get audit logs:', error);
      throw error;
    }
  }

  /**
   * Clear all failed jobs
   */
  async clearFailedJobs() {
    try {
      const result = await Job.deleteMany({
        status: 'failed',
        attempts: { $gte: 3 } // Only delete jobs that exhausted retries
      });

      logger.info('[Superadmin] Cleared failed jobs:', {
        deletedCount: result.deletedCount
      });

      return { deletedCount: result.deletedCount };
    } catch (error) {
      logger.error('[Superadmin] Failed to clear failed jobs:', error);
      throw error;
    }
  }

  /**
   * Retry all failed jobs
   */
  async retryFailedJobs() {
    try {
      const result = await Job.updateMany(
        { status: 'failed' },
        {
          $set: {
            status: 'pending',
            attempts: 0,
            error: null,
            processedAt: null
          }
        }
      );

      logger.info('[Superadmin] Retried failed jobs:', {
        modifiedCount: result.modifiedCount
      });

      return { retriedCount: result.modifiedCount };
    } catch (error) {
      logger.error('[Superadmin] Failed to retry jobs:', error);
      throw error;
    }
  }

  /**
   * Get system configuration
   */
  async getSystemConfiguration() {
    try {
      return {
        environment: process.env.NODE_ENV,
        port: process.env.PORT,
        database: {
          uri: process.env.MONGODB_URI?.replace(/\/\/.*:.*@/, '//***:***@'), // Mask credentials
          poolSize: mongoose.connection.options?.maxPoolSize
        },
        jwt: {
          expiry: process.env.JWT_EXPIRE
        },
        email: {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT,
          from: process.env.SMTP_FROM_EMAIL
        },
        push: {
          enabled: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
        },
        features: {
          backups: true,
          realtime: true,
          i18n: true,
          seo: true,
          versioning: true
        }
      };
    } catch (error) {
      logger.error('[Superadmin] Failed to get system configuration:', error);
      throw error;
    }
  }

  /**
   * Execute database maintenance
   */
  async performDatabaseMaintenance() {
    try {
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();

      const results = [];

      for (const col of collections) {
        try {
          // Rebuild indexes
          await db.collection(col.name).reIndex();

          // Get collection stats
          const stats = await db.collection(col.name).stats();

          results.push({
            collection: col.name,
            status: 'success',
            documentsCount: stats.count,
            size: stats.size
          });
        } catch (error) {
          results.push({
            collection: col.name,
            status: 'failed',
            error: error.message
          });
        }
      }

      logger.info('[Superadmin] Database maintenance completed');

      return results;
    } catch (error) {
      logger.error('[Superadmin] Database maintenance failed:', error);
      throw error;
    }
  }

  /**
   * Get collection sizes and optimization suggestions
   */
  async getCollectionAnalysis() {
    try {
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();

      const analysis = await Promise.all(
        collections.map(async (col) => {
          const stats = await db.collection(col.name).stats();
          const indexes = await db.collection(col.name).indexes();

          return {
            name: col.name,
            documents: stats.count,
            avgDocSize: stats.avgObjSize,
            dataSize: stats.size,
            storageSize: stats.storageSize,
            indexes: stats.nindexes,
            indexSizes: indexes.map(idx => ({
              name: idx.name,
              keys: idx.key
            })),
            fragmentation: stats.storageSize > 0
              ? ((stats.storageSize - stats.size) / stats.storageSize * 100).toFixed(2)
              : 0,
            suggestions: this.getOptimizationSuggestions(stats)
          };
        })
      );

      return analysis.sort((a, b) => b.dataSize - a.dataSize);
    } catch (error) {
      logger.error('[Superadmin] Collection analysis failed:', error);
      throw error;
    }
  }

  /**
   * Get optimization suggestions for a collection
   */
  getOptimizationSuggestions(stats) {
    const suggestions = [];

    // High fragmentation
    if (stats.storageSize > 0 && (stats.storageSize - stats.size) / stats.storageSize > 0.3) {
      suggestions.push('High fragmentation detected. Consider running compact operation.');
    }

    // Large collection
    if (stats.count > 100000) {
      suggestions.push('Large collection. Ensure proper indexing and consider archiving old data.');
    }

    // Large average document size
    if (stats.avgObjSize > 10000) {
      suggestions.push('Large average document size. Consider normalizing or compressing data.');
    }

    return suggestions;
  }
}

module.exports = new SuperadminService();
