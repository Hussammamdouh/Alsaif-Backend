const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { authenticateToken } = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');
const { rateLimiters } = require('../middleware/rateLimiter');

/**
 * @route   PATCH /api/users/me
 * @desc    Update current user profile
 * @access  Private
 */
router.patch(
  '/me',
  authenticateToken,
  rateLimiters.updateProfile,
  [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Name must be between 2 and 50 characters'),
    body('avatar')
      .optional()
      .trim()
      .isURL()
      .withMessage('Avatar must be a valid URL')
  ],
  userController.updateProfile
);

/**
 * @route   GET /api/users/me/sessions
 * @desc    Get all active sessions for current user
 * @access  Private
 */
router.get(
  '/me/sessions',
  authenticateToken,
  rateLimiters.general,
  userController.getActiveSessions
);

/**
 * @route   DELETE /api/users/me/sessions/:sessionId
 * @desc    Revoke a specific session
 * @access  Private
 */
router.delete(
  '/me/sessions/:sessionId',
  authenticateToken,
  rateLimiters.revokeSession,
  [
    param('sessionId')
      .isMongoId()
      .withMessage('Invalid session ID')
  ],
  userController.revokeSession
);

/**
 * @route   PATCH /api/users/me/settings
 * @desc    Update user settings
 * @access  Private
 */
router.patch(
  '/me/settings',
  authenticateToken,
  rateLimiters.updateSettings,
  [
    body('biometricEnabled')
      .optional()
      .isBoolean()
      .withMessage('Biometric enabled must be a boolean'),
    body('language')
      .optional()
      .isIn(['en', 'ar', 'fr', 'es', 'de'])
      .withMessage('Invalid language'),
    body('theme')
      .optional()
      .isIn(['light', 'dark', 'auto'])
      .withMessage('Invalid theme'),
    body('chat.muteGroups')
      .optional()
      .isBoolean()
      .withMessage('Mute groups must be a boolean'),
    body('chat.readReceipts')
      .optional()
      .isBoolean()
      .withMessage('Read receipts must be a boolean')
  ],
  userController.updateSettings
);

/**
 * @route   POST /api/users/me/delete-request
 * @desc    Request account deletion (30-day grace period)
 * @access  Private
 */
router.post(
  '/me/delete-request',
  authenticateToken,
  rateLimiters.strict,
  [
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
    body('reason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason cannot exceed 500 characters')
  ],
  userController.requestAccountDeletion
);

/**
 * @route   POST /api/users/me/cancel-deletion
 * @desc    Cancel account deletion request
 * @access  Private
 */
router.post(
  '/me/cancel-deletion',
  authenticateToken,
  rateLimiters.general,
  userController.cancelAccountDeletion
);

/**
 * @route   GET /api/users/search
 * @desc    Search users by name or email
 * @access  Private
 */
router.get(
  '/search',
  authenticateToken,
  rateLimiters.general,
  userController.searchUsers
);

/**
 * @route   GET /api/users/me/export-data
 * @desc    Export all user data (GDPR compliance)
 * @access  Private
 */
router.get(
  '/me/export-data',
  authenticateToken,
  rateLimiters.general,
  userController.exportUserData
);

module.exports = router;
