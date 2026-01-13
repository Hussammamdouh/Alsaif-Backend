const EventEmitter = require('events');

/**
 * Enhanced Notification Event Emitter
 *
 * Purpose: Comprehensive event system for ALL notification scenarios
 * Supports: Email, Push, SMS, In-App notifications
 *
 * Event Categories:
 * 1. Subscription Events (Lifecycle, Reminders, Payments)
 * 2. Content Events (Publishing, Updates, Recommendations)
 * 3. User Engagement Events (Comments, Likes, Follows)
 * 4. System Events (Alerts, Warnings, Announcements)
 */

class EnhancedNotificationEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Allow multiple listeners per event
  }
}

const notificationEvents = new EnhancedNotificationEmitter();

// ==================== EVENT CONSTANTS ====================

const NOTIFICATION_EVENTS = {
  // ========== SUBSCRIPTION LIFECYCLE EVENTS ==========
  SUBSCRIPTION_CREATED: 'subscription:created',
  SUBSCRIPTION_GRANTED: 'subscription:granted',
  SUBSCRIPTION_UPGRADED: 'subscription:upgraded',
  SUBSCRIPTION_DOWNGRADED: 'subscription:downgraded',
  SUBSCRIPTION_RENEWED: 'subscription:renewed',
  SUBSCRIPTION_EXTENDED: 'subscription:extended',
  SUBSCRIPTION_CANCELLED: 'subscription:cancelled',
  SUBSCRIPTION_EXPIRED: 'subscription:expired',

  // ========== SUBSCRIPTION REMINDER EVENTS ==========
  SUBSCRIPTION_EXPIRING_SOON: 'subscription:expiring-soon',
  SUBSCRIPTION_EXPIRING_TODAY: 'subscription:expiring-today',
  SUBSCRIPTION_EXPIRED_REMINDER: 'subscription:expired-reminder',
  SUBSCRIPTION_RENEWAL_REMINDER: 'subscription:renewal-reminder',

  // ========== SUBSCRIPTION TRIAL EVENTS ==========
  TRIAL_STARTED: 'trial:started',
  TRIAL_ENDING_SOON: 'trial:ending-soon',
  TRIAL_ENDED: 'trial:ended',
  TRIAL_CONVERTED: 'trial:converted',

  // ========== CONTENT PUBLISHING EVENTS ==========
  INSIGHT_PUBLISHED: 'insight:published',
  INSIGHT_PREMIUM_PUBLISHED: 'insight:premium-published',
  INSIGHT_FREE_PUBLISHED: 'insight:free-published',
  INSIGHT_UPDATED: 'insight:updated',
  INSIGHT_UNPUBLISHED: 'insight:unpublished',
  INSIGHT_DELETED: 'insight:deleted',
  INSIGHT_FEATURED: 'insight:featured',
  INSIGHT_UNFEATURED: 'insight:unfeatured',

  // ========== CONTENT RECOMMENDATION EVENTS ==========
  NEW_CONTENT_AVAILABLE: 'content:new-available',
  RECOMMENDED_CONTENT: 'content:recommended',
  TRENDING_CONTENT: 'content:trending',
  PERSONALIZED_DIGEST: 'content:digest',

  // ========== INSIGHT REQUEST EVENTS ==========
  INSIGHT_REQUEST_SUBMITTED: 'insight_request:submitted',
  INSIGHT_REQUEST_APPROVED: 'insight_request:approved',
  INSIGHT_REQUEST_REJECTED: 'insight_request:rejected',

  // ========== USER ENGAGEMENT EVENTS ==========
  INSIGHT_LIKED: 'engagement:insight-liked',
  INSIGHT_COMMENTED: 'engagement:insight-commented',
  COMMENT_REPLIED: 'engagement:comment-replied',
  USER_FOLLOWED: 'engagement:user-followed',
  AUTHOR_NEW_POST: 'engagement:author-new-post',

  // ========== PREMIUM ACCESS EVENTS ==========
  PREMIUM_ACCESS_GRANTED: 'premium:access-granted',
  PREMIUM_ACCESS_DENIED: 'premium:access-denied',
  PREMIUM_CONTENT_UNLOCKED: 'premium:content-unlocked',
  PREMIUM_FEATURE_AVAILABLE: 'premium:feature-available',

  // ========== SYSTEM & ADMIN EVENTS ==========
  WELCOME_NEW_USER: 'system:welcome',
  ACCOUNT_VERIFIED: 'system:account-verified',
  PASSWORD_RESET_REQUEST: 'system:password-reset',
  SECURITY_ALERT: 'system:security-alert',
  SYSTEM_ANNOUNCEMENT: 'system:announcement',
  MAINTENANCE_SCHEDULED: 'system:maintenance',

  // ========== PAYMENT EVENTS (Future) ==========
  PAYMENT_SUCCESS: 'payment:success',
  PAYMENT_FAILED: 'payment:failed',
  PAYMENT_REFUNDED: 'payment:refunded',
  INVOICE_GENERATED: 'payment:invoice',
  PAYMENT_METHOD_EXPIRING: 'payment:method-expiring'
};

