const passwordChangeService = require('../services/passwordChangeService');
const { HTTP_STATUS } = require('../constants');

/**
 * Password Change Controller
 * Handles HTTP requests for authenticated password changes
 */
class PasswordChangeController {
  /**
   * Change password for authenticated user
   * POST /api/auth/change-password
   * Requires authentication
   *
   * @body { currentPassword: string, newPassword: string }
   * @returns { success: boolean, message: string }
   */
  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;

      // Validate input
      if (!currentPassword || !newPassword) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Current password and new password are required'
        });
      }

      // Get user ID from authenticated request
      const userId = req.user.id;

      const result = await passwordChangeService.changePassword(
        userId,
        currentPassword,
        newPassword
      );

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PasswordChangeController();
