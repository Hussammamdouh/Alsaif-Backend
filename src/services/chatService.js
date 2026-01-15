const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const { CHAT_TYPES, CHAT_PERMISSIONS, ERROR_MESSAGES } = require('../constants');
const { sanitizeMessage } = require('../utils/sanitizer');
const { emitChatMessageReceived } = require('../events/enhancedNotificationEvents');

class ChatService {
  async createPrivateChat(user1Id, user2Id, initialMessage = null) {
    // Check if private chat already exists
    let chat = await Chat.findOne({
      type: CHAT_TYPES.PRIVATE,
      'participants.user': { $all: [user1Id, user2Id] }
    });

    if (!chat) {
      // Create new private chat
      chat = await Chat.create({
        type: CHAT_TYPES.PRIVATE,
        participants: [
          { user: user1Id, permission: CHAT_PERMISSIONS.MEMBER },
          { user: user2Id, permission: CHAT_PERMISSIONS.MEMBER }
        ],
        createdBy: user1Id
      });
    }

    // If initial message provided, send it
    if (initialMessage) {
      await this.sendMessage(chat._id, user1Id, initialMessage);
    }

    return chat.populate('participants.user', 'name email avatar');
  }

  async createGroupChat(name, creatorId, participantIds = [], isPremium = false) {
    // Add creator to participants with admin permission
    const participants = [
      { user: creatorId, permission: CHAT_PERMISSIONS.ADMIN }
    ];

    // Add other participants
    participantIds.forEach(userId => {
      if (userId.toString() !== creatorId.toString()) {
        participants.push({
          user: userId,
          permission: CHAT_PERMISSIONS.MEMBER
        });
      }
    });

    const chat = await Chat.create({
      name,
      type: CHAT_TYPES.GROUP,
      participants,
      isPremium,
      createdBy: creatorId
    });

    return chat.populate('participants.user', 'name email');
  }

  async getUserChats(userId, { page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;

    const [chats, total] = await Promise.all([
      Chat.find({
        'participants.user': userId,
        deletedBy: { $ne: userId }
      })
        .populate('participants.user', 'name email avatar')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit),
      Chat.countDocuments({
        'participants.user': userId,
        deletedBy: { $ne: userId }
      })
    ]);

    // Manually populate lastMessage.sender after the query
    const populatedChats = await Promise.all(
      chats.map(async (chat) => {
        if (chat.lastMessage && chat.lastMessage.sender) {
          await chat.populate('lastMessage.sender', 'name email');
        }
        return chat.toObject();
      })
    );

    return {
      chats: populatedChats,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    };
  }

  async getChatById(chatId, userId) {
    const chat = await Chat.findById(chatId)
      .populate('participants.user', 'name email role')
      .populate('createdBy', 'name email');

    if (!chat) {
      throw new Error('Chat not found');
    }

    // Check if user is participant
    if (!chat.isParticipant(userId)) {
      throw new Error('You are not a participant of this chat');
    }

    return chat;
  }

  async sendMessage(chatId, senderId, content, replyTo = null) {
    const chat = await Chat.findById(chatId);

    if (!chat) {
      throw new Error('Chat not found');
    }

    // Check if sender is participant and can send messages
    if (!chat.isParticipant(senderId)) {
      throw new Error('You are not a participant of this chat');
    }

    if (!chat.canSendMessage(senderId)) {
      throw new Error('You do not have permission to send messages in this chat');
    }

    // SECURITY FIX: Sanitize message content to prevent XSS attacks
    const sanitizedContent = sanitizeMessage(content, false);

    // Create message with sanitized content
    const messageData = {
      chat: chatId,
      sender: senderId,
      content: sanitizedContent
    };

    // Add replyTo if provided
    if (replyTo) {
      messageData.replyTo = replyTo;
    }

    const message = await Message.create(messageData);

    // Update chat's last message with sanitized content
    chat.updateLastMessage(sanitizedContent, senderId);
    await chat.save();

    // Populate sender info and replyTo message if exists
    await message.populate('sender', 'name email');
    if (replyTo) {
      await message.populate({
        path: 'replyTo',
        select: 'content sender createdAt',
        populate: {
          path: 'sender',
          select: 'name'
        }
      });
    }

    // NOTIFICATION: Notify other participants
    const sender = await User.findById(senderId).select('name');
    const recipientIds = chat.participants
      .filter(p => p.user.toString() !== senderId.toString())
      .map(p => p.user);

    emitChatMessageReceived({
      chatId: chat._id,
      senderId: senderId,
      senderName: sender.name,
      content: sanitizedContent,
      recipientIds: recipientIds,
      chatName: chat.name || (chat.type === CHAT_TYPES.PRIVATE ? sender.name : 'Group Chat'),
      isGroup: chat.type === CHAT_TYPES.GROUP
    });

    return message;
  }