// ==================== NOTIFICATION CHANNELS ====================

const NOTIFICATION_CHANNELS = {
  EMAIL: 'email',
  PUSH: 'push',
  SMS: 'sms',
  IN_APP: 'in-app',
  WEBHOOK: 'webhook'
};

// ==================== NOTIFICATION PRIORITIES ====================

const NOTIFICATION_PRIORITIES = {
  CRITICAL: 'critical',    // Immediate delivery (security, payment issues)
  HIGH: 'high',           // Quick delivery (expiration, new premium content)
  MEDIUM: 'medium',       // Normal delivery (new content, recommendations)
  LOW: 'low'              // Batched delivery (digests, summaries)
};

// ==================== EVENT EMITTER FUNCTIONS ====================

/**
 * Base notification emitter with common structure
 */
const emitNotification = (eventName, data, options = {}) => {
  const notification = {
    event: eventName,
    timestamp: new Date(),
    priority: options.priority || NOTIFICATION_PRIORITIES.MEDIUM,
    channels: options.channels || [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.IN_APP],
    data,
    metadata: {
      source: options.source || 'system',
      retryable: options.retryable !== false,
      expiresAt: options.expiresAt || null,
      ...options.metadata
    }
  };

  notificationEvents.emit(eventName, notification);

  // Also emit a generic 'notification' event for centralized logging
  notificationEvents.emit('notification', notification);

  return notification;
};

// ========== SUBSCRIPTION LIFECYCLE EMITTERS ==========

/**
 * Emit subscription created event (for new users)
 */
const emitSubscriptionCreated = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.SUBSCRIPTION_CREATED, {
    userId: data.userId,
    subscriptionId: data.subscriptionId,
    tier: data.tier,
    startDate: data.startDate,
    endDate: data.endDate,
    source: data.source,
    welcome: {
      userName: data.userName,
      benefits: [
        'Access to all free insights',
        'Market analysis and trading tips',
        'Educational content',
        'Community discussions'
      ]
    }
  }, {
    priority: NOTIFICATION_PRIORITIES.HIGH,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.IN_APP]
  });
};

/**
 * Emit subscription granted event (admin grants premium)
 */
const emitSubscriptionGranted = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.SUBSCRIPTION_GRANTED, {
    userId: data.userId,
    subscriptionId: data.subscriptionId,
    tier: data.tier,
    endDate: data.endDate,
    source: data.source,
    grantedBy: data.grantedBy,
    grantedAt: data.grantedAt || new Date(),
    isLifetime: !data.endDate,
    daysUntilExpiry: data.endDate
      ? Math.ceil((new Date(data.endDate) - new Date()) / (1000 * 60 * 60 * 24))
      : null,
    benefits: [
      'Unlimited access to all premium insights',
      'Advanced market analysis and trading strategies',
      'Exclusive expert commentary',
      'Priority support',
      'Ad-free experience',
      'Early access to new features'
    ],
    ctaUrl: '/insights/premium'
  }, {
    priority: NOTIFICATION_PRIORITIES.HIGH,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.PUSH, NOTIFICATION_CHANNELS.IN_APP]
  });
};

