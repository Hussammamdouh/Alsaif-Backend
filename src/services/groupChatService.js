/**
 * Group Chat Service
 * Handles tier-based group chat management (Free/Premium tier groups)
 */

const Chat = require('../models/Chat');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { CHAT_TYPES, CHAT_PERMISSIONS, SUBSCRIPTION_TIERS } = require('../constants');

// System user ID for creating system groups (use a dedicated system account or first admin)
const SYSTEM_USER_PLACEHOLDER = 'SYSTEM';

/**
 * Tier group configuration
 */
const TIER_GROUPS = {
    free: {
        name: 'Elsaif Community',
        description: 'Chat group for all Elsaif users'
    },
    premium: {
        name: 'Premium Members Lounge',
        description: 'Exclusive chat for premium subscribers'
    }
};

class GroupChatService {
    /**
     * Get or create a tier group chat
     * @param {string} tier - 'free' or 'premium'
     * @param {string} creatorId - User ID of creator (admin)
     * @returns {Object} - The tier group chat
     */
    async getOrCreateTierGroup(tier, creatorId) {
        // Check if tier group already exists
        let tierGroup = await Chat.findOne({
            isSystemGroup: true,
            tierGroup: tier
        });

        if (tierGroup) {
            return tierGroup;
        }

        // Create new tier group
        const groupConfig = TIER_GROUPS[tier];
        if (!groupConfig) {
            throw new Error(`Invalid tier: ${tier}`);
        }

        tierGroup = new Chat({
            name: groupConfig.name,
            type: CHAT_TYPES.GROUP,
            isSystemGroup: true,
            tierGroup: tier,
            isPremium: tier === 'premium',
            createdBy: creatorId,
            participants: [{
                user: creatorId,
                permission: CHAT_PERMISSIONS.ADMIN,
                joinedAt: new Date()
            }],
            settings: {
                onlyAdminsCanSend: true,  // Only admins can send by default
                allowedSenders: []
            }
        });

        await tierGroup.save();
        console.log(`[GroupChatService] Created ${tier} tier group: ${tierGroup._id}`);

        return tierGroup;
    }

    /**
     * Initialize both tier groups on server startup
     * @param {string} adminId - Admin user ID to create groups
     */
    async initializeTierGroups(adminId) {
        console.log('[GroupChatService] Initializing tier groups...');

        const freeGroup = await this.getOrCreateTierGroup('free', adminId);
        const premiumGroup = await this.getOrCreateTierGroup('premium', adminId);

        // Ensure all admins are in both groups
        await this.syncAdminsToGroups();

        console.log('[GroupChatService] Tier groups initialized:', {
            freeGroupId: freeGroup._id,
            premiumGroupId: premiumGroup._id
        });

        return { freeGroup, premiumGroup };
    }

    /**
     * Get tier group chat by tier
     * @param {string} tier - 'free' or 'premium'
     */
    async getTierGroup(tier) {
        return Chat.findOne({
            isSystemGroup: true,
            tierGroup: tier
        });
    }

    /**
     * Add user to appropriate tier group
     * @param {string} userId - User ID
     * @param {string} tier - 'free' or 'premium'
     */
    async addUserToTierGroup(userId, tier) {
        const tierGroup = await this.getTierGroup(tier);

        if (!tierGroup) {
            console.warn(`[GroupChatService] ${tier} tier group not found`);
            return null;
        }

        if (!tierGroup.isParticipant(userId)) {
            // Check if user is admin
            const user = await User.findById(userId);
            const permission = user && user.role === 'admin'
                ? CHAT_PERMISSIONS.ADMIN
                : CHAT_PERMISSIONS.READ_ONLY;  // Regular users are read-only by default

            tierGroup.addParticipant(userId, permission);
            await tierGroup.save();

            console.log(`[GroupChatService] Added user ${userId} to ${tier} tier group with permission: ${permission}`);
        }

        return tierGroup;
    }

    /**
     * Remove user from tier group
     * @param {string} userId - User ID
     * @param {string} tier - 'free' or 'premium'
     */
    async removeUserFromTierGroup(userId, tier) {
        const tierGroup = await this.getTierGroup(tier);

        if (!tierGroup) {
            console.warn(`[GroupChatService] ${tier} tier group not found`);
            return null;
        }

        if (tierGroup.isParticipant(userId)) {
            tierGroup.removeParticipant(userId);
            await tierGroup.save();
            console.log(`[GroupChatService] Removed user ${userId} from ${tier} tier group`);
        }

        return tierGroup;
    }

