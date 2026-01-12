const mongoose = require('mongoose');

/**
 * AccountSecurity Model
 *
 * Purpose: Track security events and abuse patterns per user
 * Features:
 * - Failed login attempts
 * - Account locks (temporary and permanent)
 * - Suspicious activity flags
 * - Manual admin interventions
 */

const accountSecuritySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  // Failed login tracking
  failedLoginAttempts: {
    count: {
      type: Number,
      default: 0
    },
    lastAttempt: Date,
    attempts: [{
      ip: String,
      userAgent: String,
      timestamp: {
        type: Date,
        default: Date.now
      }
    }]
  },

  // Account lock status
  locked: {
    isLocked: {
      type: Boolean,
      default: false
    },
    lockedAt: Date,
    lockedUntil: Date,
    lockReason: {
      type: String,
      enum: [
        'FAILED_LOGIN_ATTEMPTS',
        'SPAM_DETECTED',
        'ABUSE_REPORTED',
        'MANUAL_ADMIN',
        'SUSPICIOUS_ACTIVITY'
      ]
    },
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User' // Admin who locked the account
    },
    autoLock: {
      type: Boolean,
      default: true // true = automated, false = manual
    }
  },

  // Message spam detection
  messageSpam: {
    recentMessageCount: {
      type: Number,
      default: 0
    },
    lastMessageTime: Date,
    spamFlags: {
      type: Number,
      default: 0
    },
    lastSpamFlagTime: Date
  },

  // Suspicious activity flags
  suspiciousActivity: [{
    type: {
      type: String,
      enum: [
        'RAPID_ROLE_CHANGE',
        'MULTIPLE_FAILED_LOGINS',
        'UNUSUAL_IP',
        'RAPID_ACCOUNT_CREATION',
        'MASS_MESSAGING',
        'SCRAPING_BEHAVIOR',
        'API_ABUSE'
      ]
    },
    description: String,
    detectedAt: {
      type: Date,
      default: Date.now
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    metadata: mongoose.Schema.Types.Mixed
  }],

  // Admin interventions
  interventions: [{
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    action: {
      type: String,
      enum: [
        'LOCKED',
        'UNLOCKED',
        'WARNING_ISSUED',
        'SPAM_FLAG_CLEARED',
        'SECURITY_REVIEW',
        'WHITELIST_ADDED'
      ],
      required: true
    },
    reason: String,
    notes: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],

  // Whitelist status (bypass certain checks)
  whitelisted: {
    type: Boolean,
    default: false
  },
  whitelistedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  whitelistedAt: Date,
  whitelistReason: String

}, {
  timestamps: true
});

// Indexes for efficient querying
accountSecuritySchema.index({ 'locked.isLocked': 1 });
accountSecuritySchema.index({ 'failedLoginAttempts.count': 1 });
accountSecuritySchema.index({ 'messageSpam.spamFlags': 1 });
accountSecuritySchema.index({ createdAt: -1 });

// Instance methods

/**
 * Record a failed login attempt
 */
accountSecuritySchema.methods.recordFailedLogin = async function(ip, userAgent) {
  this.failedLoginAttempts.count += 1;
  this.failedLoginAttempts.lastAttempt = new Date();
  this.failedLoginAttempts.attempts.push({
    ip,
    userAgent,
    timestamp: new Date()
  });

  // Keep only last 20 attempts
  if (this.failedLoginAttempts.attempts.length > 20) {
    this.failedLoginAttempts.attempts = this.failedLoginAttempts.attempts.slice(-20);
  }

  // Auto-lock after 10 failed attempts
  if (this.failedLoginAttempts.count >= 10 && !this.locked.isLocked) {
    await this.lockAccount('FAILED_LOGIN_ATTEMPTS', null, 30); // 30 minutes
  }

  await this.save();
};

/**
 * Reset failed login attempts (on successful login)
 */
accountSecuritySchema.methods.resetFailedLogins = async function() {
  this.failedLoginAttempts.count = 0;
  this.failedLoginAttempts.lastAttempt = null;
  await this.save();
};

/**
 * Lock account
 */
