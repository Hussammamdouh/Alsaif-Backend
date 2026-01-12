const JobWorker = require('./jobWorker');
const {
  handleEmailJob,
  handlePushJob,
  handleSMSJob,
  handleSubscriptionExpiryCheck,
  handleCleanupNotifications,
  handleCleanupAuditLogs,
  handleContentDigest,
  handlePublishInsights
} = require('./jobHandlers');
const Job = require('../models/Job');
const logger = require('../utils/logger');

/**
 * Worker Initialization
 *
 * Creates and starts the job worker with all handlers registered
 */

let worker = null;

/**
 * Initialize and start the worker
 */
async function startWorker(options = {}) {
  if (worker && worker.running) {
    logger.warn('[Worker] Worker already running');
    return worker;
  }

  // Create worker instance
  worker = new JobWorker({
    workerId: options.workerId,
    concurrency: options.concurrency || 10,
    pollInterval: options.pollInterval || 1000,
    stuckJobThreshold: options.stuckJobThreshold || 30
  });

  // Register all handlers
  const { JOB_TYPES } = Job;

  worker.registerHandler(JOB_TYPES.EMAIL, handleEmailJob);
  worker.registerHandler(JOB_TYPES.PUSH, handlePushJob);
  worker.registerHandler(JOB_TYPES.SMS, handleSMSJob);
  worker.registerHandler(JOB_TYPES.SUBSCRIPTION_EXPIRY_CHECK, handleSubscriptionExpiryCheck);
  worker.registerHandler(JOB_TYPES.CLEANUP_NOTIFICATIONS, handleCleanupNotifications);
  worker.registerHandler(JOB_TYPES.CLEANUP_AUDIT_LOGS, handleCleanupAuditLogs);
  worker.registerHandler(JOB_TYPES.CONTENT_DIGEST, handleContentDigest);
  worker.registerHandler(JOB_TYPES.PUBLISH_INSIGHTS, handlePublishInsights);

  // Start worker
  await worker.start();

  // Graceful shutdown handlers
  process.on('SIGTERM', async () => {
    logger.info('[Worker] SIGTERM received, shutting down gracefully...');
    await stopWorker();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('[Worker] SIGINT received, shutting down gracefully...');
    await stopWorker();
    process.exit(0);
  });

  return worker;
}

/**
 * Stop the worker gracefully
 */
async function stopWorker() {
  if (!worker) return;

  await worker.stop();
  worker = null;
}

/**
 * Get worker instance
 */
function getWorker() {
  return worker;
}

/**
 * Get worker stats
 */
function getWorkerStats() {
  if (!worker) {
    return { running: false };
  }

  return {
    running: worker.running,
    ...worker.getStats()
  };
}

module.exports = {
  startWorker,
  stopWorker,
  getWorker,
  getWorkerStats
};
