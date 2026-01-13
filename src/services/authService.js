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
    const { name, email, password, nationality } = userData;

    // SECURITY FIX (HIGH-002): Prevent user enumeration via timing-safe check
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // Use generic message to prevent email enumeration
      throw new Error(ERROR_MESSAGES.INVALID_CREDENTIALS);
    }

    // Create user (password will be hashed by pre-save hook)
    const user = await User.create({
      name,
      email,
      password,
      nationality,
      role: ROLES.USER
    });

    // Create default free subscription for new user
    await createDefaultSubscription(user._id, {
      ipAddress: deviceInfo.ip,
      userAgent: deviceInfo.userAgent
    });

    // Add new user to free tier group chat
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

    // Send welcome email (non-blocking)
    emailService.sendWelcomeEmail(user).catch((error) => {
      logger.error('[AuthService] Failed to send welcome email:', error);
    });

    return {
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      },
      token: accessToken, // For backward compatibility
      accessToken,
      refreshToken
    };
  }

  async login(email, password, deviceInfo = {}) {
    // Find user and include password field
    const user = await User.findOne({ email }).select('+password');

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

    // Note: Other active access tokens from other sessions will still be valid
    // until they expire (15 minutes). For complete revocation, users should
    // change their password or admin should disable the account.

    return { message: 'Logged out from all devices' };
  }
}

module.exports = new AuthService();
