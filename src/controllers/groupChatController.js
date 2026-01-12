/**
 * Group Chat Controller
 * Handles chat settings, permissions, and member management
 */

const groupChatService = require('../services/groupChatService');
const { HTTP_STATUS } = require('../constants');

/**
 * Get chat settings
 * GET /api/chats/:chatId/settings
 */
const getChatSettings = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user.id;

        const settings = await groupChatService.getChatSettings(chatId, userId);

        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('[GroupChatController] getChatSettings error:', error);
        res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Update chat settings
 * PATCH /api/chats/:chatId/settings
 */
const updateChatSettings = async (req, res) => {
    try {
        const { chatId } = req.params;
        const adminId = req.user.id;
        const { onlyAdminsCanSend } = req.body;

        const chat = await groupChatService.updateChatSettings(chatId, adminId, {
            onlyAdminsCanSend
        });

        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: 'Chat settings updated successfully',
            data: {
                id: chat._id,
                settings: chat.settings
            }
        });
    } catch (error) {
        console.error('[GroupChatController] updateChatSettings error:', error);
        res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Grant send permission to a user
 * POST /api/chats/:chatId/grant-send/:userId
 */
const grantSendPermission = async (req, res) => {
    try {
        const { chatId, userId } = req.params;
        const adminId = req.user.id;

        await groupChatService.grantSendPermission(chatId, adminId, userId);

        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: 'Send permission granted successfully'
        });
    } catch (error) {
        console.error('[GroupChatController] grantSendPermission error:', error);
        res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Revoke send permission from a user
 * DELETE /api/chats/:chatId/revoke-send/:userId
 */
const revokeSendPermission = async (req, res) => {
    try {
        const { chatId, userId } = req.params;
        const adminId = req.user.id;

        await groupChatService.revokeSendPermission(chatId, adminId, userId);

        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: 'Send permission revoked successfully'
        });
    } catch (error) {
        console.error('[GroupChatController] revokeSendPermission error:', error);
        res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Kick a user from the chat
 * DELETE /api/chats/:chatId/kick/:userId
 */
const kickUser = async (req, res) => {
    try {
        const { chatId, userId } = req.params;
        const adminId = req.user.id;

        await groupChatService.kickUser(chatId, adminId, userId);

        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: 'User removed from chat successfully'
        });
    } catch (error) {
        console.error('[GroupChatController] kickUser error:', error);
        res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Get tier groups info (for admin dashboard)
 * GET /api/chats/tier-groups
 */
const getTierGroups = async (req, res) => {
    try {
        const freeGroup = await groupChatService.getTierGroup('free');
        const premiumGroup = await groupChatService.getTierGroup('premium');

        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                freeGroup: freeGroup ? {
                    id: freeGroup._id,
                    name: freeGroup.name,
                    participantCount: freeGroup.participants.length
                } : null,
                premiumGroup: premiumGroup ? {
                    id: premiumGroup._id,
                    name: premiumGroup.name,
                    participantCount: premiumGroup.participants.length
                } : null
            }
        });
    } catch (error) {
        console.error('[GroupChatController] getTierGroups error:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER).json({
            success: false,
            message: 'Failed to get tier groups'
        });
    }
};

module.exports = {
    getChatSettings,
    updateChatSettings,
    grantSendPermission,
    revokeSendPermission,
    kickUser,
    getTierGroups
};
