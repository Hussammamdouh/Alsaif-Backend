const rateLimit = require('express-rate-limit');
const { RATE_LIMIT, HTTP_STATUS, ROLES } = require('../constants');
const logger = require('../utils/logger');

/**
 * Advanced Rate Limiting Middleware
 *
 * Features:
 * - Role-aware rate limiting (different limits per role)
 * - User-based limiting (not just IP-based)
 * - Bypass for superadmins
 * - Custom handlers for different endpoints
 * - Detailed logging
 */

/**
 * Role-aware API rate limiter
 * Applies different rate limits based on user role
 */
const roleAwareApiLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS, // 15 minutes

  // Dynamic max based on user role
  max: (req) => {
    if (!req.user) {
      return RATE_LIMIT.MAX_REQUESTS; // 100 for unauthenticated
    }

    switch (req.user.role) {
      case ROLES.SUPERADMIN:
        return 0; // No limit for superadmins
      case ROLES.ADMIN:
        return RATE_LIMIT.MAX_REQUESTS * 3; // 300 for admins
      case ROLES.USER:
        return RATE_LIMIT.MAX_REQUESTS; // 100 for regular users
      default:
        return RATE_LIMIT.MAX_REQUESTS;
    }
  },

  // Use user ID if authenticated, otherwise IP
  keyGenerator: (req) => {
    if (req.user && req.user.id) {
      return `user:${req.user.id}`;
    }
    return `ip:${req.ip}`;
  },

  // Skip rate limiting for superadmins
  skip: (req) => {
    return req.user && req.user.role === ROLES.SUPERADMIN;
  },

  message: (req) => {
    const userInfo = req.user ? `user ${req.user.email}` : `IP ${req.ip}`;
    logger.warn(`Rate limit exceeded for ${userInfo} on ${req.path}`);

    return {
      success: false,
      message: 'Too many requests, please try again later',
      retryAfter: Math.ceil(RATE_LIMIT.WINDOW_MS / 1000 / 60) // in minutes
    };
  },

  standardHeaders: true,
  legacyHeaders: false,
  statusCode: HTTP_STATUS.TOO_MANY_REQUESTS
});

/**
 * Message sending rate limiter
 * Prevents spam in chat messages
 */
const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window

  max: (req) => {
    if (!req.user) return 5; // Very low for unauthenticated

    switch (req.user.role) {
      case ROLES.SUPERADMIN:
        return 0; // No limit
      case ROLES.ADMIN:
        return 100; // 100 messages per minute
      case ROLES.USER:
        return 20; // 20 messages per minute for regular users
      default:
        return 10;
    }
  },

  keyGenerator: (req) => {
    if (req.user && req.user.id) {
      return `message:${req.user.id}`;
    }
    return `message:ip:${req.ip}`;
  },

  skip: (req) => {
    return req.user && req.user.role === ROLES.SUPERADMIN;
  },

  message: {
    success: false,
    message: 'You are sending messages too quickly. Please slow down.',
    type: 'MESSAGE_RATE_LIMIT'
  },

  standardHeaders: true,
  legacyHeaders: false,
  statusCode: HTTP_STATUS.TOO_MANY_REQUESTS
});

/**
 * Content creation rate limiter
 * Prevents spam creation of insights, chats, etc.
 */
const contentCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window

  max: (req) => {
    if (!req.user) return 0; // No creation without auth

    switch (req.user.role) {
      case ROLES.SUPERADMIN:
        return 0; // No limit
      case ROLES.ADMIN:
        return 200; // 200 creations per hour
      case ROLES.USER:
        return 10; // 10 creations per hour
      default:
        return 5;
    }
  },

  keyGenerator: (req) => {
    return `create:${req.user.id}:${req.baseUrl}`;
  },

  skip: (req) => {
    return req.user && req.user.role === ROLES.SUPERADMIN;
  },

  message: {
    success: false,
    message: 'You have created too many items. Please try again later.',
    type: 'CREATION_RATE_LIMIT'
  },

  standardHeaders: true,
  legacyHeaders: false,
  statusCode: HTTP_STATUS.TOO_MANY_REQUESTS
});

/**
 * Strict limiter for sensitive operations
 * Used for password resets, account deletions, etc.
 */
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 attempts per hour

  keyGenerator: (req) => {
    if (req.user && req.user.id) {
      return `strict:${req.user.id}:${req.path}`;
    }
    return `strict:ip:${req.ip}:${req.path}`;
  },

  message: {
    success: false,
    message: 'Too many attempts for this sensitive operation. Please try again later.',
    type: 'STRICT_RATE_LIMIT'
  },

  standardHeaders: true,
  legacyHeaders: false,
  statusCode: HTTP_STATUS.TOO_MANY_REQUESTS
});

/**
 * Bulk operation rate limiter
 * Prevents abuse of bulk operations
 */
const bulkOperationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 bulk operations per hour

  keyGenerator: (req) => {
    return `bulk:${req.user.id}`;
  },

  skip: (req) => {
    return req.user && req.user.role === ROLES.SUPERADMIN;
  },

  message: {
    success: false,
    message: 'Too many bulk operations. Please try again later.',
    type: 'BULK_OPERATION_RATE_LIMIT'
  },

  standardHeaders: true,
  legacyHeaders: false,
  statusCode: HTTP_STATUS.TOO_MANY_REQUESTS
});

/**
 * File upload rate limiter
 * Prevents abuse of file uploads
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour

  max: (req) => {
    if (!req.user) return 5;

    switch (req.user.role) {
      case ROLES.SUPERADMIN:
      case ROLES.ADMIN:
        return 100;
      case ROLES.USER:
        return 20;
      default:
        return 10;
    }
  },

  keyGenerator: (req) => {
    if (req.user && req.user.id) {
      return `upload:${req.user.id}`;
    }
    return `upload:ip:${req.ip}`;
  },

  skip: (req) => {
    return req.user && req.user.role === ROLES.SUPERADMIN;
  },

  message: {
    success: false,
    message: 'Too many upload attempts. Please try again later.',
    type: 'UPLOAD_RATE_LIMIT'
  },

  standardHeaders: true,
  legacyHeaders: false,
  statusCode: HTTP_STATUS.TOO_MANY_REQUESTS
});

/**
 * Dynamic rate limiter factory
 * Creates custom rate limiters on the fly
 */
const createDynamicLimiter = ({
  windowMs = 15 * 60 * 1000,
  maxDefault = 100,
  maxAdmin = 300,
  maxSuperadmin = 0, // 0 = no limit
  keyPrefix = 'dynamic',
  skipSuperadmin = true,
  message = 'Too many requests'
}) => {
  return rateLimit({
    windowMs,
    max: (req) => {
      if (!req.user) return maxDefault;

      switch (req.user.role) {
        case ROLES.SUPERADMIN:
          return maxSuperadmin;
        case ROLES.ADMIN:
          return maxAdmin;
        case ROLES.USER:
          return maxDefault;
        default:
          return maxDefault;
      }
    },
    keyGenerator: (req) => {
      if (req.user && req.user.id) {
        return `${keyPrefix}:${req.user.id}`;
      }
      return `${keyPrefix}:ip:${req.ip}`;
    },
    skip: (req) => {
      return skipSuperadmin && req.user && req.user.role === ROLES.SUPERADMIN;
    },
    message: {
      success: false,
      message,
      type: 'CUSTOM_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: HTTP_STATUS.TOO_MANY_REQUESTS
  });
};

/**
 * SECURITY FIX (HIGH-001): Admin Analytics Rate Limiter
 *
 * Prevents DoS via compromised admin accounts accessing expensive analytics/reporting endpoints
 * Stricter limits than general API (50 req/15min for admins vs 300 req/15min)
 */
const adminAnalyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes

  max: (req) => {
    if (!req.user) return 0; // Analytics require auth

    switch (req.user.role) {
      case ROLES.SUPERADMIN:
        return 100; // Higher limit for superadmins but still capped
      case ROLES.ADMIN:
        return 50; // 50 analytics requests per 15min for admins
      default:
        return 0; // Only admins can access analytics
    }
  },

  keyGenerator: (req) => {
    return `admin-analytics:${req.user.id}:${req.path}`;
  },

  skip: () => {
    // Even superadmins get rate limited (just higher limit)
    return false;
  },

  message: {
    success: false,
    message: 'Too many analytics requests. Please wait before trying again.',
    type: 'ADMIN_ANALYTICS_RATE_LIMIT'
  },

  standardHeaders: true,
  legacyHeaders: false,
  statusCode: HTTP_STATUS.TOO_MANY_REQUESTS
});

/**
 * Engagement rate limiter
 * Prevents spam for comments, likes, and other engagement actions
 */
const engagementLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window

  max: (req) => {
    if (!req.user) return 5; // Very low for unauthenticated

    switch (req.user.role) {
      case ROLES.SUPERADMIN:
        return 0; // No limit
      case ROLES.ADMIN:
        return 60; // 60 engagement actions per minute
      case ROLES.USER:
        return 30; // 30 engagement actions per minute for regular users
      default:
        return 10;
    }
  },

  keyGenerator: (req) => {
    if (req.user && req.user.id) {
      return `engagement:${req.user.id}`;
    }
    return `engagement:ip:${req.ip}`;
  },

  skip: (req) => {
    return req.user && req.user.role === ROLES.SUPERADMIN;
  },

  message: {
    success: false,
    message: 'You are performing actions too quickly. Please slow down.',
    type: 'ENGAGEMENT_RATE_LIMIT'
  },

  standardHeaders: true,
  legacyHeaders: false,
  statusCode: HTTP_STATUS.TOO_MANY_REQUESTS
});

module.exports = {
  roleAwareApiLimiter,
  messageLimiter,
  contentCreationLimiter,
  strictLimiter,
  bulkOperationLimiter,
  uploadLimiter,
  createDynamicLimiter,
  adminAnalyticsLimiter,
  engagementLimiter
};
