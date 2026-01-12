const EventEmitter = require('events');

/**
 * Notification Event Emitter
 *
 * Purpose: Centralized event system for triggering notifications
 * These events can be consumed by notification delivery systems (email, push, SMS, etc.)
 *
 * Events emitted:
 * - insight:published - New insight published
 * - insight:premium-published - New premium insight published
 * - subscription:granted - Premium subscription granted to user
 * - subscription:expired - User subscription expired
 * - subscription:expiring-soon - User subscription expiring soon
 * - subscription:renewed - Subscription renewed
 * - subscription:cancelled - Subscription cancelled
 */

class NotificationEventEmitter extends EventEmitter {}

const notificationEvents = new NotificationEventEmitter();

// ==================== EVENT CONSTANTS ====================

const EVENTS = {
  // Insight events
  INSIGHT_PUBLISHED: 'insight:published',
  INSIGHT_PREMIUM_PUBLISHED: 'insight:premium-published',
  INSIGHT_UNPUBLISHED: 'insight:unpublished',

  // Subscription events
  SUBSCRIPTION_GRANTED: 'subscription:granted',
  SUBSCRIPTION_UPGRADED: 'subscription:upgraded',
  SUBSCRIPTION_DOWNGRADED: 'subscription:downgraded',
  SUBSCRIPTION_EXPIRED: 'subscription:expired',
  SUBSCRIPTION_EXPIRING_SOON: 'subscription:expiring-soon',
  SUBSCRIPTION_RENEWED: 'subscription:renewed',
  SUBSCRIPTION_CANCELLED: 'subscription:cancelled'
};

// ==================== EVENT EMITTERS ====================

/**
 * Emit insight published event
 *
 * @param {Object} data - Event data
 * @param {Object} data.insight - Insight object
 * @param {ObjectId} data.authorId - Author ID
 * @param {String} data.type - 'free' or 'premium'
 */
const emitInsightPublished = (data) => {
  const { insight, authorId, type } = data;

  const eventData = {
    insightId: insight._id,
    title: insight.title,
    excerpt: insight.excerpt || insight.content.substring(0, 200),
    type: type || insight.type,
    category: insight.category,
    author: authorId,
    publishedAt: insight.publishedAt || new Date(),
    url: `/insights/${insight._id}`
  };

  // Emit general published event
  notificationEvents.emit(EVENTS.INSIGHT_PUBLISHED, eventData);

  // Emit premium-specific event if premium content
  if (type === 'premium' || insight.type === 'premium') {
    notificationEvents.emit(EVENTS.INSIGHT_PREMIUM_PUBLISHED, eventData);
  }
};

/**
 * Emit insight unpublished event
 *
 * @param {Object} data - Event data
 * @param {Object} data.insight - Insight object
 * @param {ObjectId} data.unpublishedBy - User who unpublished
 */
const emitInsightUnpublished = (data) => {
  const { insight, unpublishedBy } = data;

  const eventData = {
    insightId: insight._id,
    title: insight.title,
    type: insight.type,
    unpublishedBy,
    unpublishedAt: new Date()
  };

  notificationEvents.emit(EVENTS.INSIGHT_UNPUBLISHED, eventData);
};

/**
 * Emit subscription granted event
 *
 * @param {Object} data - Event data
 * @param {ObjectId} data.userId - User ID
 * @param {ObjectId} data.subscriptionId - Subscription ID
 * @param {String} data.tier - Subscription tier
 * @param {Date} data.endDate - Subscription end date
 * @param {String} data.source - Grant source
 * @param {ObjectId} data.grantedBy - Admin who granted
 */
const emitSubscriptionGranted = (data) => {
  const { userId, subscriptionId, tier, endDate, source, grantedBy } = data;

  const eventData = {
    userId,
    subscriptionId,
    tier,
    endDate,
    source,
    grantedBy,
    grantedAt: new Date(),
    isLifetime: !endDate,
    daysUntilExpiry: endDate ? Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)) : null
  };

  notificationEvents.emit(EVENTS.SUBSCRIPTION_GRANTED, eventData);
};

/**
 * Emit subscription upgraded event
 *
 * @param {Object} data - Event data
 * @param {ObjectId} data.userId - User ID
 * @param {ObjectId} data.subscriptionId - Subscription ID
 * @param {String} data.oldTier - Old tier
 * @param {String} data.newTier - New tier
 * @param {Date} data.endDate - Subscription end date
 */
const emitSubscriptionUpgraded = (data) => {
  const { userId, subscriptionId, oldTier, newTier, endDate } = data;

  const eventData = {
    userId,
    subscriptionId,
    oldTier,
    newTier,
    endDate,
    upgradedAt: new Date()
  };

  notificationEvents.emit(EVENTS.SUBSCRIPTION_UPGRADED, eventData);
};

/**
 * Emit subscription downgraded event
 *
 * @param {Object} data - Event data
 * @param {ObjectId} data.userId - User ID
 * @param {ObjectId} data.subscriptionId - Subscription ID
 * @param {String} data.oldTier - Old tier
 * @param {String} data.newTier - New tier
 * @param {String} data.reason - Downgrade reason
 */
const emitSubscriptionDowngraded = (data) => {
  const { userId, subscriptionId, oldTier, newTier, reason } = data;

  const eventData = {
    userId,
    subscriptionId,
    oldTier,
    newTier,
    reason,
    downgradedAt: new Date()
  };

  notificationEvents.emit(EVENTS.SUBSCRIPTION_DOWNGRADED, eventData);
};

