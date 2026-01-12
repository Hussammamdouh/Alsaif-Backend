const Job = require('../models/Job');
const logger = require('../utils/logger');
const os = require('os');

/**
 * Job Worker - Background Job Processor
 *
 * Purpose: Process jobs from MongoDB-backed queue
 * Features:
 * - Atomic job claiming (no duplicate processing)
 * - Concurrent processing with limits
 * - Graceful shutdown
 * - Automatic retry with exponential backoff
 * - Dead letter queue for failed jobs
 *
 * Design:
 * - Single Node process (can run multiple instances for scale)
 * - Polls MongoDB for pending jobs
 * - Delegates to job handlers based on type
 */

const { JOB_TYPES, JOB_STATUS } = Job;

class JobWorker {
  constructor(options = {}) {
    this.workerId = options.workerId || `worker-${os.hostname()}-${process.pid}`;
    this.concurrency = options.concurrency || 10;
    this.pollInterval = options.pollInterval || 1000; // 1 second
    this.stuckJobThreshold = options.stuckJobThreshold || 30; // 30 minutes

    this.running = false;
    this.processing = new Map(); // jobId -> Promise
    this.handlers = new Map();

    this.stats = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      dead: 0
    };
  }

  /**
   * Register a job handler
   */
  registerHandler(type, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Handler for ${type} must be a function`);
    }
    this.handlers.set(type, handler);
    logger.info(`[JobWorker] Registered handler for: ${type}`);
  }

  /**
   * Start the worker
   */
  async start() {
    if (this.running) {
      logger.warn('[JobWorker] Already running');
      return;
    }

    this.running = true;
    logger.info(`[JobWorker] Starting worker: ${this.workerId}`);
    logger.info(`[JobWorker] Concurrency: ${this.concurrency}`);
    logger.info(`[JobWorker] Registered handlers: ${Array.from(this.handlers.keys()).join(', ')}`);

    // Reset stuck jobs on startup
    const resetCount = await Job.resetStuckJobs(this.stuckJobThreshold);
    if (resetCount > 0) {
      logger.warn(`[JobWorker] Reset ${resetCount} stuck jobs`);
    }

    // Start processing loop
    this.processLoop();

    // Start stuck job monitor (runs every 5 minutes)
    this.stuckJobMonitor = setInterval(async () => {
      const resetCount = await Job.resetStuckJobs(this.stuckJobThreshold);
      if (resetCount > 0) {
        logger.warn(`[JobWorker] Reset ${resetCount} stuck jobs`);
      }
    }, 5 * 60 * 1000);

    logger.info('[JobWorker] Worker started successfully');
  }

  /**
   * Stop the worker (graceful shutdown)
   */
  async stop() {
    if (!this.running) return;

    logger.info('[JobWorker] Stopping worker...');
    this.running = false;

    // Clear intervals
    if (this.stuckJobMonitor) {
      clearInterval(this.stuckJobMonitor);
    }

    // Wait for all in-flight jobs to complete
    if (this.processing.size > 0) {
      logger.info(`[JobWorker] Waiting for ${this.processing.size} jobs to complete...`);
      await Promise.allSettled(Array.from(this.processing.values()));
    }

    logger.info('[JobWorker] Worker stopped');
    logger.info(`[JobWorker] Stats: ${JSON.stringify(this.stats)}`);
  }

  /**
   * Main processing loop
   */
  async processLoop() {
    while (this.running) {
      try {
        // Check if we have capacity
        if (this.processing.size >= this.concurrency) {
          await this.sleep(this.pollInterval);
          continue;
        }

        // Claim next job (atomic operation)
        const job = await Job.claimNext(Array.from(this.handlers.keys()), this.workerId);

        if (!job) {
          // No jobs available, wait and retry
          await this.sleep(this.pollInterval);
          continue;
        }

        // Process job asynchronously
        const processingPromise = this.processJob(job)
          .catch((error) => {
            logger.error(`[JobWorker] Unexpected error processing job ${job.jobId}:`, error);
          })
          .finally(() => {
            // Remove from processing map when done
            this.processing.delete(job.jobId);
          });

        // Track in-flight job
        this.processing.set(job.jobId, processingPromise);
      } catch (error) {
        logger.error('[JobWorker] Error in process loop:', error);
        await this.sleep(this.pollInterval);
      }
    }
  }

  /**
   * Process a single job
   */
  async processJob(job) {
    const startTime = Date.now();
    logger.info(
      `[JobWorker] Processing job: ${job.jobId} (type: ${job.type}, attempt: ${job.attempts}/${job.maxAttempts})`
    );

    try {
      // Get handler for this job type
      const handler = this.handlers.get(job.type);

      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.type}`);
      }

      // Execute handler
      await handler(job.payload, job);

      // Mark as completed
      await Job.markCompleted(job.jobId);

      const duration = Date.now() - startTime;
      logger.info(`[JobWorker] Job completed: ${job.jobId} (${duration}ms)`);

      this.stats.processed++;
      this.stats.succeeded++;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        `[JobWorker] Job failed: ${job.jobId} (attempt ${job.attempts}/${job.maxAttempts}, ${duration}ms)`,
        error
      );

      // Mark as failed (will auto-retry or move to DLQ)
      const updatedJob = await Job.markFailed(job.jobId, error);

      this.stats.processed++;
      this.stats.failed++;

      if (updatedJob && updatedJob.status === JOB_STATUS.DEAD) {
        logger.error(`[JobWorker] Job moved to DLQ: ${job.jobId}`);
        this.stats.dead++;
      } else if (updatedJob) {
        logger.info(
          `[JobWorker] Job scheduled for retry: ${job.jobId} at ${updatedJob.scheduledFor}`
        );
      }
    }
  }

  /**
   * Get worker statistics
   */
  getStats() {
    return {
      ...this.stats,
      inFlight: this.processing.size,
      uptime: process.uptime()
    };
  }

  /**
   * Utility: sleep
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = JobWorker;
