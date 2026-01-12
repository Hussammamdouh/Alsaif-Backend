const passwordResetService = require('../services/passwordResetService');
const { HTTP_STATUS } = require('../constants');

/**
 * Password Reset Controller
 * Handles HTTP requests for password reset operations
 */
class PasswordResetController {
  /**
   * Request password reset
   * POST /api/auth/forgot-password
   *
   * @body { email: string }
   * @returns { success: boolean, message: string, data: { code?, expiresAt } }
   */
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;

      // Validate email
      if (!email) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Email is required'
        });
      }

      const deviceInfo = {
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress
      };

      const result = await passwordResetService.requestPasswordReset(email, deviceInfo);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: result.message,
        data: {
          // In development, include the code for testing
          // Remove this in production
          code: result.code,
          expiresAt: result.expiresAt
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify reset code
   * POST /api/auth/verify-reset-code
   *
   * @body { email: string, code: string }
   * @returns { success: boolean, message: string, data: { valid: boolean } }
   */
  async verifyResetCode(req, res, next) {
    try {
      const { email, code } = req.body;

      // Validate input
      if (!email || !code) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Email and code are required'
        });
      }

      const result = await passwordResetService.verifyResetCode(email, code);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: result.message,
        data: {
          valid: result.valid
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reset password with code
   * POST /api/auth/reset-password
   *
   * @body { email: string, code: string, newPassword: string }
   * @returns { success: boolean, message: string }
   */
  async resetPassword(req, res, next) {
    try {
      const { email, code, newPassword } = req.body;

      // Validate input
      if (!email || !code || !newPassword) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Email, code, and new password are required'
        });
      }

      const result = await passwordResetService.resetPassword(email, code, newPassword);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reset password with token (from email link)
   * POST /api/auth/reset-password-with-token
   *
   * @body { token: string, newPassword: string }
   * @returns { success: boolean, message: string }
   */
  async resetPasswordWithToken(req, res, next) {
    try {
      const { token, newPassword } = req.body;

      // Validate input
      if (!token || !newPassword) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Token and new password are required'
        });
      }

      const result = await passwordResetService.resetPasswordWithToken(token, newPassword);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resend reset code
   * POST /api/auth/resend-reset-code
   *
   * @body { email: string }
   * @returns { success: boolean, message: string, data: { code?, expiresAt } }
   */
  async resendResetCode(req, res, next) {
    try {
      const { email } = req.body;

      // Validate email
      if (!email) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Email is required'
        });
      }

      const deviceInfo = {
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress
      };

      const result = await passwordResetService.resendResetCode(email, deviceInfo);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: result.message,
        data: {
          // In development, include the code for testing
          // Remove this in production
          code: result.code,
          expiresAt: result.expiresAt
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PasswordResetController();
