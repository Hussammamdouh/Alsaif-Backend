const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All message routes require authentication
router.use(authenticateToken);

// Message CRUD operations
router.put('/:messageId', messageController.editMessage);
router.delete('/:messageId', messageController.deleteMessage);

// Message interactions
router.post('/:messageId/reactions', messageController.addReaction);
router.delete('/:messageId/reactions/:emoji', messageController.removeReaction);
router.post('/:messageId/pin', messageController.pinMessage);
router.post('/:messageId/forward', messageController.forwardMessage);

// Search messages
router.get('/search', messageController.searchMessages);

module.exports = router;
