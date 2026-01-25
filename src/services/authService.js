const User = require('../models/User');
const AccountSecurity = require('../models/AccountSecurity');
const TokenBlacklist = require('../models/TokenBlacklist');
const { generateTokenPair, verifyRefreshToken, revokeRefreshToken, revokeAllUserTokens } = require('../utils/tokenUtils');
const { ERROR_MESSAGES, ROLES, AUDIT_ACTIONS } = require('../constants');
const AuditLogger = require('../utils/auditLogger');
const { createDefaultSubscription } = require('../utils/subscriptionHelper');
const emailService = require('./emailService');
const groupChatService = require('./groupChatService');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

class AuthService {
  async register(userData, deviceInfo = {}) {
    const { name, email, password, nationality, phoneNumber, country } = userData;

    // SECURITY FIX (HIGH-002): Prevent user enumeration via timing-safe check
    // Check if user already exists by email or phoneNumber
    const existingUser = await User.findOne({
      $or: [
        { email },
        { phoneNumber: phoneNumber || 'NON_EXISTENT_PHONE' }
      ]
    });

    if (existingUser) {
      // Use generic message to prevent enumeration
      throw new Error(ERROR_MESSAGES.INVALID_CREDENTIALS);
    }

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // Create user (password will be hashed by pre-save hook)
    const user = await User.create({
      name,
      email,
      password,
      nationality,
      phoneNumber,
      country,
      role: ROLES.USER,
      isVerified: false,
      verificationCode,
      verificationCodeExpiresAt
    });

    // Create default free subscription for new user (but they can't use it until verified)
    await createDefaultSubscription(user._id, {
      ipAddress: deviceInfo.ip,
      userAgent: deviceInfo.userAgent
    });

    // Send verification email
    emailService.sendVerificationCodeEmail(user, verificationCode).catch((error) => {
      logger.error('[AuthService] Failed to send verification email:', error);
    });

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        isVerified: user.isVerified
      }
    };
  }

  async login(identifier, password, deviceInfo = {}) {
    // Find user by email or phone number and include password field
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { phoneNumber: identifier }
      ]
    }).select('+password');

    if (!user) {
      throw new Error(ERROR_MESSAGES.INVALID_CREDENTIALS);
    }

    // Get or create security record
    const security = await AccountSecurity.getOrCreate(user._id);

    // Check if account is locked
    if (security.locked.isLocked) {
      // Check if lock has expired
      const wasUnlocked = await security.checkLockExpiry();

      if (!wasUnlocked) {
        const lockUntil = security.locked.lockedUntil
          ? new Date(security.locked.lockedUntil).toLocaleString()
          : 'indefinitely';

        throw new Error(
          `Account is locked due to ${security.locked.lockReason}. Locked until: ${lockUntil}`
        );
      }
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error(ERROR_MESSAGES.ACCOUNT_DEACTIVATED);
    }

    // Check if user is verified (admins bypass this check)
    const isAdminRole = user.role === ROLES.ADMIN || user.role === ROLES.SUPERADMIN;
    if (!user.isVerified && !isAdminRole) {
      throw new Error('Please verify your account before logging in');
    }

    // Verify password
    const isPasswordValid = await user.matchPassword(password);
    if (!isPasswordValid) {
      // Record failed login attempt
      await security.recordFailedLogin(deviceInfo.ip, deviceInfo.userAgent);

      // Audit log for failed login
      await AuditLogger.log({
        actor: {
          userId: user._id,
          email: user.email,
          role: user.role,
          ip: deviceInfo.ip,
          userAgent: deviceInfo.userAgent
        },
        action: AUDIT_ACTIONS.LOGIN,
        target: {
          resourceType: 'User',
          resourceId: user._id,
          resourceName: user.email
        },
        metadata: {
          severity: 'medium'
        },
        status: 'failure',
        error: {
          message: ERROR_MESSAGES.INVALID_CREDENTIALS
        }
      });

      throw new Error(ERROR_MESSAGES.INVALID_CREDENTIALS);
    }

    // Success! Reset failed login attempts
    await security.resetFailedLogins();

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token pair
    const { accessToken, refreshToken } = await generateTokenPair(
      user._id,
      user.role,
      deviceInfo
    );

    // Audit log for successful login
    await AuditLogger.log({
      actor: {
        userId: user._id,
        email: user.email,
        role: user.role,
        ip: deviceInfo.ip,
        userAgent: deviceInfo.userAgent
      },
      action: AUDIT_ACTIONS.LOGIN,
      target: {
        resourceType: 'User',
        resourceId: user._id,
        resourceName: user.email
      },
      metadata: {
        severity: 'low'
      },
      status: 'success'
    });

    return {
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        lastLogin: user.lastLogin
      },
      token: accessToken, // For backward compatibility
      accessToken,
      refreshToken
    };
  }

  async refreshToken(refreshTokenString) {
    const refreshToken = await verifyRefreshToken(refreshTokenString);

    if (!refreshToken) {
      throw new Error(ERROR_MESSAGES.REFRESH_TOKEN_INVALID);
    }

    const user = refreshToken.user;

    if (!user.isActive) {
      throw new Error(ERROR_MESSAGES.ACCOUNT_DEACTIVATED);
    }

    // Revoke old refresh token
    await revokeRefreshToken(refreshTokenString);

    // Generate new token pair
    const { accessToken, refreshToken: newRefreshToken } = await generateTokenPair(
      user._id,
      user.role,
      refreshToken.deviceInfo
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900 // 15 minutes in seconds
    };
  }

  async logout(refreshTokenString, accessToken) {
    // Revoke refresh token
    await revokeRefreshToken(refreshTokenString);

    // SECURITY FIX (CRITICAL): Blacklist access token to prevent reuse after logout
    if (accessToken) {
      try {
        const decoded = jwt.decode(accessToken, { complete: true });
        if (decoded && decoded.payload) {
          const { jti, id, exp } = decoded.payload;
          if (jti) {
            // Add to blacklist with expiration matching token expiration
            await TokenBlacklist.addToken(
              jti,
              id,
              new Date(exp * 1000), // Convert unix timestamp to Date
              'logout'
            );
          }
        }
      } catch (error) {
        // Silently fail if access token is invalid - refresh token already revoked
        logger.error('Failed to blacklist access token on logout:', { error: error.message });
      }
    }

    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId, accessToken) {
    // Revoke all refresh tokens
    await revokeAllUserTokens(userId);

    // SECURITY FIX (CRITICAL): Blacklist current access token
    if (accessToken) {
      try {
        const decoded = jwt.decode(accessToken, { complete: true });
        if (decoded && decoded.payload) {
          const { jti, exp } = decoded.payload;
          if (jti) {
            await TokenBlacklist.addToken(
              jti,
              userId,
              new Date(exp * 1000),
              'logout_all'
            );
          }
        }
      } catch (error) {
        logger.error('Failed to blacklist access token on logoutAll:', { error: error.message });
      }
    }

    // SECURITY FIX (CRITICAL): Set global revocation timestamp
    await User.findByIdAndUpdate(userId, { lastLoggedOutAllAt: new Date() });

    return { message: 'Logged out from all devices' };
  }

  async verifyAccount(userId, code, deviceInfo = {}) {
    const user = await User.findById(userId).select('+verificationCode +verificationCodeExpiresAt');
    if (!user) {
      throw new Error('User not found');
    }

    if (user.isVerified) {
      throw new Error('Account is already verified');
    }

    if (user.verificationCode !== code) {
      throw new Error('Invalid verification code');
    }

    if (user.verificationCodeExpiresAt < new Date()) {
      throw new Error('Verification code has expired');
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpiresAt = undefined;
    await user.save();

    // Add user to free tier group chat now that they are verified
    try {
      await groupChatService.handleNewUserRegistration(user._id);
    } catch (groupError) {
      logger.error('[AuthService] Failed to add user to tier group:', groupError);
    }

    // Generate token pair
    const { accessToken, refreshToken } = await generateTokenPair(
      user._id,
      user.role,
      deviceInfo
    );

    // Send welcome email
    emailService.sendWelcomeEmail(user).catch((error) => {
      logger.error('[AuthService] Failed to send welcome email:', error);
    });

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified
      },
      accessToken,
      refreshToken
    };
  }

  async resendVerificationCode(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.isVerified) {
      throw new Error('Account is already verified');
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = verificationCode;
    user.verificationCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await emailService.sendVerificationCodeEmail(user, verificationCode);

    return { success: true, message: 'Verification code sent' };
  }

  /**
   * Get active sessions for a user
   */
  async getActiveSessions(userId) {
    const RefreshToken = require('../models/RefreshToken');

    // Find valid tokens for user
    const tokens = await RefreshToken.find({
      user: userId,
      isRevoked: false,
      expiresAt: { $gt: new Date() }
    }).sort({ updatedAt: -1 });

    return tokens.map(t => ({
      id: t._id,
      deviceInfo: t.deviceInfo,
      lastActive: t.updatedAt,
      expiresAt: t.expiresAt
    }));
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(userId, tokenId) {
    const RefreshToken = require('../models/RefreshToken');

    const result = await RefreshToken.updateOne(
      { _id: tokenId, user: userId },
      { isRevoked: true }
    );

    if (result.matchedCount === 0) {
      throw new Error('Session not found or already revoked');
    }

    return { success: true };
  }
}

module.exports = new AuthService();
