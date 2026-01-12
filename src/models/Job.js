const mongoose = require('mongoose');

/**
 * Job Model - Background Job Queue (MongoDB-backed)
 *
 * Purpose: Persistent job queue for async operations (email, push, maintenance)
 * Features:
 * - Atomic job claiming (prevents duplicate processing)
 * - Retry with exponential backoff
 * - Dead letter queue for permanently failed jobs
 * - Job status tracking and observability
 *
 * Design Decisions:
 * - No Redis dependency (uses MongoDB for persistence)
 * - Optimistic locking via status transitions
 * - Scheduled jobs via scheduledFor field
 * - Idempotency via jobId uniqueness
 */

const JOB_TYPES = {
  // Notification jobs
  EMAIL: 'email',
  PUSH: 'push',
  SMS: 'sms',

  // Subscription jobs
  SUBSCRIPTION_EXPIRY_CHECK: 'subscription-expiry-check',
  SUBSCRIPTION_EXPIRY_PROCESS: 'subscription-expiry-process',

  // Maintenance jobs
  CLEANUP_NOTIFICATIONS: 'cleanup-notifications',
  CLEANUP_AUDIT_LOGS: 'cleanup-audit-logs',

  // Content jobs
  CONTENT_DIGEST: 'content-digest',
  TRENDING_ANALYSIS: 'trending-analysis',
  PUBLISH_INSIGHTS: 'publish-insights'
};

const JOB_STATUS = {
  PENDING: 'pending',       // Waiting to be processed
  PROCESSING: 'processing', // Currently being processed
  COMPLETED: 'completed',   // Successfully completed
  FAILED: 'failed',         // Failed but retryable
  DEAD: 'dead'              // Max retries exceeded, moved to DLQ
};

const jobSchema = new mongoose.Schema(
  {
    // Unique job identifier (for idempotency)
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    // Job type
    type: {
      type: String,
      enum: Object.values(JOB_TYPES),
      required: true,
      index: true
    },

    // Job status
    status: {
      type: String,
      enum: Object.values(JOB_STATUS),
      default: JOB_STATUS.PENDING,
      required: true,
      index: true
    },

    // Job payload (type-specific data)
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },

    // Retry configuration
    attempts: {
      type: Number,
      default: 0,
      min: 0
    },

    maxAttempts: {
      type: Number,
      default: 3,
      min: 1,
      max: 10
    },

    // Scheduling
    scheduledFor: {
      type: Date,
      default: Date.now,
      index: true
    },

    // Processing metadata
    processingStartedAt: Date,
    processedAt: Date,
    processedBy: String, // Worker ID or hostname

    // Error tracking
    lastError: String,
    errorHistory: [
      {
        message: String,
        occurredAt: Date,
        attemptNumber: Number
      }
    ],

    // Priority (for future use)
    priority: {
      type: Number,
      default: 5,
      min: 1,
      max: 10,
      index: true
    },

    // Metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// ==================== INDEXES ====================

// Compound index for efficient job polling
jobSchema.index({ status: 1, scheduledFor: 1, priority: -1, createdAt: 1 });

// Index for cleanup queries
jobSchema.index({ status: 1, createdAt: 1 });

// Index for monitoring/observability
jobSchema.index({ type: 1, status: 1, createdAt: -1 });

// ==================== STATIC METHODS ====================

/**
 * Claim next available job (atomic operation)
 * Uses findOneAndUpdate to prevent race conditions
 */
jobSchema.statics.claimNext = async function (types = [], workerId = 'worker') {
  const query = {
    status: JOB_STATUS.PENDING,
    scheduledFor: { $lte: new Date() }
  };

  if (types.length > 0) {
    query.type = { $in: types };
  }

  const job = await this.findOneAndUpdate(
    query,
    {
      $set: {
        status: JOB_STATUS.PROCESSING,
        processingStartedAt: new Date(),
        processedBy: workerId
      },
      $inc: { attempts: 1 }
    },
    {
      sort: { priority: -1, scheduledFor: 1, createdAt: 1 },
      new: true
    }
  );

  return job;
};

/**
 * Create a new job (idempotent)
 */
jobSchema.statics.createJob = async function (jobData) {
  const {
    jobId,
    type,
    payload,
    scheduledFor = new Date(),
    priority = 5,
    maxAttempts = 3,
    metadata = {}
  } = jobData;

  // Generate jobId if not provided
  const finalJobId =
    jobId || `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    const job = await this.create({
      jobId: finalJobId,
      type,
      payload,
      scheduledFor,
      priority,
      maxAttempts,
      metadata,
      status: JOB_STATUS.PENDING
    });
    return job;
  } catch (error) {
    // If duplicate jobId, job already exists (idempotency)
    if (error.code === 11000) {
      return await this.findOne({ jobId: finalJobId });
    }
    throw error;
  }
};

/**
 * Bulk create jobs (for fan-out operations)
 */
jobSchema.statics.createBulkJobs = async function (jobsData) {
  const jobs = jobsData.map((data) => ({
    jobId:
      data.jobId || `${data.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: data.type,
    payload: data.payload,
    scheduledFor: data.scheduledFor || new Date(),
    priority: data.priority || 5,
    maxAttempts: data.maxAttempts || 3,
    metadata: data.metadata || {},
    status: JOB_STATUS.PENDING
  }));

  // Use insertMany with ordered: false to continue on duplicate key errors
  try {
    const result = await this.insertMany(jobs, { ordered: false });
    return result;
  } catch (error) {
    // Ignore duplicate key errors (idempotency)
    if (error.code === 11000) {
      return error.insertedDocs || [];
    }
    throw error;
  }
};

