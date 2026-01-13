const authService = require('../services/authService');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../constants');

class AuthController {
  async register(req, res, next) {
    try {
      const { name, email, password, nationality } = req.body;
      const deviceInfo = {
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress
      };

      const result = await authService.register({ name, email, password, nationality }, deviceInfo);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: SUCCESS_MESSAGES.REGISTER_SUCCESS,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const deviceInfo = {
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress
      };

      const result = await authService.login(email, password, deviceInfo);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;

      const result = await authService.refreshToken(refreshToken);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.TOKEN_REFRESHED,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      const { refreshToken } = req.body;

      // SECURITY FIX (CRITICAL): Extract access token from header to blacklist it
      const accessToken = req.headers.authorization?.split(' ')[1];

      await authService.logout(refreshToken, accessToken);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.LOGOUT_SUCCESS
      });
    } catch (error) {
      next(error);
    }
  }

  async logoutAll(req, res, next) {
    try {
      // SECURITY FIX (CRITICAL): Extract access token from header to blacklist it
      const accessToken = req.headers.authorization?.split(' ')[1];

      await authService.logoutAll(req.user.id, accessToken);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.LOGOUT_SUCCESS
      });
    } catch (error) {
      next(error);
    }
  }

  async getMe(req, res, next) {
    try {
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          user: req.user
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