/**
 * Emit subscription upgraded event
 */
const emitSubscriptionUpgraded = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.SUBSCRIPTION_UPGRADED, {
    userId: data.userId,
    subscriptionId: data.subscriptionId,
    oldTier: data.oldTier,
    newTier: data.newTier,
    endDate: data.endDate,
    upgradedAt: new Date(),
    newFeatures: [
      'Access to premium insights unlocked',
      'Advanced analytics now available',
      'Exclusive content library access'
    ],
    ctaUrl: '/insights/premium'
  }, {
    priority: NOTIFICATION_PRIORITIES.HIGH,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.PUSH, NOTIFICATION_CHANNELS.IN_APP]
  });
};

/**
 * Emit subscription downgraded event
 */
const emitSubscriptionDowngraded = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.SUBSCRIPTION_DOWNGRADED, {
    userId: data.userId,
    subscriptionId: data.subscriptionId,
    oldTier: data.oldTier,
    newTier: data.newTier,
    reason: data.reason,
    downgradedAt: new Date(),
    lostFeatures: [
      'Premium insights access',
      'Advanced analytics',
      'Exclusive content'
    ],
    upgradeUrl: '/subscriptions/upgrade'
  }, {
    priority: NOTIFICATION_PRIORITIES.MEDIUM,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.IN_APP]
  });
};

/**
 * Emit subscription renewed event
 */
const emitSubscriptionRenewed = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.SUBSCRIPTION_RENEWED, {
    userId: data.userId,
    subscriptionId: data.subscriptionId,
    oldEndDate: data.oldEndDate,
    newEndDate: data.newEndDate,
    source: data.source,
    renewedAt: new Date(),
    daysExtended: data.oldEndDate && data.newEndDate
      ? Math.ceil((new Date(data.newEndDate) - new Date(data.oldEndDate)) / (1000 * 60 * 60 * 24))
      : null,
    thankYouMessage: 'Thank you for continuing your premium membership!',
    ctaUrl: '/insights/premium'
  }, {
    priority: NOTIFICATION_PRIORITIES.MEDIUM,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.IN_APP]
  });
};

/**
 * Emit subscription extended event
 */
const emitSubscriptionExtended = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.SUBSCRIPTION_EXTENDED, {
    userId: data.userId,
    subscriptionId: data.subscriptionId,
    oldEndDate: data.oldEndDate,
    newEndDate: data.newEndDate,
    daysAdded: Math.ceil((new Date(data.newEndDate) - new Date(data.oldEndDate)) / (1000 * 60 * 60 * 24)),
    reason: data.reason,
    extendedBy: data.extendedBy,
    extendedAt: new Date()
  }, {
    priority: NOTIFICATION_PRIORITIES.MEDIUM,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.IN_APP]
  });
};

/**
 * Emit subscription cancelled event
 */
const emitSubscriptionCancelled = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.SUBSCRIPTION_CANCELLED, {
    userId: data.userId,
    subscriptionId: data.subscriptionId,
    endDate: data.endDate,
    accessEndsAt: data.endDate,
    reason: data.reason,
    cancelledBy: data.cancelledBy,
    cancelledAt: new Date(),
    feedbackUrl: '/feedback/cancellation',
    reactivateUrl: '/subscriptions/reactivate',
    message: data.endDate
      ? `Your premium access will remain active until ${new Date(data.endDate).toLocaleDateString()}`
      : 'Your premium access has been cancelled'
  }, {
    priority: NOTIFICATION_PRIORITIES.MEDIUM,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.IN_APP]
  });
};

/**
 * Emit subscription expired event
 */
