const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const AuditLogger = require('../utils/auditLogger');
const { HTTP_STATUS, AUDIT_ACTIONS, CHAT_PERMISSIONS } = require('../constants');
const { getPaginationParams } = require('../utils/pagination');

/**
 * Admin Chat Controller
 *
 * Purpose: Admin-level chat management capabilities
 * Features:
 * - View all chats (moderation)
 * - Create group chats as admin
 * - Mute/unmute users in chats
 * - Ban/unban users from chats
 * - View chat statistics
 * - Delete inappropriate chats
 */

class AdminChatController {
  /**
   * Get all chats (Admin/Superadmin only)
   * GET /api/admin/chats
   */
  async getAllChats(req, res, next) {
    try {
      const { page, limit } = getPaginationParams(req.query);
      const { type, isPremium, search } = req.query;

      const query = {};

      if (type) query.type = type;
      if (isPremium !== undefined) query.isPremium = isPremium === 'true';
      if (search) {
        query.name = { $regex: search, $options: 'i' };
      }

      const skip = (page - 1) * limit;

      const [chats, total] = await Promise.all([
        Chat.find(query)
          .populate('createdBy', 'name email role')
          .populate('participants.user', 'name email role')
          .populate('lastMessage.sender', 'name email')
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit),
        Chat.countDocuments(query)
      ]);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Chats retrieved successfully',
        data: {
          chats,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            itemsPerPage: limit
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get chat statistics (Admin/Superadmin only)
   * GET /api/admin/chats/stats
   */
  async getChatStats(req, res, next) {
    try {
      const stats = await Chat.aggregate([
        {
          $facet: {
            totalByType: [
              {
                $group: {
                  _id: '$type',
                  count: { $sum: 1 }
                }
              }
            ],
            premiumChats: [
              { $match: { isPremium: true } },
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 }
                }
              }
            ],
            averageParticipants: [
              {
                $group: {
                  _id: null,
                  avgParticipants: {
                    $avg: { $size: '$participants' }
                  },
                  maxParticipants: {
                    $max: { $size: '$participants' }
                  }
                }
              }
            ],
            mostActiveChats: [
              { $sort: { updatedAt: -1 } },
              { $limit: 10 },
              {
                $project: {
                  name: 1,
                  type: 1,
                  participantCount: { $size: '$participants' },
                  lastMessage: 1,
                  updatedAt: 1
                }
              }
            ],
            largestChats: [
              {
                $project: {
                  name: 1,
                  type: 1,
                  participantCount: { $size: '$participants' },
                  isPremium: 1
                }
              },
              { $sort: { participantCount: -1 } },
              { $limit: 10 }
            ],
            totalChats: [
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 }
                }
              }
            ]
          }
        }
      ]);

      // Get total messages count
      const totalMessages = await Message.countDocuments();

      const result = stats[0];

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Chat statistics retrieved successfully',
        data: {
          totalChats: result.totalChats[0]?.count || 0,
          totalMessages,
          byType: result.totalByType,
          premiumChats: result.premiumChats[0]?.count || 0,
          averageParticipants: result.averageParticipants[0]?.avgParticipants || 0,
          maxParticipants: result.averageParticipants[0]?.maxParticipants || 0,
          mostActiveChats: result.mostActiveChats,
          largestChats: result.largestChats
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create group chat as admin (Admin/Superadmin only)
   * POST /api/admin/chats/group
   */
  async createGroupChat(req, res, next) {
    try {
      const { name, participantIds, isPremium } = req.body;

      if (!name) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Group name is required'
        });
      }

      // Verify all participant IDs exist
      if (participantIds && participantIds.length > 0) {
        const users = await User.find({ _id: { $in: participantIds } });
        if (users.length !== participantIds.length) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'One or more participant IDs are invalid'
          });
        }
      }

      const chat = await Chat.create({
        name,
        type: 'group',
        isPremium: isPremium || false,
        createdBy: req.user.id,
        participants: [
          {
            user: req.user.id,
            permission: CHAT_PERMISSIONS.ADMIN
          },
          ...(participantIds || []).map(userId => ({
            user: userId,
            permission: CHAT_PERMISSIONS.MEMBER
          }))
        ]
      });

      await chat.populate('participants.user', 'name email role');

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.CHAT_CREATED,
        target: {
          resourceType: 'Chat',
          resourceId: chat._id,
          resourceName: chat.name
        },
        changes: {
          after: {
            name: chat.name,
            type: chat.type,
            isPremium: chat.isPremium,
            participantCount: chat.participants.length
          }
        },
        metadata: {
          severity: 'low',
          notes: 'Group chat created by admin'
        }
      });

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Group chat created successfully',
        data: { chat }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mute user in chat (Admin/Superadmin only)
   * POST /api/admin/chats/:chatId/mute/:userId
   */
  async muteUserInChat(req, res, next) {
    try {
      const { chatId, userId } = req.params;
      const { reason, notes } = req.body;

      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Chat not found'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user is participant
      if (!chat.isParticipant(userId)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'User is not a participant in this chat'
        });
      }

      // Change permission to read_only
      const participant = chat.participants.find(
        p => p.user.toString() === userId.toString()
      );

      const oldPermission = participant.permission;
      participant.permission = CHAT_PERMISSIONS.READ_ONLY;

      await chat.save();

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.USER_MUTED,
        target: {
          resourceType: 'Chat',
          resourceId: chatId,
          resourceName: chat.name
        },
        changes: {
          before: { userId, permission: oldPermission },
          after: { userId, permission: CHAT_PERMISSIONS.READ_ONLY }
        },
        metadata: {
          severity: 'medium',
          reason: reason || 'No reason provided',
          notes,
          targetUser: user.email
        }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'User muted successfully',
        data: { chat }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Unmute user in chat (Admin/Superadmin only)
   * POST /api/admin/chats/:chatId/unmute/:userId
   */
  async unmuteUserInChat(req, res, next) {
    try {
      const { chatId, userId } = req.params;
      const { notes } = req.body;

      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Chat not found'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user is participant
      if (!chat.isParticipant(userId)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'User is not a participant in this chat'
        });
      }

      // Change permission to member
      const participant = chat.participants.find(
        p => p.user.toString() === userId.toString()
      );

      const oldPermission = participant.permission;
      participant.permission = CHAT_PERMISSIONS.MEMBER;

      await chat.save();

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.USER_UNMUTED,
        target: {
          resourceType: 'Chat',
          resourceId: chatId,
          resourceName: chat.name
        },
        changes: {
          before: { userId, permission: oldPermission },
          after: { userId, permission: CHAT_PERMISSIONS.MEMBER }
        },
        metadata: {
          severity: 'medium',
          notes,
          targetUser: user.email
        }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'User unmuted successfully',
        data: { chat }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Ban user from chat (Admin/Superadmin only)
   * POST /api/admin/chats/:chatId/ban/:userId
   */
  async banUserFromChat(req, res, next) {
    try {
      const { chatId, userId } = req.params;
      const { reason, notes } = req.body;

      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Chat not found'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user is participant
      if (!chat.isParticipant(userId)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'User is not a participant in this chat'
        });
      }

      // Cannot ban admins of the chat
      const userPermission = chat.getUserPermission(userId);
      if (userPermission === CHAT_PERMISSIONS.ADMIN) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: 'Cannot ban chat admin'
        });
      }

      // Remove user from chat
      chat.removeParticipant(userId);
      await chat.save();

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.USER_BANNED,
        target: {
          resourceType: 'Chat',
          resourceId: chatId,
          resourceName: chat.name
        },
        changes: {
          before: { userId, isParticipant: true },
          after: { userId, isParticipant: false }
        },
        metadata: {
          severity: 'high',
          reason: reason || 'No reason provided',
          notes,
          targetUser: user.email
        }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'User banned from chat successfully',
        data: { chat }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add user back to chat (after ban) (Admin/Superadmin only)
   * POST /api/admin/chats/:chatId/unban/:userId
   */
  async unbanUserFromChat(req, res, next) {
    try {
      const { chatId, userId } = req.params;
      const { notes } = req.body;

      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Chat not found'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user is already a participant
      if (chat.isParticipant(userId)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'User is already a participant in this chat'
        });
      }

      // Add user back to chat
      chat.addParticipant(userId, CHAT_PERMISSIONS.MEMBER);
      await chat.save();

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.USER_UNBANNED,
        target: {
          resourceType: 'Chat',
          resourceId: chatId,
          resourceName: chat.name
        },
        changes: {
          before: { userId, isParticipant: false },
          after: { userId, isParticipant: true }
        },
        metadata: {
          severity: 'medium',
          notes,
          targetUser: user.email
        }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'User unbanned successfully',
        data: { chat }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete chat (Admin/Superadmin only)
   * DELETE /api/admin/chats/:chatId
   */
  async deleteChat(req, res, next) {
    try {
      const { chatId } = req.params;
      const { reason } = req.body;

      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Chat not found'
        });
      }

      const chatData = {
        name: chat.name,
        type: chat.type,
        participantCount: chat.participants.length
      };

      await Chat.findByIdAndDelete(chatId);

      // Also delete all messages in this chat
      const deletedMessages = await Message.deleteMany({ chat: chatId });

      // Audit log
      await AuditLogger.logFromRequest(req, {
        action: AUDIT_ACTIONS.CHAT_DELETED,
        target: {
          resourceType: 'Chat',
          resourceId: chatId,
          resourceName: chat.name
        },
        changes: {
          before: chatData
        },
        metadata: {
          severity: 'critical',
          reason: reason || 'No reason provided',
          deletedMessagesCount: deletedMessages.deletedCount
        }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Chat deleted successfully',
        data: {
          deletedMessagesCount: deletedMessages.deletedCount
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * View chat messages (Admin moderation)
   * GET /api/admin/chats/:chatId/messages
   */
  async getChatMessages(req, res, next) {
    try {
      const { chatId } = req.params;
      const { page, limit } = getPaginationParams(req.query);

      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Chat not found'
        });
      }

      const skip = (page - 1) * limit;

      const [messages, total] = await Promise.all([
        Message.find({ chat: chatId })
          .populate('sender', 'name email role')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Message.countDocuments({ chat: chatId })
      ]);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Chat messages retrieved successfully',
        data: {
          chat: {
            id: chat._id,
            name: chat.name,
            type: chat.type
          },
          messages,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            itemsPerPage: limit
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminChatController();