accountSecuritySchema.methods.lockAccount = async function(
  reason,
  adminId = null,
  durationMinutes = null
) {
  this.locked.isLocked = true;
  this.locked.lockedAt = new Date();
  this.locked.lockReason = reason;
  this.locked.lockedBy = adminId;
  this.locked.autoLock = !adminId; // If no admin, it's automatic

  if (durationMinutes) {
    this.locked.lockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
  }

  await this.save();
};

/**
 * Unlock account
 */
accountSecuritySchema.methods.unlockAccount = async function(adminId = null) {
  this.locked.isLocked = false;
  this.locked.lockedUntil = null;

  if (adminId) {
    this.interventions.push({
      admin: adminId,
      action: 'UNLOCKED',
      timestamp: new Date()
    });
  }

  await this.save();
};

/**
 * Check if account lock has expired
 */
accountSecuritySchema.methods.checkLockExpiry = async function() {
  if (this.locked.isLocked && this.locked.lockedUntil) {
    if (new Date() > this.locked.lockedUntil) {
      await this.unlockAccount();
      return true; // Was unlocked
    }
  }
  return false; // Still locked or not locked
};

/**
 * Flag message spam
 */
accountSecuritySchema.methods.flagSpam = async function() {
  this.messageSpam.spamFlags += 1;
  this.messageSpam.lastSpamFlagTime = new Date();

  // Auto-lock after 3 spam flags
  if (this.messageSpam.spamFlags >= 3 && !this.locked.isLocked) {
    await this.lockAccount('SPAM_DETECTED', null, 60); // 60 minutes
  }

  await this.save();
};

/**
 * Track message (for spam detection)
 */
accountSecuritySchema.methods.trackMessage = function() {
  this.messageSpam.recentMessageCount += 1;
  this.messageSpam.lastMessageTime = new Date();
};

/**
 * Reset message count (called periodically)
 */
accountSecuritySchema.methods.resetMessageCount = async function() {
  this.messageSpam.recentMessageCount = 0;
  await this.save();
};

/**
 * Add suspicious activity flag
 */
accountSecuritySchema.methods.flagSuspiciousActivity = async function(
  type,
  description,
  severity = 'medium',
  metadata = {}
) {
  this.suspiciousActivity.push({
    type,
    description,
    severity,
    detectedAt: new Date(),
    metadata
  });

  // Keep only last 50 flags
  if (this.suspiciousActivity.length > 50) {
    this.suspiciousActivity = this.suspiciousActivity.slice(-50);
  }

  await this.save();
};

/**
 * Add admin intervention
 */
accountSecuritySchema.methods.addIntervention = async function(
  adminId,
  action,
  reason,
  notes = ''
) {
  this.interventions.push({
    admin: adminId,
    action,
    reason,
    notes,
    timestamp: new Date()
  });

  await this.save();
};

// Static methods

/**
 * Get or create security record for user
 */
accountSecuritySchema.statics.getOrCreate = async function(userId) {
  let security = await this.findOne({ user: userId });

  if (!security) {
    security = await this.create({ user: userId });
  } else {
    // Check if lock has expired
    await security.checkLockExpiry();
  }

  return security;
};

/**
 * Get all locked accounts
 */
accountSecuritySchema.statics.getLockedAccounts = async function() {
  return this.find({ 'locked.isLocked': true })
    .populate('user', 'name email role')
    .populate('locked.lockedBy', 'name email role')
    .sort({ 'locked.lockedAt': -1 });
};

/**
 * Get accounts with high spam flags
 */
accountSecuritySchema.statics.getSpamAccounts = async function(threshold = 2) {
  return this.find({ 'messageSpam.spamFlags': { $gte: threshold } })
    .populate('user', 'name email role')
    .sort({ 'messageSpam.spamFlags': -1 });
};

/**
 * Get accounts with suspicious activity
 */
accountSecuritySchema.statics.getSuspiciousAccounts = async function() {
  return this.find({
    $expr: { $gte: [{ $size: '$suspiciousActivity' }, 1] }
  })
    .populate('user', 'name email role')
    .sort({ updatedAt: -1 });
};

const AccountSecurity = mongoose.model('AccountSecurity', accountSecuritySchema);

module.exports = AccountSecurity;
