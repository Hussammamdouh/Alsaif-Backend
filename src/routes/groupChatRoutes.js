/**
 * Group Chat Routes
 * Routes for chat settings, permissions, and member management
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const {
    getChatSettings,
    updateChatSettings,
    grantSendPermission,
    revokeSendPermission,
    kickUser,
    getTierGroups
} = require('../controllers/groupChatController');

// All routes require authentication
router.use(authenticateToken);

// Debug middleware for this router
router.use((req, res, next) => {
    console.log(`[GroupChatRouter] Request: ${req.method} ${req.path}`);
    next();
});

// Ping route
router.get('/ping', (req, res) => res.json({ message: 'pong' }));

// Get tier groups info (admin only)
router.get('/tier-groups', authorizeRoles('admin', 'superadmin'), getTierGroups);

// Chat settings routes
router.get('/:chatId/settings', (req, res, next) => {
    console.log(`[GroupChatRouter] Matched settings route for ${req.params.chatId}`);
    next();
}, getChatSettings);
router.patch('/:chatId/settings', updateChatSettings);

// Permission management routes
router.post('/:chatId/grant-send/:userId', grantSendPermission);
router.delete('/:chatId/revoke-send/:userId', revokeSendPermission);

// Kick user route
router.delete('/:chatId/kick/:userId', kickUser);

module.exports = router;
