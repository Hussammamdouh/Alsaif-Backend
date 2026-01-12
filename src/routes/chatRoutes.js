const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { paginationValidation } = require('../middleware/validation');

// All chat routes require authentication
router.use(authenticateToken);

// Create chats
router.post('/private', chatController.createPrivateChat);
router.post('/group', chatController.createGroupChat);

// Get chats
router.get('/', paginationValidation, chatController.getMyChats);
router.get('/:chatId', chatController.getChatDetails);
router.get('/:chatId/messages', paginationValidation, chatController.getChatMessages);

// Manage participants
router.post('/:chatId/participants', chatController.addParticipant);
router.delete('/:chatId/participants/:userId', chatController.removeParticipant);
router.post('/:chatId/leave', chatController.leaveChat);

// Chat management
router.patch('/:chatId/archive', chatController.archiveChat);
router.delete('/:chatId/archive', chatController.unarchiveChat); // DELETE on archive endpoint to unarchive
router.delete('/:chatId', chatController.deleteChat);

// User blocking
router.post('/block', chatController.blockUser);

module.exports = router;
