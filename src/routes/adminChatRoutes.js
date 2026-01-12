const express = require('express');
const router = express.Router();
const adminChatController = require('../controllers/adminChatController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { ROLES } = require('../constants');
const { body, param } = require('express-validator');
const { validate, paginationValidation } = require('../middleware/validation');
const { contentCreationLimiter } = require('../middleware/advancedRateLimit');

/**
 * Admin Chat Routes
 *
 * All routes require Admin or Superadmin role
 * Features: View all chats, create groups, mute/ban users, delete chats
 */

// All routes require authentication and admin/superadmin role
router.use(authenticateToken);
router.use(authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN));

// ==================== VALIDATION RULES ====================

const createGroupChatValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Group name is required')
    .isLength({ min: 3, max: 100 })
    .withMessage('Group name must be between 3 and 100 characters'),
  body('participantIds')
    .optional()
    .isArray()
    .withMessage('Participant IDs must be an array'),
  body('participantIds.*')
    .optional()
    .isMongoId()
    .withMessage('Invalid participant ID'),
  body('isPremium')
    .optional()
    .isBoolean()
    .withMessage('isPremium must be a boolean'),
  validate
];

const muteUserValidation = [
  param('chatId').isMongoId().withMessage('Invalid chat ID'),
  param('userId').isMongoId().withMessage('Invalid user ID'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
  validate
];

const unmuteUserValidation = [
  param('chatId').isMongoId().withMessage('Invalid chat ID'),
  param('userId').isMongoId().withMessage('Invalid user ID'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
  validate
];

const banUserValidation = [
  param('chatId').isMongoId().withMessage('Invalid chat ID'),
  param('userId').isMongoId().withMessage('Invalid user ID'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
  validate
];

const unbanUserValidation = [
  param('chatId').isMongoId().withMessage('Invalid chat ID'),
  param('userId').isMongoId().withMessage('Invalid user ID'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
  validate
];

const deleteChatValidation = [
  param('chatId').isMongoId().withMessage('Invalid chat ID'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters'),
  validate
];

const chatIdValidation = [
  param('chatId').isMongoId().withMessage('Invalid chat ID'),
  validate
];

// ==================== ROUTES ====================

// Get all chats (admin view)
router.get(
  '/',
  paginationValidation,
  adminChatController.getAllChats
);

// Get chat statistics
router.get(
  '/stats',
  adminChatController.getChatStats
);

// Create group chat as admin (with content creation rate limiting)
router.post(
  '/group',
  contentCreationLimiter,
  createGroupChatValidation,
  adminChatController.createGroupChat
);

// View chat messages (moderation)
router.get(
  '/:chatId/messages',
  chatIdValidation,
  paginationValidation,
  adminChatController.getChatMessages
);

// Mute user in chat
router.post(
  '/:chatId/mute/:userId',
  muteUserValidation,
  adminChatController.muteUserInChat
);

// Unmute user in chat
router.post(
  '/:chatId/unmute/:userId',
  unmuteUserValidation,
  adminChatController.unmuteUserInChat
);

// Ban user from chat
router.post(
  '/:chatId/ban/:userId',
  banUserValidation,
  adminChatController.banUserFromChat
);

// Unban user from chat
router.post(
  '/:chatId/unban/:userId',
  unbanUserValidation,
  adminChatController.unbanUserFromChat
);

// Delete chat
router.delete(
  '/:chatId',
  deleteChatValidation,
  adminChatController.deleteChat
);

module.exports = router;