  async getChatMessages(chatId, userId, { page = 1, limit = 50 }) {
    const chat = await Chat.findById(chatId);

    if (!chat) {
      throw new Error('Chat not found');
    }

    if (!chat.isParticipant(userId)) {
      throw new Error('You are not a participant of this chat');
    }

    const skip = (page - 1) * limit;
    const mongoose = require('mongoose');

    // Use aggregation pipeline for reliable nested population
    const [messagesResult, totalResult] = await Promise.all([
      Message.aggregate([
        {
          $match: {
            chat: new mongoose.Types.ObjectId(chatId),
            deletedAt: null
          }
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        // Populate sender
        {
          $lookup: {
            from: 'users',
            localField: 'sender',
            foreignField: '_id',
            as: 'sender'
          }
        },
        { $unwind: '$sender' },
        // Populate reactions.user
        {
          $lookup: {
            from: 'users',
            localField: 'reactions.user',
            foreignField: '_id',
            as: 'reactionUsers'
          }
        },
        // Populate replyTo
        {
          $lookup: {
            from: 'messages',
            localField: 'replyTo',
            foreignField: '_id',
            as: 'replyToMessage'
          }
        },
        {
          $unwind: {
            path: '$replyToMessage',
            preserveNullAndEmptyArrays: true
          }
        },
        // Populate replyTo.sender
        {
          $lookup: {
            from: 'users',
            localField: 'replyToMessage.sender',
            foreignField: '_id',
            as: 'replyToSender'
          }
        },
        {
          $unwind: {
            path: '$replyToSender',
            preserveNullAndEmptyArrays: true
          }
        },
        // Map reactions with populated users
        {
          $addFields: {
            reactions: {
              $map: {
                input: { $ifNull: ['$reactions', []] },
                as: 'reaction',
                in: {
                  _id: '$$reaction._id',
                  emoji: '$$reaction.emoji',
                  createdAt: '$$reaction.createdAt',
                  user: {
                    $let: {
                      vars: {
                        matchedUser: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: { $ifNull: ['$reactionUsers', []] },
                                as: 'ru',
                                cond: { $eq: ['$$ru._id', '$$reaction.user'] }
                              }
                            },
                            0
                          ]
                        }
                      },
                      in: {
                        $cond: {
                          if: { $ne: ['$$matchedUser', null] },
                          then: {
                            _id: '$$matchedUser._id',
                            name: '$$matchedUser.name',
                            avatar: '$$matchedUser.avatar'
                          },
                          else: null
                        }
                      }
                    }
                  }
                }
              }
            },
            replyTo: {
              $cond: {
                if: { $ne: ['$replyToMessage', null] },
                then: {
                  _id: '$replyToMessage._id',
                  content: '$replyToMessage.content',
                  createdAt: '$replyToMessage.createdAt',
                  sender: {
                    _id: '$replyToSender._id',
                    name: '$replyToSender.name'
                  }
                },
                else: null
              }
            },
            sender: {
              _id: '$sender._id',
              name: '$sender.name',
              email: '$sender.email',
              avatar: '$sender.avatar'
            }
          }
        },
        // Remove temporary fields
        {
          $project: {
            reactionUsers: 0,
            replyToMessage: 0,
            replyToSender: 0
          }
        }
      ]),
      Message.countDocuments({
        chat: chatId,
        deletedAt: null
      })
    ]);

    return {
      messages: messagesResult.reverse(), // Return in ascending order
      pagination: {
        total: totalResult,
        page,
        limit,
        totalPages: Math.ceil(totalResult / limit),
        hasMore: page < Math.ceil(totalResult / limit)
      }
    };
  }

  async markMessagesAsRead(chatId, userId) {
    // PERFORMANCE FIX: Use bulk update instead of N+1 individual saves
    // Old: 50 messages = 50 database calls
    // New: 50 messages = 1 database call
    const result = await Message.updateMany(
      {
        chat: chatId,
        sender: { $ne: userId },
        'readBy.user': { $ne: userId }
      },
      {
        $push: {
          readBy: {
            user: userId,
            readAt: new Date()
          }
        }
      }
    );

    return { marked: result.modifiedCount };
  }

  async addParticipant(chatId, adminId, newUserId) {
    const chat = await Chat.findById(chatId);

    if (!chat) {
      throw new Error('Chat not found');
    }

    // Only group chats can add participants
    if (chat.type !== CHAT_TYPES.GROUP) {
      throw new Error('Can only add participants to group chats');
    }

    // Check if admin has permission
    const adminPermission = chat.getUserPermission(adminId);
    if (adminPermission !== CHAT_PERMISSIONS.ADMIN) {
      throw new Error('Only chat admins can add participants');
    }

    // Add participant
    chat.addParticipant(newUserId);
    await chat.save();

    return chat.populate('participants.user', 'name email');
  }

  async removeParticipant(chatId, adminId, userId) {
    const chat = await Chat.findById(chatId);

    if (!chat) {
      throw new Error('Chat not found');
    }

    // Only group chats can remove participants
    if (chat.type !== CHAT_TYPES.GROUP) {
      throw new Error('Can only remove participants from group chats');
    }

    // Check if admin has permission
    const adminPermission = chat.getUserPermission(adminId);
    if (adminPermission !== CHAT_PERMISSIONS.ADMIN) {
      throw new Error('Only chat admins can remove participants');
    }

    // Remove participant
    chat.removeParticipant(userId);
    await chat.save();

    return chat.populate('participants.user', 'name email');
  }

  async leaveChat(chatId, userId) {
    const chat = await Chat.findById(chatId);

    if (!chat) {
      throw new Error('Chat not found');
    }

    if (!chat.isParticipant(userId)) {
      throw new Error('You are not a participant of this chat');
    }

    // For private chats, you can't leave
    if (chat.type === CHAT_TYPES.PRIVATE) {
      throw new Error('Cannot leave private chats');
    }

    // Remove user from participants
    chat.removeParticipant(userId);

    // If no participants left, delete chat
    if (chat.participants.length === 0) {
      await Chat.findByIdAndDelete(chatId);
      await Message.deleteMany({ chat: chatId });
      return { deleted: true };
    }

    await chat.save();
    return { left: true };
  }

  async archiveChat(chatId, userId) {
    const chat = await Chat.findById(chatId);
    if (!chat) throw new Error('Chat not found');
    if (!chat.isParticipant(userId)) throw new Error('Not a participant');

    if (!chat.archivedBy.includes(userId)) {
      chat.archivedBy.push(userId);
      await chat.save();
    }
    return { archived: true };
  }

  async unarchiveChat(chatId, userId) {
    const chat = await Chat.findById(chatId);
    if (!chat) throw new Error('Chat not found');

    chat.archivedBy = chat.archivedBy.filter(id => id.toString() !== userId.toString());
    await chat.save();
    return { archived: false };
  }

  async deleteChatForUser(chatId, userId) {
    const chat = await Chat.findById(chatId);
    if (!chat) throw new Error('Chat not found');
    if (!chat.isParticipant(userId)) throw new Error('Not a participant');

    if (!chat.deletedBy.includes(userId)) {
      chat.deletedBy.push(userId);
      await chat.save();
    }
    return { deleted: true };
  }

  async blockUser(blockerId, blockedId) {
    const Block = require('../models/Block');

    // Check if already blocked
    const existing = await Block.findOne({ blocker: blockerId, blocked: blockedId });
    if (existing) return existing;

    return await Block.create({ blocker: blockerId, blocked: blockedId });
  }
}

module.exports = new ChatService();