/**
 * Mark job as completed
 */
jobSchema.statics.markCompleted = async function (jobId) {
  return await this.findOneAndUpdate(
    { jobId, status: JOB_STATUS.PROCESSING },
    {
      $set: {
        status: JOB_STATUS.COMPLETED,
        processedAt: new Date()
      }
    },
    { new: true }
  );
};

/**
 * Mark job as failed with retry logic
 */
jobSchema.statics.markFailed = async function (jobId, error) {
  const job = await this.findOne({ jobId });

  if (!job) return null;

  const errorEntry = {
    message: error.message || String(error),
    occurredAt: new Date(),
    attemptNumber: job.attempts
  };

  // Check if max retries exceeded
  if (job.attempts >= job.maxAttempts) {
    // Move to dead letter queue
    return await this.findOneAndUpdate(
      { jobId },
      {
        $set: {
          status: JOB_STATUS.DEAD,
          lastError: errorEntry.message,
          processedAt: new Date()
        },
        $push: { errorHistory: errorEntry }
      },
      { new: true }
    );
  }

  // Schedule retry with exponential backoff
  const retryDelayMs = Math.min(Math.pow(2, job.attempts) * 60 * 1000, 60 * 60 * 1000); // Max 1 hour
  const nextRetryAt = new Date(Date.now() + retryDelayMs);

  return await this.findOneAndUpdate(
    { jobId },
    {
      $set: {
        status: JOB_STATUS.FAILED,
        lastError: errorEntry.message,
        scheduledFor: nextRetryAt
      },
      $push: { errorHistory: errorEntry }
    },
    { new: true }
  );
};

/**
 * Get job statistics
 */
jobSchema.statics.getStats = async function (type = null) {
  const match = type ? { type } : {};

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const result = {
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    dead: 0
  };

  stats.forEach((stat) => {
    result[stat._id] = stat.count;
    result.total += stat.count;
  });

  return result;
};

/**
 * Cleanup old completed jobs (retention policy)
 */
jobSchema.statics.cleanupOldJobs = async function (retentionDays = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await this.deleteMany({
    status: JOB_STATUS.COMPLETED,
    processedAt: { $lte: cutoffDate }
  });

  return result.deletedCount;
};

/**
 * Reset stuck jobs (jobs stuck in processing state)
 */
jobSchema.statics.resetStuckJobs = async function (stuckThresholdMinutes = 30) {
  const cutoffDate = new Date();
  cutoffDate.setMinutes(cutoffDate.getMinutes() - stuckThresholdMinutes);

  const result = await this.updateMany(
    {
      status: JOB_STATUS.PROCESSING,
      processingStartedAt: { $lte: cutoffDate }
    },
    {
      $set: {
        status: JOB_STATUS.FAILED,
        lastError: 'Job processing timeout - reset by system'
      }
    }
  );

  return result.modifiedCount;
};

// ==================== INSTANCE METHODS ====================

/**
 * Check if job is retryable
 */
jobSchema.methods.isRetryable = function () {
  return (
    this.status === JOB_STATUS.FAILED &&
    this.attempts < this.maxAttempts &&
    new Date() >= this.scheduledFor
  );
};

/**
 * Calculate next retry time
 */
jobSchema.methods.getNextRetryTime = function () {
  if (this.attempts >= this.maxAttempts) return null;

  const delayMs = Math.min(Math.pow(2, this.attempts) * 60 * 1000, 60 * 60 * 1000);
  return new Date(Date.now() + delayMs);
};

// Export constants for use in other files
jobSchema.statics.JOB_TYPES = JOB_TYPES;
jobSchema.statics.JOB_STATUS = JOB_STATUS;

module.exports = mongoose.model('Job', jobSchema);
