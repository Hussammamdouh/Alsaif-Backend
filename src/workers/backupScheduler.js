/**
 * Backup Scheduler
 *
 * Automated daily backups using node-cron
 */

const cron = require('node-cron');
const backupService = require('../services/backupService');
const logger = require('../utils/logger');

class BackupScheduler {
  constructor() {
    this.isInitialized = false;
    this.jobs = [];
  }

  /**
   * Initialize backup scheduler
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('[BackupScheduler] Already initialized');
      return;
    }

    try {
      // Initialize backup service
      await backupService.initialize();

      // Schedule daily backup at 2 AM
      const dailyBackup = cron.schedule('0 2 * * *', async () => {
        try {
          logger.info('[BackupScheduler] Starting scheduled backup');
          await backupService.createBackup({ name: `scheduled-${Date.now()}` });
        } catch (error) {
          logger.error('[BackupScheduler] Scheduled backup failed:', error);
        }
      });

      this.jobs.push({ name: 'dailyBackup', job: dailyBackup });

      // Schedule weekly cleanup on Sunday at 3 AM
      const weeklyCleanup = cron.schedule('0 3 * * 0', async () => {
        try {
          logger.info('[BackupScheduler] Starting scheduled cleanup');
          await backupService.cleanupOldBackups();
        } catch (error) {
          logger.error('[BackupScheduler] Scheduled cleanup failed:', error);
        }
      });

      this.jobs.push({ name: 'weeklyCleanup', job: weeklyCleanup });

      this.isInitialized = true;
      logger.info('[BackupScheduler] Initialized successfully', {
        jobs: this.jobs.map(j => j.name)
      });
    } catch (error) {
      logger.error('[BackupScheduler] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    this.jobs.forEach(({ name, job }) => {
      job.stop();
      logger.info(`[BackupScheduler] Stopped job: ${name}`);
    });

    this.isInitialized = false;
  }

  /**
   * Get job status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      jobs: this.jobs.map(({ name }) => name),
      nextBackup: '2:00 AM (daily)',
      nextCleanup: 'Sunday 3:00 AM (weekly)'
    };
  }
}

module.exports = new BackupScheduler();
