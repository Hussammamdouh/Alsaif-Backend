/**
 * Socket.IO Rate Limiting Middleware
 *
 * Prevents abuse of socket events by limiting the rate of messages/events per user
 * Uses in-memory storage (no Redis required)
 */

const { RATE_LIMIT } = require('../constants');

// In-memory store for tracking socket events
// Structure: Map<userId, { count: number, resetAt: timestamp }>
const userEventCounts = new Map();

// Clean up old entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of userEventCounts.entries()) {
    if (data.resetAt < now) {
      userEventCounts.delete(userId);
    }
  }
}, 5 * 60 * 1000);

/**
 * Rate limiter for socket events
 *
 * @param {string} userId - User ID
 * @param {number} maxEvents - Maximum events allowed per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {object} - { allowed: boolean, remaining: number, resetAt: number }
 */
function checkSocketRateLimit(userId, maxEvents = 20, windowMs = 60 * 1000) {
  const now = Date.now();
  const userData = userEventCounts.get(userId);

  // First event or window expired
  if (!userData || userData.resetAt < now) {
    userEventCounts.set(userId, {
      count: 1,
      resetAt: now + windowMs
    });

    return {
      allowed: true,
      remaining: maxEvents - 1,
      resetAt: now + windowMs
    };
  }

  // Increment count
  userData.count += 1;

  // Check if limit exceeded
  if (userData.count > maxEvents) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: userData.resetAt
    };
  }

  return {
    allowed: true,
    remaining: maxEvents - userData.count,
    resetAt: userData.resetAt
  };
}

/**
 * Create socket rate limit middleware for specific event
 *
 * @param {string} eventName - Name of the event to rate limit
 * @param {number} maxEvents - Maximum events per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {function} - Middleware function
 */
function socketRateLimiter(eventName, maxEvents, windowMs) {
  return async function (socket, next) {
    const userId = socket.user?.id;

    if (!userId) {
      // Not authenticated - allow to pass through
      // (will be caught by auth middleware)
      return next();
    }

    const result = checkSocketRateLimit(userId, maxEvents, windowMs);

    if (!result.allowed) {
      const error = new Error('Rate limit exceeded');
      error.data = {
        type: 'RATE_LIMIT_EXCEEDED',
        event: eventName,
        resetAt: result.resetAt,
        message: `Too many ${eventName} events. Try again later.`
      };
      return next(error);
    }

    // Attach rate limit info to socket for monitoring
    socket.rateLimit = result;
    next();
  };
}

/**
 * Wrap socket event handler with rate limiting
 *
 * @param {function} handler - Original event handler
 * @param {object} options - Rate limit options
 * @returns {function} - Wrapped handler
 */
function rateLimitedHandler(handler, options = {}) {
  const {
    maxEvents = RATE_LIMIT.MESSAGE_LIMIT,
    windowMs = 60 * 1000,
    errorMessage = 'Too many events. Please slow down.'
  } = options;

  return async function (data, callback) {
    const socket = this;
    const userId = socket.user?.id;

    if (!userId) {
      if (callback) {
        callback({ error: 'Not authenticated' });
      }
      return;
    }

    const result = checkSocketRateLimit(userId, maxEvents, windowMs);

    if (!result.allowed) {
      if (callback) {
        callback({
          error: errorMessage,
          resetAt: result.resetAt
        });
      }
      return;
    }

    // Call original handler
    return handler.call(socket, data, callback);
  };
}

/**
 * Get current rate limit status for user
 *
 * @param {string} userId - User ID
 * @returns {object|null} - Rate limit data or null
 */
function getRateLimitStatus(userId) {
  const userData = userEventCounts.get(userId);

  if (!userData) {
    return null;
  }

  const now = Date.now();

  if (userData.resetAt < now) {
    userEventCounts.delete(userId);
    return null;
  }

  return {
    count: userData.count,
    resetAt: userData.resetAt,
    remainingMs: userData.resetAt - now
  };
}

/**
 * Clear rate limit for specific user (admin use)
 *
 * @param {string} userId - User ID
 */
function clearUserRateLimit(userId) {
  userEventCounts.delete(userId);
}

/**
 * Get statistics about rate limiting
 *
 * @returns {object} - Statistics
 */
function getRateLimitStats() {
  return {
    totalTrackedUsers: userEventCounts.size,
    memoryUsageEstimate: userEventCounts.size * 64 + ' bytes' // Rough estimate
  };
}

module.exports = {
  socketRateLimiter,
  rateLimitedHandler,
  checkSocketRateLimit,
  getRateLimitStatus,
  clearUserRateLimit,
  getRateLimitStats
};