    /**
     * Handle subscription tier change
     * @param {string} userId - User ID
     * @param {string} oldTier - Previous tier ('free' or 'premium')
     * @param {string} newTier - New tier ('free' or 'premium')
     */
    async handleSubscriptionChange(userId, oldTier, newTier) {
        console.log(`[GroupChatService] Handling subscription change for user ${userId}: ${oldTier} -> ${newTier}`);

        // If upgrading to premium, add to premium group
        if (newTier === 'premium' && oldTier !== 'premium') {
            await this.addUserToTierGroup(userId, 'premium');
        }

        // If downgrading from premium, remove from premium group
        if (oldTier === 'premium' && newTier !== 'premium') {
            await this.removeUserFromTierGroup(userId, 'premium');
        }

        // Always ensure user is in free group (all users are in free group)
        await this.addUserToTierGroup(userId, 'free');
    }

    /**
     * Handle new user registration
     * @param {string} userId - New user ID
     */
    async handleNewUserRegistration(userId) {
        console.log(`[GroupChatService] Handling new user registration: ${userId}`);

        // Add new user to free tier group
        await this.addUserToTierGroup(userId, 'free');
    }

    /**
     * Handle subscription cancellation/expiration
     * @param {string} userId - User ID
     */
    async handleSubscriptionEnd(userId) {
        console.log(`[GroupChatService] Handling subscription end for user ${userId}`);

        // Remove from premium group
        await this.removeUserFromTierGroup(userId, 'premium');
    }