const emitSubscriptionExpired = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.SUBSCRIPTION_EXPIRED, {
    userId: data.userId,
    subscriptionId: data.subscriptionId,
    expiredAt: data.expiredAt || new Date(),
    tier: data.tier,
    message: 'Your premium subscription has expired',
    renewalOptions: {
      monthly: { price: 9.99, savings: 0 },
      quarterly: { price: 24.99, savings: 5 },
      yearly: { price: 89.99, savings: 30 }
    },
    renewUrl: '/subscriptions/renew',
    benefits: [
      'Continue accessing premium insights',
      'Keep your advanced analytics',
      'Maintain priority support'
    ]
  }, {
    priority: NOTIFICATION_PRIORITIES.HIGH,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.PUSH, NOTIFICATION_CHANNELS.IN_APP]
  });
};

// ========== SUBSCRIPTION REMINDER EMITTERS ==========

/**
 * Emit subscription expiring soon event
 */
const emitSubscriptionExpiringSoon = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.SUBSCRIPTION_EXPIRING_SOON, {
    userId: data.userId,
    subscriptionId: data.subscriptionId,
    endDate: data.endDate,
    daysRemaining: data.daysRemaining,
    message: `Your premium subscription expires in ${data.daysRemaining} day${data.daysRemaining !== 1 ? 's' : ''}`,
    renewUrl: '/subscriptions/renew',
    autoRenewEnabled: data.autoRenewEnabled || false
  }, {
    priority: NOTIFICATION_PRIORITIES.HIGH,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.PUSH, NOTIFICATION_CHANNELS.IN_APP]
  });
};

/**
 * Emit subscription expiring today event
 */
const emitSubscriptionExpiringToday = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.SUBSCRIPTION_EXPIRING_TODAY, {
    userId: data.userId,
    subscriptionId: data.subscriptionId,
    endDate: data.endDate,
    message: 'Your premium subscription expires today!',
    urgentMessage: 'Renew now to avoid losing access to premium content',
    renewUrl: '/subscriptions/renew'
  }, {
    priority: NOTIFICATION_PRIORITIES.CRITICAL,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.PUSH, NOTIFICATION_CHANNELS.IN_APP, NOTIFICATION_CHANNELS.SMS]
  });
};

/**
 * Emit post-expiration reminder
 */
const emitSubscriptionExpiredReminder = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.SUBSCRIPTION_EXPIRED_REMINDER, {
    userId: data.userId,
    daysExpired: data.daysExpired,
    message: `It's been ${data.daysExpired} days since your premium subscription expired`,
    specialOffer: data.specialOffer || null,
    renewUrl: '/subscriptions/renew'
  }, {
    priority: NOTIFICATION_PRIORITIES.MEDIUM,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.IN_APP]
  });
};

// ========== CONTENT PUBLISHING EMITTERS ==========

/**
 * Emit insight published event (ALL users)
 */
const emitInsightPublished = (data) => {
  const baseNotification = {
    insightId: data.insightId || data.insight?._id,
    title: data.title || data.insight?.title,
    excerpt: data.excerpt || data.insight?.excerpt || (data.insight?.content?.substring(0, 200) + '...'),
    type: data.type || data.insight?.type,
    category: data.category || data.insight?.category,
    author: data.author || data.authorId,
    authorName: data.authorName,
    publishedAt: data.publishedAt || data.insight?.publishedAt || new Date(),
    url: data.url || `/insights/${data.insightId || data.insight?._id}`,
    coverImage: data.coverImage || data.insight?.coverImage,
    tags: data.tags || data.insight?.tags || [],
    readTime: data.readTime || Math.ceil((data.insight?.content?.length || 0) / 200) + ' min read'
  };

  // Emit general published event
  emitNotification(NOTIFICATION_EVENTS.INSIGHT_PUBLISHED, baseNotification, {
    priority: NOTIFICATION_PRIORITIES.MEDIUM,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.PUSH, NOTIFICATION_CHANNELS.IN_APP]
  });

  // Emit type-specific events
  if (baseNotification.type === 'premium') {
    emitNotification(NOTIFICATION_EVENTS.INSIGHT_PREMIUM_PUBLISHED, {
      ...baseNotification,
      premiumBadge: true,
      upgradePrompt: 'Upgrade to premium to access this exclusive content',
      upgradeUrl: '/subscriptions/upgrade'
    }, {
      priority: NOTIFICATION_PRIORITIES.HIGH,
      channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.PUSH, NOTIFICATION_CHANNELS.IN_APP]
    });
  } else {
    emitNotification(NOTIFICATION_EVENTS.INSIGHT_FREE_PUBLISHED, baseNotification, {
      priority: NOTIFICATION_PRIORITIES.MEDIUM,
      channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.IN_APP]
    });
  }
};

