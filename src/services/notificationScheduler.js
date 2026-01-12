const cron = require('node-cron');
const Subscription = require('../models/Subscription');
const Job = require('../models/Job');
const { SUBSCRIPTION_STATUS } = require('../constants');
const {
  emitSubscriptionExpiringSoon,
  emitSubscriptionExpiringToday,
  emitSubscriptionExpiredReminder
} = require('../events/enhancedNotificationEvents');
const logger = require('../utils/logger');

const { JOB_TYPES } = Job;

/**
 * Notification Scheduler Service
 *
 * Schedules periodic tasks for:
 * - Subscription expiration reminders
 * - Weekly content digests
 * - Promotional campaigns
 * - Engagement reminders
 */

class NotificationScheduler {
  constructor() {
    this.jobs = [];
    this.initialized = false;
  }

  /**
   * Initialize all scheduled jobs
   */
  initialize() {
    if (this.initialized) {
      logger.warn('[NotificationScheduler] Already initialized');
      return;
    }

    logger.info('[NotificationScheduler] Initializing scheduled jobs...');

    // Daily job: Check for expiring subscriptions (runs at 9:00 AM daily)
    this.jobs.push(
      cron.schedule('0 9 * * *', async () => {
        await this.sendExpirationReminders();
      })
    );

    // Hourly job: Check for same-day expirations (runs every hour)
    this.jobs.push(
      cron.schedule('0 * * * *', async () => {
        await this.sendSameDayExpirationReminders();
      })
    );

    // Weekly job: Send content digest (runs Monday at 9:00 AM)
    this.jobs.push(
      cron.schedule('0 9 * * 1', async () => {
        await this.sendWeeklyContentDigest();
      })
    );

    // Daily job: Send expired subscription follow-up (runs at 10:00 AM daily)
    this.jobs.push(
      cron.schedule('0 10 * * *', async () => {
        await this.sendExpiredSubscriptionReminders();
      })
    );

    // NEW: Daily job: Process expired subscriptions (runs at 2:00 AM daily)
    this.jobs.push(
      cron.schedule('0 2 * * *', async () => {
        await this.scheduleSubscriptionExpiryCheck();
      })
    );

    // NEW: Weekly job: Cleanup old notifications (runs Sunday at 3:00 AM)
    this.jobs.push(
      cron.schedule('0 3 * * 0', async () => {
        await this.scheduleCleanupJobs();
      })
    );

    // Frequent job: Check for insights to publish (runs every 5 minutes)
    this.jobs.push(
      cron.schedule('*/5 * * * *', async () => {
        await this.schedulePublishInsightsJob();
      })
    );

    this.initialized = true;
    logger.info(`[NotificationScheduler] ${this.jobs.length} scheduled jobs initialized`);
  }

  /**
   * Schedule subscription expiry check job (background processing)
   */
  async scheduleSubscriptionExpiryCheck() {
    try {
      logger.info('[NotificationScheduler] Scheduling subscription expiry check job');

      await Job.createJob({
        type: JOB_TYPES.SUBSCRIPTION_EXPIRY_CHECK,
        payload: {
          batchSize: 100
        },
        priority: 7, // High priority
        maxAttempts: 3
      });

      logger.info('[NotificationScheduler] Subscription expiry check job created');
    } catch (error) {
      logger.error('[NotificationScheduler] Failed to schedule expiry check:', error);
    }
  }

  /**
   * Schedule cleanup jobs (background processing)
   */
  async scheduleCleanupJobs() {
    try {
      logger.info('[NotificationScheduler] Scheduling cleanup jobs');

      // Cleanup old notifications
      await Job.createJob({
        type: JOB_TYPES.CLEANUP_NOTIFICATIONS,
        payload: {
          retentionDays: 90
        },
        priority: 2, // Low priority
        maxAttempts: 2
      });

      // Cleanup old audit logs
      await Job.createJob({
        type: JOB_TYPES.CLEANUP_AUDIT_LOGS,
        payload: {
          retentionDays: 365
        },
        priority: 2,
        maxAttempts: 2
      });

      // Cleanup old completed jobs
      await Job.cleanupOldJobs(7);

      logger.info('[NotificationScheduler] Cleanup jobs created');
    } catch (error) {
      logger.error('[NotificationScheduler] Failed to schedule cleanup jobs:', error);
    }
  }

  /**
   * Schedule publish insights job
   */
  async schedulePublishInsightsJob() {
    try {
      logger.info('[NotificationScheduler] Scheduling publish insights job');

      await Job.createJob({
        type: JOB_TYPES.PUBLISH_INSIGHTS,
        payload: {},
        priority: 6, // Above cleanup, below subs
        maxAttempts: 2
      });
    } catch (error) {
      logger.error('[NotificationScheduler] Failed to schedule publish insights job:', error);
    }
  }

  /**
   * Send expiration reminders for subscriptions expiring in 7, 3, and 1 days
   */
  async sendExpirationReminders() {
    try {
      logger.info('[NotificationScheduler] Running expiration reminder check...');

      const reminderDays = [7, 3, 1];
      let totalSent = 0;

      for (const days of reminderDays) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + days);
        targetDate.setHours(0, 0, 0, 0);

        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Find subscriptions expiring on this day
        const subscriptions = await Subscription.find({
          status: SUBSCRIPTION_STATUS.ACTIVE,
          tier: 'premium',
          endDate: {
            $gte: targetDate,
            $lte: endOfDay
          }
        }).populate('user', 'name email');

        logger.info(
          `[NotificationScheduler] Found ${subscriptions.length} subscriptions expiring in ${days} day(s)`
        );

        for (const subscription of subscriptions) {
          if (subscription.user) {
            emitSubscriptionExpiringSoon({
              userId: subscription.user._id,
              subscriptionId: subscription._id,
              daysUntilExpiry: days,
              endDate: subscription.endDate,
              userName: subscription.user.name,
              userEmail: subscription.user.email
            });
            totalSent++;
          }
        }
      }

