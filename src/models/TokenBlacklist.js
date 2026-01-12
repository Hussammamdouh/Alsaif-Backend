const mongoose = require('mongoose');

/**
 * Token Blacklist Model
 *
 * SECURITY FIX (CRITICAL): Blacklist for revoked JWT access tokens
 *
 * Purpose:
 * - Track access tokens that have been explicitly revoked (via logout)
 * - Prevent token reuse after logout, even if token hasn't expired
 * - Addresses the stateless JWT limitation
 *
 * Design Decisions:
 * - Store JTI (JWT ID) instead of full token to save space
 * - TTL index automatically removes expired entries (no manual cleanup needed)
 * - Fast lookups via indexed jti field
 */

const tokenBlacklistSchema = new mongoose.Schema(
  {
    // JWT ID (jti claim) - unique identifier for each token
    jti: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    // User who owned this token (for audit purposes)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Reason for revocation
    reason: {
      type: String,
      enum: ['logout', 'logout_all', 'compromised', 'admin_revoke'],
      default: 'logout'
    },

    // When the token expires (for TTL index)
    expiresAt: {
      type: Date,
      required: true
    },

    // Metadata for audit
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    revokedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// TTL index - MongoDB will automatically delete documents after expiresAt
// This prevents blacklist from growing indefinitely
tokenBlacklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for efficient lookups
tokenBlacklistSchema.index({ userId: 1, revokedAt: -1 });

/**
 * Check if a token is blacklisted
 *
 * @param {string} jti - JWT ID
 * @returns {Promise<boolean>}
 */
tokenBlacklistSchema.statics.isBlacklisted = async function (jti) {
  const entry = await this.findOne({ jti });
  return !!entry;
};

/**
 * Add token to blacklist
 *
 * @param {string} jti - JWT ID
 * @param {string} userId - User ID
 * @param {Date} expiresAt - Token expiration time
 * @param {string} reason - Reason for revocation
 * @returns {Promise<TokenBlacklist>}
 */
tokenBlacklistSchema.statics.addToken = async function (jti, userId, expiresAt, reason = 'logout') {
  return await this.create({
    jti,
    userId,
    expiresAt,
    reason
  });
};

/**
 * Blacklist all user's tokens
 * Note: This is a fallback - should track token JTIs properly
 *
 * @param {string} userId - User ID
 * @returns {Promise<number>} - Number of tokens blacklisted
 */
tokenBlacklistSchema.statics.blacklistAllUserTokens = async function (userId) {
  // This is a marker entry that indicates all tokens before this time are invalid
  // The actual implementation would need to track individual tokens
  const entry = await this.create({
    jti: `user_${userId}_${Date.now()}`, // Unique marker
    userId,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes (access token lifetime)
    reason: 'logout_all'
  });

  return 1;
};

module.exports = mongoose.model('TokenBlacklist', tokenBlacklistSchema);
