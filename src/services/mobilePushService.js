/**
 * Mobile Push Service
 *
 * Handles delivery of push notifications to mobile devices (iOS/Android)
 * via Firebase Cloud Messaging (FCM) and OneSignal.
 */

const admin = require('firebase-admin');
const OneSignal = require('onesignal-node');
const NotificationPreference = require('../models/NotificationPreference');
const logger = require('../utils/logger');

class MobilePushService {
  constructor() {
    this.fcmInitialized = false;
    this.oneSignalClient = null;
  }

  /**
   * Initialize services
   */
  async initialize() {
    try {
      // 1. Initialize Firebase Admin
      if (!admin.apps.length) {
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
          ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
          : null;

        if (serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          admin.initializeApp({
            credential: serviceAccount 
              ? admin.credential.cert(serviceAccount) 
              : admin.credential.applicationDefault(),
          });
          this.fcmInitialized = true;
          logger.info('[MobilePush] Firebase Admin initialized');
        } else {
          logger.warn('[MobilePush] Firebase credentials not found. FCM delivery disabled.');
        }
      } else {
        this.fcmInitialized = true;
      }

      // 2. Initialize OneSignal
      const oneSignalAppId = process.env.ONESIGNAL_APP_ID;
      const oneSignalApiKey = process.env.ONESIGNAL_API_KEY;

      if (oneSignalAppId && oneSignalApiKey) {
        this.oneSignalClient = new OneSignal.Client(oneSignalAppId, oneSignalApiKey);
        logger.info('[MobilePush] OneSignal client initialized');
      } else {
        logger.warn('[MobilePush] OneSignal credentials not found. OneSignal delivery disabled.');
      }
    } catch (error) {
      logger.error('[MobilePush] Initialization failed:', error);
    }
  }

  /**
   * Send notification to a specific user across all their mobile devices
   * @param {String} userId - Recipient user ID
   * @param {Object} payload - Notification payload { title, body, data }
   */
  async sendToUser(userId, payload) {
    try {
      const preferences = await NotificationPreference.findOne({ user: userId });
      
      if (!preferences || !preferences.globalSettings.pushEnabled) {
        logger.info(`[MobilePush] User ${userId} has push disabled or no preferences`);
        return { sent: 0, failed: 0 };
      }

      const activeTokens = preferences.globalSettings.pushTokens.filter(t => t.active);
      
      if (activeTokens.length === 0) {
        logger.info(`[MobilePush] No active push tokens for user ${userId}`);
        return { sent: 0, failed: 0 };
      }

      const results = { sent: 0, failed: 0, errors: [] };

      // Dispatch to each token
      const promises = activeTokens.map(async (tokenDoc) => {
        try {
          let success = false;
          
          if (tokenDoc.platform === 'web') {
            // Web tokens handled by webPushService, skip here
            return;
          }

          // Try OneSignal first if available (preferred for rich notifications)
          if (this.oneSignalClient) {
            success = await this.sendViaOneSignal(tokenDoc.token, payload);
          }

          // Fallback to FCM if OneSignal failed or not available
          if (!success && this.fcmInitialized) {
            success = await this.sendViaFCM(tokenDoc.token, payload);
          }

          if (success) {
            results.sent++;
            tokenDoc.lastUsed = new Date();
          } else {
            results.failed++;
          }
        } catch (error) {
          results.failed++;
          results.errors.push(error.message);
          logger.error(`[MobilePush] Failed to send to token ${tokenDoc.token.substring(0, 10)}...`, error);
        }
      });

      await Promise.all(promises);
      await preferences.save();

      return results;
    } catch (error) {
      logger.error('[MobilePush] sendToUser failed:', error);
      throw error;
    }
  }

  /**
   * Send notification via FCM
   */
  async sendViaFCM(token, payload) {
    if (!this.fcmInitialized) return false;

    try {
      const message = {
        token: token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
        android: {
          priority: 'high',
          notification: {
            channelId: payload.channelId || 'default',
            icon: 'ic_notification',
            color: '#007aff',
          }
        },
        apns: {
          payload: {
            aps: {
              badge: payload.badgeCount,
              sound: 'default',
            }
          }
        }
      };

      await admin.messaging().send(message);
      return true;
    } catch (error) {
      if (error.code === 'messaging/registration-token-not-registered') {
        logger.warn(`[MobilePush] FCM token no longer valid: ${token}`);
        // Note: we should handle token deactivation in the preference doc
      }
      throw error;
    }
  }

  /**
   * Send notification via OneSignal
   */
  async sendViaOneSignal(token, payload) {
    if (!this.oneSignalClient) return false;

    try {
      const notification = {
        contents: {
          en: payload.body,
        },
        headings: {
          en: payload.title,
        },
        include_subscription_ids: [token],
        data: payload.data,
        ios_badgeType: 'SetTo',
        ios_badgeCount: payload.badgeCount,
      };

      const response = await this.oneSignalClient.createNotification(notification);
      return response.body && !response.body.errors;
    } catch (error) {
      logger.error('[MobilePush] OneSignal error:', error);
      return false;
    }
  }
}

module.exports = new MobilePushService();