/**
 * Emit insight updated event
 */
const emitInsightUpdated = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.INSIGHT_UPDATED, {
    insightId: data.insightId,
    title: data.title,
    type: data.type,
    updatedAt: new Date(),
    changes: data.changes || [],
    url: `/insights/${data.insightId}`,
    message: 'An insight you follow has been updated'
  }, {
    priority: NOTIFICATION_PRIORITIES.LOW,
    channels: [NOTIFICATION_CHANNELS.IN_APP]
  });
};

/**
 * Emit insight unpublished event
 */
const emitInsightUnpublished = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.INSIGHT_UNPUBLISHED, {
    insightId: data.insightId || data.insight?._id,
    title: data.title || data.insight?.title,
    type: data.type || data.insight?.type,
    unpublishedBy: data.unpublishedBy,
    unpublishedAt: new Date(),
    reason: data.reason
  }, {
    priority: NOTIFICATION_PRIORITIES.LOW,
    channels: [NOTIFICATION_CHANNELS.IN_APP]
  });
};

/**
 * Emit insight featured event
 */
const emitInsightFeatured = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.INSIGHT_FEATURED, {
    insightId: data.insightId,
    title: data.title,
    type: data.type,
    excerpt: data.excerpt,
    featuredAt: new Date(),
    url: `/insights/${data.insightId}`,
    message: 'Check out this featured insight!'
  }, {
    priority: NOTIFICATION_PRIORITIES.MEDIUM,
    channels: [NOTIFICATION_CHANNELS.PUSH, NOTIFICATION_CHANNELS.IN_APP]
  });
};

// ========== CONTENT RECOMMENDATION EMITTERS ==========

/**
 * Emit new content available notification
 */
const emitNewContentAvailable = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.NEW_CONTENT_AVAILABLE, {
    count: data.count,
    contentType: data.contentType,
    category: data.category,
    since: data.since,
    url: data.url || '/insights/published',
    message: `${data.count} new insight${data.count !== 1 ? 's' : ''} available in ${data.category || 'your interests'}`
  }, {
    priority: NOTIFICATION_PRIORITIES.LOW,
    channels: [NOTIFICATION_CHANNELS.IN_APP, NOTIFICATION_CHANNELS.EMAIL]
  });
};

/**
 * Emit personalized content digest
 */
const emitPersonalizedDigest = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.PERSONALIZED_DIGEST, {
    userId: data.userId,
    period: data.period || 'daily',
    insights: data.insights || [],
    topCategories: data.topCategories || [],
    trendingTopics: data.trendingTopics || [],
    recommendedAuthors: data.recommendedAuthors || [],
    url: '/insights/digest'
  }, {
    priority: NOTIFICATION_PRIORITIES.LOW,
    channels: [NOTIFICATION_CHANNELS.EMAIL]
  });
};

// ========== PREMIUM ACCESS EMITTERS ==========

/**
 * Emit premium content unlocked event
 */
const emitPremiumContentUnlocked = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.PREMIUM_CONTENT_UNLOCKED, {
    userId: data.userId,
    contentCount: data.contentCount,
    categories: data.categories || [],
    message: `You now have access to ${data.contentCount}+ premium insights!`,
    ctaUrl: '/insights/premium'
  }, {
    priority: NOTIFICATION_PRIORITIES.HIGH,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.PUSH, NOTIFICATION_CHANNELS.IN_APP]
  });
};

