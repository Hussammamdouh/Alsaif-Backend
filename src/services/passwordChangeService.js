const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS } = require('../constants');
const emailService = require('./emailService');

/**
 * Password Change Service
 * Handles password changes for authenticated users
 */
class PasswordChangeService {
  /**
   * Change password for authenticated user
   *
   * @param {String} userId - User ID from authentication
   * @param {String} currentPassword - Current password
   * @param {String} newPassword - New password
   * @returns {Object} - Success message
   */
  async changePassword(userId, currentPassword, newPassword) {
    // Find user with password
    const user = await User.findById(userId).select('+password');

    if (!user) {
      throw new AppError(
        'User not found',
        HTTP_STATUS.NOT_FOUND
      );
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      throw new AppError(
        'Current password is incorrect',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Validate new password
    if (!newPassword || newPassword.length < 8) {
      throw new AppError(
        'New password must be at least 8 characters',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Check password strength (same validation as User model)
    if (!/^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/.test(newPassword)) {
      throw new AppError(
        'New password must be at least 8 characters and contain both letters and numbers',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Check if new password is same as current password
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

    // Send confirmation email
    await emailService.sendPasswordChangedEmail(user.email, user.name);

    // TODO: Optionally invalidate all existing sessions (logout from all devices)
    // await RefreshToken.updateMany({ user: user._id }, { isRevoked: true });

    return {
      message: 'Password changed successfully'
    };
  }
}

module.exports = new PasswordChangeService();
