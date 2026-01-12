const rateLimit = require('express-rate-limit');

/**
 * Rate Limiters for various endpoints
 * Protects against brute force and DoS attacks
 */

// General rate limiter for most endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter limiter for sensitive operations
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Profile update limiter
const updateProfileLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 profile updates per hour
  message: 'Too many profile update attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Settings update limiter
const updateSettingsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 settings updates per 15 minutes
  message: 'Too many settings update attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Session revocation limiter
const revokeSessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 session revocations per 15 minutes
  message: 'Too many session revocation attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  rateLimiters: {
    general: generalLimiter,
    strict: strictLimiter,
    updateProfile: updateProfileLimiter,
    updateSettings: updateSettingsLimiter,
    revokeSession: revokeSessionLimiter
  }
};
