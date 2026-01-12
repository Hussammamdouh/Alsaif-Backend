const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const bcrypt = require('bcryptjs');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../constants');
const emailService = require('./emailService');

/**
 * Password Reset Service
 * Handles forgot password and reset password operations
 */
class PasswordResetService {
  /**
   * Request password reset
   * Generates reset code and sends email
   *
   * @param {String} email - User's email
   * @param {Object} deviceInfo - Device information (IP, user-agent)
   * @returns {Object} { code, expiresAt } - For development/testing (remove code in production)
   */
  async requestPasswordReset(email, deviceInfo = {}) {
    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    // Security: Don't reveal if user exists (prevent user enumeration)
    // Always return success even if user doesn't exist
    if (!user) {
      // In production, we'd still return success to prevent enumeration
      // For development, we'll throw an error to help debugging
      throw new AppError(
        ERROR_MESSAGES.USER_NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    // Check if user account is active
    if (!user.isActive) {
      throw new AppError(
        'Account is deactivated. Please contact support.',
        HTTP_STATUS.FORBIDDEN
      );
    }

    // Check for recent reset requests (rate limiting)
    const recentRequest = await PasswordReset.findOne({
      user: user._id,
      createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) } // Within last 2 minutes
    });

    if (recentRequest) {
      throw new AppError(
        'A password reset email was recently sent. Please check your inbox or try again in 2 minutes.',
        HTTP_STATUS.TOO_MANY_REQUESTS
      );
    }

    // Generate reset token and code
    const resetData = await PasswordReset.createResetToken(
      user._id,
      user.email,
      deviceInfo
    );

    // Send email with reset code
    await emailService.sendPasswordResetCodeEmail(
      user.email,
      resetData.code,
      user.name,
      resetData.expiresAt
    );

    // Also log for development
    console.log(`[PasswordReset] Reset code for ${user.email}: ${resetData.code}`);
    console.log(`[PasswordReset] Expires at: ${resetData.expiresAt}`);

    // In production, don't return the code (send via email only)
    // For development, return it so we can test without email
    return {
      message: 'Password reset code has been sent to your email',
      // Remove this in production:
      code: resetData.code,
      expiresAt: resetData.expiresAt
    };
  }

  /**
   * Verify reset code
   * Checks if code is valid and not expired
   *
   * @param {String} email - User's email
   * @param {String} code - 6-digit reset code
   * @returns {Boolean} - True if valid
   */
  async verifyResetCode(email, code) {
    const resetRequest = await PasswordReset.verifyCode(email, code);

    if (!resetRequest) {
      throw new AppError(
        'Invalid or expired reset code. Please request a new one.',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    return {
      valid: true,
      message: 'Reset code verified successfully'
    };
  }

  /**
   * Reset password with code
   *
   * @param {String} email - User's email
   * @param {String} code - 6-digit reset code
   * @param {String} newPassword - New password
   * @returns {Object} - Success message
   */
  async resetPassword(email, code, newPassword) {
    // Verify the reset code
    const resetRequest = await PasswordReset.verifyCode(email, code);

    if (!resetRequest) {
      throw new AppError(
        'Invalid or expired reset code. Please request a new one.',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Find the user
    const user = await User.findById(resetRequest.user).select('+password');

    if (!user) {
      throw new AppError(
        ERROR_MESSAGES.USER_NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    // Validate new password
    if (!newPassword || newPassword.length < 8) {
      throw new AppError(
        'Password must be at least 8 characters',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Check password strength (same validation as User model)
    if (!/^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/.test(newPassword)) {
      throw new AppError(
        'Password must be at least 8 characters and contain both letters and numbers',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Check if new password is same as old password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new AppError(
        'New password must be different from your current password',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Hash and update password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    // Mark reset token as used
    await PasswordReset.markAsUsed(resetRequest._id);

    // Send confirmation email
    await emailService.sendPasswordChangedEmail(user.email, user.name);

    // TODO: Invalidate all existing sessions for this user (logout from all devices)
    // await RefreshToken.updateMany({ user: user._id }, { isRevoked: true });
    // await TokenBlacklist.create({ ... }); // Blacklist current tokens

    return {
      message: 'Password has been reset successfully. Please login with your new password.'
    };
  }

  /**
   * Reset password with token (from email link)
   * Alternative to code-based reset
   *
   * @param {String} token - Reset token from email
   * @param {String} newPassword - New password
   * @returns {Object} - Success message
   */
  async resetPasswordWithToken(token, newPassword) {
    // Verify the reset token
    const resetRequest = await PasswordReset.verifyToken(token);

    if (!resetRequest) {
      throw new AppError(
        'Invalid or expired reset link. Please request a new one.',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Find the user
    const user = await User.findById(resetRequest.user).select('+password');

    if (!user) {
      throw new AppError(
        ERROR_MESSAGES.USER_NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    // Validate new password
    if (!newPassword || newPassword.length < 8) {
      throw new AppError(
        'Password must be at least 8 characters',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Check password strength
    if (!/^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/.test(newPassword)) {
      throw new AppError(
        'Password must be at least 8 characters and contain both letters and numbers',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Check if new password is same as old password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new AppError(
        'New password must be different from your current password',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Hash and update password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    // Mark reset token as used
    await PasswordReset.markAsUsed(resetRequest._id);

    return {
      message: 'Password has been reset successfully. Please login with your new password.'
    };
  }

  /**
   * Resend reset code
   * Sends a new code if the previous one expired
   *
   * @param {String} email - User's email
   * @param {Object} deviceInfo - Device information
   * @returns {Object} - Success message
   */
  async resendResetCode(email, deviceInfo = {}) {
    // Check for very recent requests (prevent spam)
    const veryRecentRequest = await PasswordReset.findOne({
      email: email.toLowerCase(),
      createdAt: { $gte: new Date(Date.now() - 30 * 1000) } // Within last 30 seconds
    });

    if (veryRecentRequest) {
      throw new AppError(
        'Please wait 30 seconds before requesting a new code',
        HTTP_STATUS.TOO_MANY_REQUESTS
      );
    }

    // Reuse the request password reset logic
    return await this.requestPasswordReset(email, deviceInfo);
  }
}

module.exports = new PasswordResetService();
