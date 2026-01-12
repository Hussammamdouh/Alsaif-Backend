const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const passwordResetController = require('../controllers/passwordResetController');
const passwordChangeController = require('../controllers/passwordChangeController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { registerLimiter, loginLimiter } = require('../middleware/security');
const {
  registerValidation,
  loginValidation,
  refreshTokenValidation
} = require('../middleware/validation');

// Public routes with rate limiting and validation
router.post(
  '/register',
  registerLimiter,
  registerValidation,
  authController.register
);

router.post(
  '/login',
  loginLimiter,
  loginValidation,
  authController.login
);

router.post(
  '/refresh-token',
  refreshTokenValidation,
  authController.refreshToken
);

router.post(
  '/logout',
  refreshTokenValidation,
  authController.logout
);

// Password Reset routes (public, with rate limiting)
router.post(
  '/forgot-password',
  loginLimiter, // Reuse login limiter for rate limiting
  passwordResetController.forgotPassword
);

router.post(
  '/verify-reset-code',
  loginLimiter,
  passwordResetController.verifyResetCode
);

router.post(
  '/reset-password',
  loginLimiter,
  passwordResetController.resetPassword
);

router.post(
  '/reset-password-with-token',
  loginLimiter,
  passwordResetController.resetPasswordWithToken
);

router.post(
  '/resend-reset-code',
  loginLimiter,
  passwordResetController.resendResetCode
);

// Protected routes
router.get('/me', authenticateToken, authController.getMe);

router.post('/logout-all', authenticateToken, authController.logoutAll);

router.post('/change-password', authenticateToken, passwordChangeController.changePassword);

module.exports = router;
