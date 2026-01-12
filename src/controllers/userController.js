const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * @desc    Update current user profile
 * @route   PATCH /api/users/me
 * @access  Private
 */
exports.updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { name, avatar } = req.body;

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update allowed fields
    if (name !== undefined) {
      user.name = name;
    }
    if (avatar !== undefined) {
      user.avatar = avatar;
    }

    await user.save();

    // Log audit event
    logger.info('User profile updated', {
      userId: user._id,
      fields: Object.keys(req.body),
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      }
    });
  } catch (error) {
    logger.error('Update profile error:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      message: 'Error updating profile'
    });
  }
};

/**
 * @desc    Get all active sessions for current user
 * @route   GET /api/users/me/sessions
 * @access  Private
 */
exports.getActiveSessions = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all active refresh tokens for this user
    const sessions = await RefreshToken.find({
      user: userId,
      expiresAt: { $gt: new Date() },
      isRevoked: false
    })
      .sort({ createdAt: -1 })
      .select('deviceInfo createdAt expiresAt lastUsedAt ip')
      .lean();

    // Format sessions for response
    const formattedSessions = sessions.map(session => ({
      id: session._id,
      deviceInfo: {
        userAgent: session.deviceInfo?.userAgent || 'Unknown device',
        browser: extractBrowser(session.deviceInfo?.userAgent),
        os: extractOS(session.deviceInfo?.userAgent),
        device: extractDevice(session.deviceInfo?.userAgent)
      },
      ip: session.deviceInfo?.ip || session.ip || 'Unknown',
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt || session.createdAt,
      expiresAt: session.expiresAt,
      isCurrent: session._id.toString() === req.refreshTokenId?.toString()
    }));

    res.json({
      success: true,
      message: 'Active sessions retrieved successfully',
      data: {
        sessions: formattedSessions,
        total: formattedSessions.length
      }
    });
  } catch (error) {
    logger.error('Get active sessions error:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      message: 'Error retrieving active sessions'
    });
  }
};

/**
 * @desc    Revoke a specific session
 * @route   DELETE /api/users/me/sessions/:sessionId
 * @access  Private
 */
exports.revokeSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;

    // Find the refresh token
    const refreshToken = await RefreshToken.findOne({
      _id: sessionId,
      user: userId
    });

    if (!refreshToken) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Revoke the session
    refreshToken.isRevoked = true;
    await refreshToken.save();

    // Log audit event
    logger.info('Session revoked', {
      userId,
      sessionId,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Session revoked successfully'
    });
  } catch (error) {
    logger.error('Revoke session error:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      message: 'Error revoking session'
    });
  }
};

/**
 * @desc    Update user settings
 * @route   PATCH /api/users/me/settings
 * @access  Private
 */
exports.updateSettings = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { biometricEnabled, language, theme, chat } = req.body;

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update settings
    if (biometricEnabled !== undefined) {
      user.settings.biometricEnabled = biometricEnabled;
    }
    if (language !== undefined) {
      user.settings.language = language;
    }
    if (theme !== undefined) {
      user.settings.theme = theme;
    }
    if (chat !== undefined) {
      if (chat.muteGroups !== undefined) {
        user.settings.chat.muteGroups = chat.muteGroups;
      }
      if (chat.readReceipts !== undefined) {
        user.settings.chat.readReceipts = chat.readReceipts;
      }
    }

    await user.save();

    // Log audit event (especially for biometric changes)
    if (biometricEnabled !== undefined) {
      logger.info('Biometric setting changed', {
        userId: user._id,
        enabled: biometricEnabled,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        settings: user.settings
      }
    });
  } catch (error) {
    logger.error('Update settings error:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      message: 'Error updating settings'
    });
  }
};

/**
 * @desc    Request account deletion
 * @route   POST /api/users/me/delete-request
 * @access  Private
 */
exports.requestAccountDeletion = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { password, reason } = req.body;

    // Find user with password
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify password
    const isPasswordValid = await user.matchPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }

    // Set deletion timestamp (30-day grace period)
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 30);

    user.deletionRequestedAt = new Date();
    user.scheduledDeletionDate = deletionDate;
    user.deletionReason = reason;
    user.isActive = false; // Deactivate immediately

    await user.save();

    // Revoke all refresh tokens
    await RefreshToken.updateMany(
      { user: userId },
      { isRevoked: true }
    );

    // Log audit event
    logger.warn('Account deletion requested', {
      userId: user._id,
      email: user.email,
      reason,
      scheduledDeletionDate: deletionDate,
      timestamp: new Date()
    });

    // TODO: Send confirmation email with cancellation link
    // TODO: Schedule deletion job

    res.json({
      success: true,
      message: 'Account deletion requested. You have 30 days to cancel.',
      data: {
        scheduledDeletionDate: deletionDate
      }
    });
  } catch (error) {
    logger.error('Request account deletion error:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      message: 'Error requesting account deletion'
    });
  }
};

