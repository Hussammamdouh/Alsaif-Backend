const Job = require('../models/Job');
const { getWorkerStats } = require('../workers');
const { HTTP_STATUS } = require('../constants');

const { JOB_TYPES, JOB_STATUS } = Job;

/**
 * Job Controller
 *
 * Admin endpoints for job queue management and monitoring
 */

class JobController {
  /**
   * Get job statistics
   * GET /api/admin/jobs/stats
   */
  async getJobStats(req, res, next) {
    try {
      const { type } = req.query;

      const stats = await Job.getStats(type);
      const workerStats = getWorkerStats();

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          jobs: stats,
          worker: workerStats
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get jobs with filters
   * GET /api/admin/jobs
   * SECURITY: Strict enum validation to prevent NoSQL injection
   */
  async getJobs(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        type,
        status,
        priority
      } = req.query;

      // SECURITY FIX: Validate type parameter (whitelist pattern)
      // Prevents NoSQL injection via operators like ?type[$ne]=email or ?type[$regex]=.*
      if (type && !Object.values(JOB_TYPES).includes(type)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Invalid job type',
          validTypes: Object.values(JOB_TYPES)
        });
      }

      // SECURITY FIX: Validate status parameter (whitelist pattern)
      // Prevents NoSQL injection via operators like ?status[$ne]=completed
      if (status && !Object.values(JOB_STATUS).includes(status)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Invalid job status',
          validStatuses: Object.values(JOB_STATUS)
        });
      }

      // SECURITY FIX: Validate priority is a safe integer (1-10 per schema)
      if (priority) {
        const priorityNum = parseInt(priority);
        if (isNaN(priorityNum) || priorityNum < 1 || priorityNum > 10) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Invalid priority. Must be a number between 1 and 10'
          });
        }
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Build filter with validated values only
      const filter = {};
      if (type) filter.type = type;
      if (status) filter.status = status;
      if (priority) filter.priority = parseInt(priority);

      const jobs = await Job.find(filter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip);

      const total = await Job.countDocuments(filter);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          jobs,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get dead letter queue (failed jobs)
   * GET /api/admin/jobs/dead-letter-queue
   */
  async getDeadLetterQueue(req, res, next) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const jobs = await Job.find({ status: JOB_STATUS.DEAD })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip);

      const total = await Job.countDocuments({ status: JOB_STATUS.DEAD });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          jobs,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retry a dead job
   * POST /api/admin/jobs/:jobId/retry
   */
  async retryJob(req, res, next) {
    try {
      const { jobId } = req.params;

      const job = await Job.findOne({ jobId });

      if (!job) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Job not found'
        });
      }

      if (job.status !== JOB_STATUS.DEAD && job.status !== JOB_STATUS.FAILED) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Only dead or failed jobs can be retried'
        });
      }

      // Reset job for retry
      job.status = JOB_STATUS.PENDING;
      job.attempts = 0;
      job.scheduledFor = new Date();
      job.lastError = null;
      await job.save();

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Job queued for retry',
        data: { job }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete old completed jobs
   * DELETE /api/admin/jobs/cleanup
   */
  async cleanupJobs(req, res, next) {
    try {
      const { retentionDays = 7 } = req.body;

      const deletedCount = await Job.cleanupOldJobs(retentionDays);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: `Cleaned up ${deletedCount} old jobs`,
        data: { deletedCount }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a test job (development/testing)
   * POST /api/admin/jobs/test
   */
  async createTestJob(req, res, next) {
    try {
      const { type = 'email', payload = {} } = req.body;

      if (!Object.values(JOB_TYPES).includes(type)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Invalid job type',
          validTypes: Object.values(JOB_TYPES)
        });
      }

      const job = await Job.createJob({
        type,
        payload,
        priority: 5,
        maxAttempts: 3
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Test job created',
        data: { job }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new JobController();