      logger.info(`[NotificationScheduler] Sent ${totalSent} expiration reminder notifications`);
    } catch (error) {
      logger.error('[NotificationScheduler] Error sending expiration reminders:', error);
    }
  }

  /**
   * Send reminders for subscriptions expiring today
   */
  async sendSameDayExpirationReminders() {
    try {
      logger.info('[NotificationScheduler] Running same-day expiration check...');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      const subscriptions = await Subscription.find({
        status: SUBSCRIPTION_STATUS.ACTIVE,
        tier: 'premium',
        endDate: {
          $gte: today,
          $lte: endOfDay
        }
      }).populate('user', 'name email');

      logger.info(
        `[NotificationScheduler] Found ${subscriptions.length} subscriptions expiring today`
      );

      for (const subscription of subscriptions) {
        if (subscription.user) {
          emitSubscriptionExpiringToday({
            userId: subscription.user._id,
            subscriptionId: subscription._id,
            endDate: subscription.endDate,
            userName: subscription.user.name,
            userEmail: subscription.user.email
          });
        }
      }

      logger.info(
        `[NotificationScheduler] Sent ${subscriptions.length} same-day expiration notifications`
      );
    } catch (error) {
      logger.error('[NotificationScheduler] Error sending same-day expiration reminders:', error);
    }
  }

  /**
   * Send follow-up reminders for expired subscriptions (1, 3, 7 days after expiration)
   */
  async sendExpiredSubscriptionReminders() {
    try {
      logger.info('[NotificationScheduler] Running expired subscription reminder check...');

      const reminderDays = [1, 3, 7];
      let totalSent = 0;

      for (const days of reminderDays) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - days);
        targetDate.setHours(0, 0, 0, 0);

        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Find subscriptions that expired on this day
        const subscriptions = await Subscription.find({
          status: SUBSCRIPTION_STATUS.EXPIRED,
          tier: 'premium',
          endDate: {
            $gte: targetDate,
            $lte: endOfDay
          }
        }).populate('user', 'name email');

        logger.info(
          `[NotificationScheduler] Found ${subscriptions.length} subscriptions expired ${days} day(s) ago`
        );

        for (const subscription of subscriptions) {
          if (subscription.user) {
            emitSubscriptionExpiredReminder({
              userId: subscription.user._id,
              subscriptionId: subscription._id,
              daysSinceExpiry: days,
              expiredAt: subscription.endDate,
              userName: subscription.user.name,
              userEmail: subscription.user.email
            });
            totalSent++;
          }
        }
      }

      logger.info(
        `[NotificationScheduler] Sent ${totalSent} expired subscription reminder notifications`
      );
    } catch (error) {
      logger.error('[NotificationScheduler] Error sending expired subscription reminders:', error);
    }
  }

  /**
   * Send weekly content digest to users who opted in
   */
  async sendWeeklyContentDigest() {
    try {
      logger.info('[NotificationScheduler] Running weekly content digest job...');

      const NotificationPreference = require('../models/NotificationPreference');
      const Insight = require('../models/Insight');

      // Find users who want weekly digest
      const preferences = await NotificationPreference.find({
        'content.personalizedDigest.enabled': true,
        'content.personalizedDigest.frequency': 'weekly',
        'globalSettings.emailEnabled': true
      }).populate('user', 'name email');

      logger.info(`[NotificationScheduler] Found ${preferences.length} users for weekly digest`);

      // Get insights from the past week
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const recentInsights = await Insight.find({
        status: 'published',
        isDeleted: false,
        createdAt: { $gte: oneWeekAgo }
      })
        .sort('-viewCount -likes')
        .limit(10)
        .select('title excerpt type category coverImage');

      if (recentInsights.length === 0) {
        logger.info('[NotificationScheduler] No recent insights for weekly digest');
        return;
      }

      // Send digest to each user (in production, batch these via email service)
      for (const pref of preferences) {
        if (pref.user) {
          // Filter insights based on user preferences
          let userInsights = recentInsights;

          // Filter by categories if user has specific preferences
          if (
            pref.content.newInsights.categories &&
            pref.content.newInsights.categories.length > 0
          ) {
            userInsights = recentInsights.filter((insight) =>
              pref.content.newInsights.categories.includes(insight.category)
            );
          }

          // Filter by premium-only preference
          if (pref.content.newInsights.premiumOnly) {
            userInsights = userInsights.filter((insight) => insight.type === 'premium');
          }

          if (userInsights.length > 0) {
            // Emit weekly digest event (will be picked up by notification service)
            const { emitWeeklyDigest } = require('../events/enhancedNotificationEvents');
            emitWeeklyDigest({
              userId: pref.user._id,
              insights: userInsights.map((i) => ({
                id: i._id,
                title: i.title,
                excerpt: i.excerpt,
                type: i.type,
                category: i.category,
                coverImage: i.coverImage
              })),
              weekStartDate: oneWeekAgo,
              weekEndDate: new Date()
            });
          }
        }
      }

      logger.info(`[NotificationScheduler] Weekly digest job completed for ${preferences.length} users`);
    } catch (error) {
      logger.error('[NotificationScheduler] Error sending weekly content digest:', error);
    }
  }

  /**
   * Stop all scheduled jobs
   */
  shutdown() {
    logger.info('[NotificationScheduler] Shutting down scheduled jobs...');
    this.jobs.forEach((job) => job.stop());
    this.initialized = false;
    logger.info('[NotificationScheduler] All scheduled jobs stopped');
  }
}

module.exports = new NotificationScheduler();