    /**
     * Sync all admins to both tier groups
     */
    async syncAdminsToGroups() {
        const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } });

        for (const admin of admins) {
            await this.addUserToTierGroup(admin._id, 'free');
            await this.addUserToTierGroup(admin._id, 'premium');
        }

        console.log(`[GroupChatService] Synced ${admins.length} admins to both tier groups`);
    }

    /**
     * Grant send permission to a user in a chat
     * @param {string} chatId - Chat ID
     * @param {string} adminId - Admin performing the action
     * @param {string} userId - User to grant permission
     */
    async grantSendPermission(chatId, adminId, userId) {
        const chat = await Chat.findById(chatId);

        if (!chat) {
            throw new Error('Chat not found');
        }

        // Verify admin has permission
        const adminPermission = chat.getUserPermission(adminId);
        if (adminPermission !== CHAT_PERMISSIONS.ADMIN) {
            throw new Error('Only admins can grant send permissions');
        }

        // Verify target user is a participant
        if (!chat.isParticipant(userId)) {
            throw new Error('User is not a participant in this chat');
        }

        chat.grantSendPermission(userId);
        await chat.save();

        return chat;
    }

    /**
     * Revoke send permission from a user in a chat
     * @param {string} chatId - Chat ID
     * @param {string} adminId - Admin performing the action
     * @param {string} userId - User to revoke permission from
     */
    async revokeSendPermission(chatId, adminId, userId) {
        const chat = await Chat.findById(chatId);

        if (!chat) {
            throw new Error('Chat not found');
        }

        // Verify admin has permission
        const adminPermission = chat.getUserPermission(adminId);
        if (adminPermission !== CHAT_PERMISSIONS.ADMIN) {
            throw new Error('Only admins can revoke send permissions');
        }

        chat.revokeSendPermission(userId);
        await chat.save();

        return chat;
    }

    /**
     * Kick a user from a chat group
     * @param {string} chatId - Chat ID
     * @param {string} adminId - Admin performing the action
     * @param {string} userId - User to kick
     */
    async kickUser(chatId, adminId, userId) {
        const chat = await Chat.findById(chatId);

        if (!chat) {
            throw new Error('Chat not found');
        }

        // Verify admin has permission
        const adminPermission = chat.getUserPermission(adminId);
        if (adminPermission !== CHAT_PERMISSIONS.ADMIN) {
            throw new Error('Only admins can kick users');
        }

        // Cannot kick other admins from system groups
        if (chat.isSystemGroup) {
            const targetPermission = chat.getUserPermission(userId);
            if (targetPermission === CHAT_PERMISSIONS.ADMIN) {
                throw new Error('Cannot kick admins from system groups');
            }
        }

        chat.removeParticipant(userId);
        await chat.save();

        return chat;
    }

    /**
     * Update chat settings (like onlyAdminsCanSend)
     * @param {string} chatId - Chat ID
     * @param {string} adminId - Admin performing the action
     * @param {Object} settings - Settings to update
     */
    async updateChatSettings(chatId, adminId, settings) {
        const chat = await Chat.findById(chatId);

        if (!chat) {
            throw new Error('Chat not found');
        }

        // Verify admin has permission
        const adminPermission = chat.getUserPermission(adminId);
        if (adminPermission !== CHAT_PERMISSIONS.ADMIN) {
            throw new Error('Only admins can update chat settings');
        }

        // Update settings
        if (!chat.settings) {
            chat.settings = { onlyAdminsCanSend: false, allowedSenders: [] };
        }

        if (typeof settings.onlyAdminsCanSend === 'boolean') {
            chat.settings.onlyAdminsCanSend = settings.onlyAdminsCanSend;
        }

        await chat.save();

        return chat;
    }

    /**
     * Get chat settings and members for settings screen
     * @param {string} chatId - Chat ID
     * @param {string} userId - Requesting user ID
     */
    async getChatSettings(chatId, userId) {
        const chat = await Chat.findById(chatId)
            .populate('participants.user', 'name email avatar role')
            .populate('settings.allowedSenders', 'name email avatar');

        if (!chat) {
            throw new Error('Chat not found');
        }

        // Verify user is a participant
        if (!chat.isParticipant(userId)) {
            throw new Error('Not a participant in this chat');
        }

        const userPermission = chat.getUserPermission(userId);
        const isAdmin = userPermission === CHAT_PERMISSIONS.ADMIN;

        return {
            id: chat._id,
            name: chat.name,
            type: chat.type,
            isSystemGroup: chat.isSystemGroup,
            tierGroup: chat.tierGroup,
            participantCount: chat.participants.length,
            settings: {
                onlyAdminsCanSend: chat.settings?.onlyAdminsCanSend || false,
                allowedSenders: chat.settings?.allowedSenders || []
            },
            participants: chat.participants.map(p => ({
                id: p.user._id || p.user,
                name: p.user.name || 'Unknown',
                email: p.user.email,
                avatar: p.user.avatar,
                role: p.user.role,
                permission: p.permission,
                joinedAt: p.joinedAt,
                canSend: chat.canSendMessage(p.user._id || p.user)
            })),
            currentUserPermission: userPermission,
            isAdmin,
            canSend: chat.canSendMessage(userId)
        };
    }

    /**
     * Bulk add participants to a chat by tier or identifier
     * @param {string} chatId - Chat ID
     * @param {Object} options - { tiers, identifiers }
     * @returns {Object} - Result summary
     */
    async bulkAddParticipants(chatId, { tiers, identifiers }) {
        const chat = await Chat.findById(chatId);
        if (!chat) {
            throw new Error('Chat not found');
        }

        const participantIds = new Set();

        // 1. Process Tiers
        if (tiers && Array.isArray(tiers) && tiers.length > 0) {
            const usersByTier = await User.find({
                'subscription.tier': { $in: tiers }
            }).select('_id');
            usersByTier.forEach(u => participantIds.add(u._id.toString()));
        }

        // 2. Process Identifiers (Email, Phone, Name)
        if (identifiers && Array.isArray(identifiers) && identifiers.length > 0) {
            const usersByIdentifiers = await User.find({
                $or: [
                    { email: { $in: identifiers } },
                    { phoneNumber: { $in: identifiers } },
                    { name: { $in: identifiers } }
                ]
            }).select('_id');
            usersByIdentifiers.forEach(u => participantIds.add(u._id.toString()));
        }

        // 3. Add to chat
        let addedCount = 0;
        let skippedCount = 0;

        for (const userId of participantIds) {
            if (!chat.isParticipant(userId)) {
                chat.addParticipant(userId, CHAT_PERMISSIONS.MEMBER);
                addedCount++;
            } else {
                skippedCount++;
            }
        }

        if (addedCount > 0) {
            await chat.save();
        }

        return {
            chatId,
            chatName: chat.name,
            totalFound: participantIds.size,
            addedCount,
            skippedCount
        };
    }
}

module.exports = new GroupChatService();