/**
 * Emit premium access denied event (for logging/analytics)
 */
const emitPremiumAccessDenied = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.PREMIUM_ACCESS_DENIED, {
    userId: data.userId,
    insightId: data.insightId,
    insightTitle: data.insightTitle,
    deniedAt: new Date(),
    upgradeUrl: '/subscriptions/upgrade'
  }, {
    priority: NOTIFICATION_PRIORITIES.LOW,
    channels: [NOTIFICATION_CHANNELS.IN_APP],
    metadata: { trackConversion: true }
  });
};

// ========== SYSTEM EMITTERS ==========

/**
 * Emit welcome new user event
 */
const emitWelcomeNewUser = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.WELCOME_NEW_USER, {
    userId: data.userId,
    userName: data.userName,
    email: data.email,
    registeredAt: new Date(),
    onboardingSteps: [
      'Complete your profile',
      'Explore free insights',
      'Follow your favorite categories',
      'Consider premium for exclusive content'
    ],
    ctaUrl: '/onboarding'
  }, {
    priority: NOTIFICATION_PRIORITIES.HIGH,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.IN_APP]
  });
};

// ========== INSIGHT REQUEST EMITTERS ==========

/**
 * Emit insight request submitted event (to Admins)
 */
const emitInsightRequestSubmitted = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.INSIGHT_REQUEST_SUBMITTED, {
    requestId: data.requestId,
    userId: data.userId,
    userName: data.userName,
    title: data.title,
    message: `New insight request from ${data.userName}: ${data.title}`,
    adminUrl: `/admin/insights/requests`
  }, {
    priority: NOTIFICATION_PRIORITIES.HIGH,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.IN_APP]
  });
};

/**
 * Emit insight request approved event (to User)
 */
const emitInsightRequestApproved = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.INSIGHT_REQUEST_APPROVED, {
    userId: data.userId,
    title: data.title,
    targetType: data.targetType,
    targetId: data.targetId,
    message: `Your insight request "${data.title}" has been approved!`,
    ctaUrl: data.targetType.includes('chat') ? `/chats/${data.targetId}` : `/insights/${data.targetId}`
  }, {
    priority: NOTIFICATION_PRIORITIES.HIGH,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.PUSH, NOTIFICATION_CHANNELS.IN_APP]
  });
};

/**
 * Emit insight request rejected event (to User)
 */
const emitInsightRequestRejected = (data) => {
  return emitNotification(NOTIFICATION_EVENTS.INSIGHT_REQUEST_REJECTED, {
    userId: data.userId,
    title: data.title,
    reason: data.reason,
    message: `Your insight request "${data.title}" was rejected.`,
    rejectionReason: data.reason
  }, {
    priority: NOTIFICATION_PRIORITIES.MEDIUM,
    channels: [NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.IN_APP]
  });
};

// ==================== EXPORTS ====================

module.exports = {
  notificationEvents,
  NOTIFICATION_EVENTS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PRIORITIES,

  // Base emitter
  emitNotification,

  // Subscription lifecycle
  emitSubscriptionCreated,
  emitSubscriptionGranted,
  emitSubscriptionUpgraded,
  emitSubscriptionDowngraded,
  emitSubscriptionRenewed,
  emitSubscriptionExtended,
  emitSubscriptionCancelled,
  emitSubscriptionExpired,

  // Subscription reminders
  emitSubscriptionExpiringSoon,
  emitSubscriptionExpiringToday,
  emitSubscriptionExpiredReminder,

  // Content publishing
  emitInsightPublished,
  emitInsightUpdated,
  emitInsightUnpublished,
  emitInsightFeatured,

  // Content recommendations
  emitNewContentAvailable,
  emitPersonalizedDigest,

  // Premium access
  emitPremiumContentUnlocked,
  emitPremiumAccessDenied,

  // System
  emitWelcomeNewUser,

  // Insight requests
  emitInsightRequestSubmitted,
  emitInsightRequestApproved,
  emitInsightRequestRejected
};