/**
 * Emit subscription expired event
 *
 * @param {Object} data - Event data
 * @param {ObjectId} data.userId - User ID
 * @param {ObjectId} data.subscriptionId - Subscription ID
 * @param {Date} data.expiredAt - Expiration date
 * @param {String} data.tier - Tier that expired
 */
const emitSubscriptionExpired = (data) => {
  const { userId, subscriptionId, expiredAt, tier } = data;

  const eventData = {
    userId,
    subscriptionId,
    expiredAt: expiredAt || new Date(),
    tier,
    message: 'Your premium subscription has expired'
  };

  notificationEvents.emit(EVENTS.SUBSCRIPTION_EXPIRED, eventData);
};

/**
 * Emit subscription expiring soon event
 *
 * @param {Object} data - Event data
 * @param {ObjectId} data.userId - User ID
 * @param {ObjectId} data.subscriptionId - Subscription ID
 * @param {Date} data.endDate - Expiration date
 * @param {Number} data.daysRemaining - Days until expiration
 */
const emitSubscriptionExpiringSoon = (data) => {
  const { userId, subscriptionId, endDate, daysRemaining } = data;

  const eventData = {
    userId,
    subscriptionId,
    endDate,
    daysRemaining,
    message: `Your premium subscription expires in ${daysRemaining} days`
  };

  notificationEvents.emit(EVENTS.SUBSCRIPTION_EXPIRING_SOON, eventData);
};

/**
 * Emit subscription renewed event
 *
 * @param {Object} data - Event data
 * @param {ObjectId} data.userId - User ID
 * @param {ObjectId} data.subscriptionId - Subscription ID
 * @param {Date} data.oldEndDate - Old end date
 * @param {Date} data.newEndDate - New end date
 * @param {String} data.source - Renewal source
 */
const emitSubscriptionRenewed = (data) => {
  const { userId, subscriptionId, oldEndDate, newEndDate, source } = data;

  const eventData = {
    userId,
    subscriptionId,
    oldEndDate,
    newEndDate,
    source,
    renewedAt: new Date(),
    daysExtended: oldEndDate && newEndDate
      ? Math.ceil((newEndDate - oldEndDate) / (1000 * 60 * 60 * 24))
      : null
  };

  notificationEvents.emit(EVENTS.SUBSCRIPTION_RENEWED, eventData);
};

/**
 * Emit subscription cancelled event
 *
 * @param {Object} data - Event data
 * @param {ObjectId} data.userId - User ID
 * @param {ObjectId} data.subscriptionId - Subscription ID
 * @param {Date} data.endDate - When access ends
 * @param {String} data.reason - Cancellation reason
 * @param {ObjectId} data.cancelledBy - Who cancelled
 */
const emitSubscriptionCancelled = (data) => {
  const { userId, subscriptionId, endDate, reason, cancelledBy } = data;

  const eventData = {
    userId,
    subscriptionId,
    endDate,
    reason,
    cancelledBy,
    cancelledAt: new Date(),
    accessEndsAt: endDate
  };

  notificationEvents.emit(EVENTS.SUBSCRIPTION_CANCELLED, eventData);
};

// ==================== DEFAULT EVENT LISTENERS (Logging) ====================

/**
 * Default event listeners for logging
 * These can be replaced with actual notification delivery systems
 */

notificationEvents.on(EVENTS.INSIGHT_PUBLISHED, (data) => {
  console.log(`[NOTIFICATION EVENT] Insight Published: ${data.title} (${data.type})`);
  // TODO: Implement email notification to subscribed users
  // TODO: Implement push notification
});

notificationEvents.on(EVENTS.INSIGHT_PREMIUM_PUBLISHED, (data) => {
  console.log(`[NOTIFICATION EVENT] Premium Insight Published: ${data.title}`);
  // TODO: Implement email notification to premium subscribers only
  // TODO: Implement push notification to premium users
});

notificationEvents.on(EVENTS.SUBSCRIPTION_GRANTED, (data) => {
  console.log(`[NOTIFICATION EVENT] Subscription Granted: User ${data.userId} - Tier ${data.tier}`);
  // TODO: Implement welcome email with subscription details
  // TODO: Implement push notification
});

notificationEvents.on(EVENTS.SUBSCRIPTION_EXPIRED, (data) => {
  console.log(`[NOTIFICATION EVENT] Subscription Expired: User ${data.userId}`);
  // TODO: Implement expiration email with renewal options
  // TODO: Implement push notification
});

notificationEvents.on(EVENTS.SUBSCRIPTION_EXPIRING_SOON, (data) => {
  console.log(`[NOTIFICATION EVENT] Subscription Expiring Soon: User ${data.userId} - ${data.daysRemaining} days`);
  // TODO: Implement reminder email
  // TODO: Implement push notification
});

notificationEvents.on(EVENTS.SUBSCRIPTION_RENEWED, (data) => {
  console.log(`[NOTIFICATION EVENT] Subscription Renewed: User ${data.userId}`);
  // TODO: Implement renewal confirmation email
});

notificationEvents.on(EVENTS.SUBSCRIPTION_CANCELLED, (data) => {
  console.log(`[NOTIFICATION EVENT] Subscription Cancelled: User ${data.userId}`);
  // TODO: Implement cancellation confirmation email
  // TODO: Implement feedback request
});

// ==================== EXPORTS ====================

module.exports = {
  notificationEvents,
  EVENTS,

  // Event emitters
  emitInsightPublished,
  emitInsightUnpublished,
  emitSubscriptionGranted,
  emitSubscriptionUpgraded,
  emitSubscriptionDowngraded,
  emitSubscriptionExpired,
  emitSubscriptionExpiringSoon,
  emitSubscriptionRenewed,
  emitSubscriptionCancelled
};