/**
 * @desc    Cancel account deletion
 * @route   POST /api/users/me/cancel-deletion
 * @access  Private
 */
exports.cancelAccountDeletion = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.deletionRequestedAt) {
      return res.status(400).json({
        success: false,
        message: 'No deletion request found'
      });
    }

    // Cancel deletion
    user.deletionRequestedAt = undefined;
    user.scheduledDeletionDate = undefined;
    user.deletionReason = undefined;
    user.isActive = true;

    await user.save();

    // Log audit event
    logger.info('Account deletion cancelled', {
      userId: user._id,
      email: user.email,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Account deletion cancelled successfully'
    });
  } catch (error) {
    logger.error('Cancel account deletion error:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      message: 'Error cancelling account deletion'
    });
  }
};

/**
 * @desc    Export user data (GDPR compliance)
 * @route   GET /api/users/me/export-data
 * @access  Private
 */
exports.exportUserData = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user data
    const user = await User.findById(userId).select('+password').lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove password hash from export
    delete user.password;
    delete user.__v;

    // Get user's active sessions
    const sessions = await RefreshToken.find({
      user: userId,
      expiresAt: { $gt: new Date() },
      isRevoked: false
    })
      .select('deviceInfo createdAt expiresAt lastUsedAt ip')
      .lean();

    // Get notification preferences (if exists)
    let notificationPreferences = null;
    try {
      const NotificationPreference = require('../models/NotificationPreference');
      notificationPreferences = await NotificationPreference.findOne({ user: userId }).lean();
    } catch (error) {
      // Model might not exist, that's okay
    }

    // Get subscription info (if exists)
    let subscription = null;
    try {
      const Subscription = require('../models/Subscription');
      subscription = await Subscription.findOne({
        user: userId,
        status: 'active'
      }).lean();
    } catch (error) {
      // Model might not exist, that's okay
    }

    // Compile all user data
    const exportData = {
      exportDate: new Date().toISOString(),
      exportVersion: '1.0',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isActive: user.isActive,
        settings: user.settings,
        followerCount: user.followerCount,
        followingCount: user.followingCount,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLogin: user.lastLogin,
        deletionRequestedAt: user.deletionRequestedAt,
        scheduledDeletionDate: user.scheduledDeletionDate,
        deletionReason: user.deletionReason
      },
      activeSessions: sessions.map(session => ({
        id: session._id,
        deviceInfo: session.deviceInfo,
        ip: session.ip,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt
      })),
      notificationPreferences,
      subscription: subscription ? {
        tier: subscription.tier,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        autoRenew: subscription.autoRenew
      } : null,
      dataRetentionPolicy: {
        description: 'Your data is retained as long as your account is active. Upon account deletion request, data will be permanently deleted after 30 days.',
        deletionGracePeriod: '30 days'
      }
    };

    // Log audit event
    logger.info('User data exported', {
      userId,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'User data exported successfully',
      data: exportData
    });
  } catch (error) {
    logger.error('Export user data error:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      message: 'Error exporting user data'
    });
  }
};

/**
 * @desc    Search users by name or email
 * @route   GET /api/users/search
 * @access  Private
 */
exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    const currentUserId = req.user.id;

    if (!q || q.length < 2) {
      return res.json({
        success: true,
        data: { users: [] }
      });
    }

    const searchQuery = {
      $and: [
        { _id: { $ne: currentUserId } },
        { isActive: true },
        {
          $or: [
            { name: { $regex: q, $options: 'i' } },
            { email: { $regex: q, $options: 'i' } }
          ]
        }
      ]
    };

    const users = await User.find(searchQuery)
      .select('name email avatar role')
      .limit(20)
      .lean();

    res.json({
      success: true,
      message: 'Users retrieved successfully',
      data: {
        users: users.map(user => ({
          id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role
        }))
      }
    });

  } catch (error) {
    logger.error('Search users error:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      message: 'Error searching users'
    });
  }
};

// Helper functions to extract device info from user agent
function extractBrowser(userAgent) {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Edge')) return 'Edge';
  return 'Unknown';
}

function extractOS(userAgent) {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS') || userAgent.includes('iPhone')) return 'iOS';
  return 'Unknown';
}

function extractDevice(userAgent) {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
    return 'Mobile';
  }
  if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
    return 'Tablet';
  }
  return 'Desktop';
}
