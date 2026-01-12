const mongoose = require('mongoose');

/**
 * AuditLog Model
 *
 * Purpose: Immutable audit trail for all sensitive operations
 * Security: Write-once (no updates/deletes allowed)
 * Access: Superadmin only
 */

const auditLogSchema = new mongoose.Schema({
  // Who performed the action
  actor: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    email: {
      type: String,
      required: true
    },
    role: {
      type: String,
      required: true,
      enum: ['user', 'admin', 'superadmin']
    },
    ip: String,
    userAgent: String
  },

  // What action was performed
  action: {
    type: String,
    required: true,
    index: true,
    enum: [
      // Authentication
      'LOGIN',
      'LOGOUT',
      'LOGOUT_ALL',
      'REFRESH_TOKEN',
      'REGISTER',

      // User Management
      'USER_CREATED',
      'USER_UPDATED',
      'USER_DELETED',
      'USER_SUSPENDED',
      'USER_ACTIVATED',
      'USER_ROLE_CHANGED',

      // Admin Management
      'ADMIN_CREATED',
      'ADMIN_REMOVED',

      // Content Management (future)
      'INSIGHT_CREATED',
      'INSIGHT_UPDATED',
      'INSIGHT_DELETED',
      'INSIGHT_FEATURED',

      // Chat Management
      'CHAT_CREATED',
      'CHAT_DELETED',
      'USER_MUTED',
      'USER_UNMUTED',
      'USER_BANNED',
      'USER_UNBANNED',
      'PARTICIPANT_ADDED',
      'PARTICIPANT_REMOVED',

      // System Configuration
      'CONFIG_UPDATED',
      'RATE_LIMIT_CHANGED',

      // Abuse Management
      'ACCOUNT_LOCKED',
      'ACCOUNT_UNLOCKED',
      'SPAM_DETECTED',
      'ABUSE_REPORTED'
    ]
  },

  // What was affected
  target: {
    resourceType: {
      type: String,
      required: true,
      enum: ['User', 'Chat', 'Message', 'Insight', 'Config', 'System']
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true
    },
    resourceName: String // Human-readable identifier
  },

  // Additional context
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },

  metadata: {
    reason: String,
    notes: String,
    automated: {
      type: Boolean,
      default: false
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    }
  },

  // Request context
  request: {
    path: String,
    method: String,
    query: mongoose.Schema.Types.Mixed,
    body: mongoose.Schema.Types.Mixed // Sanitized (no passwords)
  },

  // Outcome
  status: {
    type: String,
    required: true,
    enum: ['success', 'failure', 'partial'],
    default: 'success'
  },

  error: {
    message: String,
    code: String
  }
}, {
  timestamps: true, // Creates createdAt and updatedAt
  // Prevent updates and deletes
  minimize: false
});

// Indexes for efficient querying
auditLogSchema.index({ createdAt: -1 }); // Recent first
auditLogSchema.index({ 'actor.userId': 1, createdAt: -1 }); // By actor
auditLogSchema.index({ 'target.resourceId': 1, createdAt: -1 }); // By target
auditLogSchema.index({ action: 1, createdAt: -1 }); // By action type
auditLogSchema.index({ 'metadata.severity': 1, createdAt: -1 }); // By severity

// SECURITY FIX (HIGH-004): Enforce audit log immutability
// Prevent ANY modifications or deletions to ensure tamper-proof audit trail

// Block all update operations
auditLogSchema.pre('findOneAndUpdate', function(next) {
  next(new Error('SECURITY: Audit logs are immutable and cannot be modified'));
});

auditLogSchema.pre('updateOne', function(next) {
  next(new Error('SECURITY: Audit logs are immutable and cannot be modified'));
});

auditLogSchema.pre('updateMany', function(next) {
  next(new Error('SECURITY: Audit logs are immutable and cannot be modified'));
});

auditLogSchema.pre('findOneAndReplace', function(next) {
  next(new Error('SECURITY: Audit logs are immutable and cannot be replaced'));
});

// Block all delete operations
auditLogSchema.pre('findOneAndDelete', function(next) {
  next(new Error('SECURITY: Audit logs are immutable and cannot be deleted'));
});

auditLogSchema.pre('deleteOne', function(next) {
  next(new Error('SECURITY: Audit logs are immutable and cannot be deleted'));
});

auditLogSchema.pre('deleteMany', function(next) {
  next(new Error('SECURITY: Audit logs are immutable and cannot be deleted'));
});

auditLogSchema.pre('remove', function(next) {
  next(new Error('SECURITY: Audit logs are immutable and cannot be removed'));
});

// Block modifications via save() on existing documents
auditLogSchema.pre('save', function(next) {
  // Allow save only for new documents (not updates)
  if (!this.isNew) {
    return next(new Error('SECURITY: Existing audit logs cannot be modified via save()'));
  }
  next();
});

// Static method to create audit log (preferred way)
auditLogSchema.statics.log = async function(logData) {
  try {
    const log = await this.create(logData);
    return log;
  } catch (error) {
    // Critical: Audit log failures should be logged but not break the main flow
    console.error('[AUDIT LOG FAILURE]', error.message, logData);
    throw error;
  }
};

// Static method to query audit logs with filters
auditLogSchema.statics.query = async function(filters = {}, options = {}) {
  const {
    actorId,
    action,
    resourceType,
    resourceId,
    severity,
    startDate,
    endDate,
    status,
    page = 1,
    limit = 50
  } = { ...filters, ...options };

  const query = {};

  if (actorId) query['actor.userId'] = actorId;
  if (action) query.action = action;
  if (resourceType) query['target.resourceType'] = resourceType;
  if (resourceId) query['target.resourceId'] = resourceId;
  if (severity) query['metadata.severity'] = severity;
  if (status) query.status = status;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    this.find(query)
      .populate('actor.userId', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    logs,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
};

// Instance method to format for API response
auditLogSchema.methods.toAuditResponse = function() {
  return {
    id: this._id,
    actor: {
      userId: this.actor.userId,
      email: this.actor.email,
      role: this.actor.role,
      ip: this.actor.ip
    },
    action: this.action,
    target: this.target,
    changes: this.changes,
    metadata: this.metadata,
    status: this.status,
    timestamp: this.createdAt
  };
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
