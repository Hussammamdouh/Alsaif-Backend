const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Password Reset Token Schema
 * Stores temporary tokens for password reset flow
 *
 * Security Features:
 * - Tokens are hashed before storage
 * - Automatic expiration (15 minutes)
 * - Single-use tokens (deleted after use)
 * - Rate limiting via attempts tracking
 */
const passwordResetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    // Hashed reset token (for security)
    token: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    // Plain code shown to user (6-digit numeric)
    code: {
      type: String,
      required: true
    },
    // Token expiration (15 minutes from creation)
    expiresAt: {
      type: Date,
      required: true
      // Index defined below with TTL for automatic cleanup
    },
    // Track verification attempts (prevent brute force)
    attempts: {
      type: Number,
      default: 0
    },
    // Whether token has been used
    isUsed: {
      type: Boolean,
      default: false,
      index: true
    },
    // Device/IP info for audit
    deviceInfo: {
      userAgent: String,
      ip: String
    }
  },
  {
    timestamps: true
  }
);

/**
 * Indexes for performance and automatic cleanup
 */
// TTL Index - auto-delete expired tokens after 1 hour
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

// Compound index for fast lookups
passwordResetSchema.index({ email: 1, isUsed: 1, expiresAt: 1 });

/**
 * Static Methods
 */

/**
 * Generate reset token and code
 * @returns {Object} { token, hashedToken, code }
 */
passwordResetSchema.statics.generateToken = function() {
  // Generate secure random token (for URL/email link)
  const token = crypto.randomBytes(32).toString('hex');

  // Generate 6-digit numeric code (for user entry)
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Hash the token for storage
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  return { token, hashedToken, code };
};

/**
 * Create password reset request
 * @param {String} userId - User ID
 * @param {String} email - User email
 * @param {Object} deviceInfo - Device/IP information
 * @returns {Object} { token, code, expiresAt }
 */
passwordResetSchema.statics.createResetToken = async function(userId, email, deviceInfo = {}) {
  // Invalidate any existing tokens for this user
  await this.updateMany(
    { user: userId, isUsed: false },
    { isUsed: true }
  );

  // Generate new token and code
  const { token, hashedToken, code } = this.generateToken();

  // Set expiration (15 minutes)
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  // Create reset record
  const resetRecord = await this.create({
    user: userId,
    email,
    token: hashedToken,
    code,
    expiresAt,
    deviceInfo
  });

  return {
    token, // Return plain token (for email link)
    code,  // Return code (for user display)
    expiresAt
  };
};

/**
 * Verify reset code
 * @param {String} email - User email
 * @param {String} code - 6-digit code
 * @returns {Object|null} Reset record if valid, null otherwise
 */
passwordResetSchema.statics.verifyCode = async function(email, code) {
  // Find valid reset request
  const resetRequest = await this.findOne({
    email: email.toLowerCase(),
    code,
    isUsed: false,
    expiresAt: { $gt: new Date() }
  });

  if (!resetRequest) {
    return null;
  }

  // Increment attempts
  resetRequest.attempts += 1;

  // Lock after 5 failed attempts
  if (resetRequest.attempts > 5) {
    resetRequest.isUsed = true;
    await resetRequest.save();
    return null;
  }

  await resetRequest.save();
  return resetRequest;
};

/**
 * Verify reset token (from email link)
 * @param {String} token - Plain reset token
 * @returns {Object|null} Reset record if valid, null otherwise
 */
passwordResetSchema.statics.verifyToken = async function(token) {
  // Hash the provided token
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  // Find valid reset request
  const resetRequest = await this.findOne({
    token: hashedToken,
    isUsed: false,
    expiresAt: { $gt: new Date() }
  });

  return resetRequest;
};

/**
 * Mark token as used
 * @param {String} resetId - Reset record ID
 */
passwordResetSchema.statics.markAsUsed = async function(resetId) {
  await this.findByIdAndUpdate(resetId, { isUsed: true });
};

/**
 * Instance Methods
 */

/**
 * Check if token is expired
 */
passwordResetSchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

/**
 * Get remaining time in minutes
 */
passwordResetSchema.methods.getRemainingTime = function() {
  const remaining = this.expiresAt - new Date();
  return Math.max(0, Math.ceil(remaining / 60000)); // Convert to minutes
};

const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);

module.exports = PasswordReset;
