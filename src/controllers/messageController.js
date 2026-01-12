const Message = require('../models/Message');
const Chat = require('../models/Chat');

/**
 * Edit Message
 * PUT /api/messages/:messageId
 */
exports.editMessage = async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // Find message and populate sender
    const message = await Message.findById(messageId).populate('sender', 'name avatar email').populate({ path: 'replyTo', populate: { path: 'sender', select: 'name' } });
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    // Check if user is the sender
    const sender = message.sender;
    const senderId = sender?._id || sender;

    if (!senderId || senderId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own messages',
      });
    }

    // Check if message is already deleted
    if (message.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit deleted message',
      });
    }

    // Update message
    message.content = content;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    // Re-populate for response consistency
    await message.populate([
      { path: 'sender', select: 'name avatar email' },
      {
        path: 'replyTo',
        populate: { path: 'sender', select: 'name' }
      }
    ]);

    // Emit socket event
    if (message.chat) {
      io.to(`chat_${message.chat.toString()}`).emit('MESSAGE_UPDATED', {
        chatId: message.chat,
        message: message.toObject(),
      });
    }

    res.json({
      success: true,
      message: 'Message updated successfully',
      data: {
        message: message.toObject(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Message
 * DELETE /api/messages/:messageId
 */
exports.deleteMessage = async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const { messageId } = req.params;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // Find message and populate sender
    const message = await Message.findById(messageId).populate('sender', 'name avatar email');
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    // Check permissions - user must be sender or admin
    const chat = await Chat.findById(message.chat);
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    const participant = chat.participants.find(
      (p) => (p.user._id || p.user).toString() === userId.toString()
    );

    const sender = message.sender;
    const senderId = sender?._id || sender;
    const isSender = senderId && senderId.toString() === userId.toString();
    const isAdmin = participant && ['admin', 'owner'].includes(participant.permission);

    if (!isSender && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this message',
      });
    }

    // Mark as deleted (soft delete)
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.deletedBy = userId;
    await message.save();

    // Emit socket event
    if (message.chat) {
      io.to(`chat_${message.chat.toString()}`).emit('MESSAGE_DELETED', {
        chatId: message.chat,
        messageId: message._id,
        message: message.toObject(),
      });
    }

    res.json({
      success: true,
      message: 'Message deleted successfully',
      data: {
        message: message.toObject(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add Reaction
 * POST /api/messages/:messageId/reactions
 */
exports.addReaction = async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user?._id || req.user?.id;
    const mongoose = require('mongoose');

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: 'Emoji is required',
      });
    }

    // Find message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    // Check if user already reacted with this exact emoji
    const alreadyReactedWithSame = message.reactions.some(
      (r) => r.emoji === emoji && r.user.toString() === userId.toString()
    );

    if (alreadyReactedWithSame) {
      return res.status(400).json({
        success: false,
        message: 'You already reacted with this emoji',
      });
    }

    // Remove any existing reaction from this user (one reaction per user per message)
    // Then add the new reaction - use atomic operations
    await Message.updateOne(
      { _id: messageId },
      {
        $pull: {
          reactions: {
            user: userId,
          },
        },
      }
    );

    // Add the new reaction
    await Message.updateOne(
      { _id: messageId },
      {
        $push: {
          reactions: {
            emoji,
            user: userId,
          },
        },
      }
    );

    // Fetch updated message with populated reactions using aggregation
    const [updatedMessage] = await Message.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(messageId) } },
      {
        $lookup: {
          from: 'users',
          localField: 'sender',
          foreignField: '_id',
          as: 'sender',
        },
      },
      { $unwind: '$sender' },
      {
        $lookup: {
          from: 'users',
          localField: 'reactions.user',
          foreignField: '_id',
          as: 'reactionUsers',
        },
      },
      {
        $addFields: {
          reactions: {
            $map: {
              input: '$reactions',
              as: 'reaction',
              in: {
                _id: '$$reaction._id',
                emoji: '$$reaction.emoji',
                createdAt: '$$reaction.createdAt',
                user: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$reactionUsers',
                        as: 'ru',
                        cond: { $eq: ['$$ru._id', '$$reaction.user'] },
                      },
                    },
                    0,
                  ],
                },
              },
            },
          },
          sender: {
            _id: '$sender._id',
            name: '$sender.name',
            email: '$sender.email',
            avatar: '$sender.avatar',
          },
        },
      },
      { $project: { reactionUsers: 0 } },
    ]);

    // Emit socket event
    if (message.chat) {
      io.to(`chat_${message.chat.toString()}`).emit('REACTION_ADDED', {
        chatId: message.chat,
        messageId: message._id,
        message: updatedMessage,
      });
    }

    res.json({
      success: true,
      message: 'Reaction added successfully',
      data: {
        message: updatedMessage,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove Reaction
 * DELETE /api/messages/:messageId/reactions/:emoji
 */
exports.removeReaction = async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const { messageId, emoji } = req.params;
    const userId = req.user._id;
    const mongoose = require('mongoose');

    // Find message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    // Check if reaction exists
    const hasReaction = message.reactions.some(
      (r) => r.emoji === emoji && r.user.toString() === userId.toString()
    );

    if (!hasReaction) {
      return res.status(404).json({
        success: false,
        message: 'Reaction not found',
      });
    }

    // Remove reaction using atomic operation
    await Message.updateOne(
      { _id: messageId },
      {
        $pull: {
          reactions: {
            emoji: emoji,
            user: userId,
          },
        },
      }
    );

    // Fetch updated message with populated reactions using aggregation
    const [updatedMessage] = await Message.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(messageId) } },
      {
        $lookup: {
          from: 'users',
          localField: 'sender',
          foreignField: '_id',
          as: 'sender',
        },
      },
      { $unwind: '$sender' },
      {
        $lookup: {
          from: 'users',
          localField: 'reactions.user',
          foreignField: '_id',
          as: 'reactionUsers',
        },
      },
      {
        $addFields: {
          reactions: {
            $map: {
              input: '$reactions',
              as: 'reaction',
              in: {
                _id: '$$reaction._id',
                emoji: '$$reaction.emoji',
                createdAt: '$$reaction.createdAt',
                user: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$reactionUsers',
                        as: 'ru',
                        cond: { $eq: ['$$ru._id', '$$reaction.user'] },
                      },
                    },
                    0,
                  ],
                },
              },
            },
          },
          sender: {
            _id: '$sender._id',
            name: '$sender.name',
            email: '$sender.email',
            avatar: '$sender.avatar',
          },
        },
      },
      { $project: { reactionUsers: 0 } },
    ]);

    // Emit socket event
    io.to(`chat_${message.chat.toString()}`).emit('REACTION_REMOVED', {
      chatId: message.chat,
      messageId: message._id,
      message: updatedMessage,
    });

    res.json({
      success: true,
      message: 'Reaction removed successfully',
      data: {
        message: updatedMessage,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Pin/Unpin Message
 * POST /api/messages/:messageId/pin
 */
exports.pinMessage = async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const { messageId } = req.params;
    const { isPinned } = req.body;
    const userId = req.user._id;

    // Find message and populate
    const message = await Message.findById(messageId).populate('sender', 'name avatar email');
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    // Check if user has permission (admin or owner)
    const chat = await Chat.findById(message.chat);
    const participant = chat.participants.find(
      (p) => p.user.toString() === userId.toString()
    );

    if (!participant || !['owner', 'admin'].includes(participant.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only chat admins can pin messages',
      });
    }

    // Update pin status
    message.isPinned = isPinned;
    message.pinnedAt = isPinned ? new Date() : null;
    message.pinnedBy = isPinned ? userId : null;
    await message.save();

    // Emit socket event
    io.to(`chat_${message.chat.toString()}`).emit('MESSAGE_PINNED', {
      chatId: message.chat,
      messageId: message._id,
      isPinned,
      message: message.toObject(),
    });

    res.json({
      success: true,
      message: isPinned ? 'Message pinned successfully' : 'Message unpinned successfully',
      data: {
        message: message.toObject(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Forward Message
 * POST /api/messages/:messageId/forward
 */
exports.forwardMessage = async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const { messageId } = req.params;
    const { targetChatIds } = req.body;
    const userId = req.user._id;

    if (!Array.isArray(targetChatIds) || targetChatIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Target chat IDs are required',
      });
    }

    // Find original message
    const originalMessage = await Message.findById(messageId);
    if (!originalMessage) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    // Check if message is deleted
    if (originalMessage.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Cannot forward deleted message',
      });
    }

    const forwardedMessages = [];

    // Forward to each target chat
    for (const chatId of targetChatIds) {
      // Check if user is participant
      const chat = await Chat.findById(chatId);
      if (!chat) continue;

      const isParticipant = chat.participants.some(
        (p) => p.user.toString() === userId.toString()
      );
      if (!isParticipant) continue;

      // Create forwarded message
      const newMessage = new Message({
        chat: chatId,
        sender: userId,
        content: originalMessage.content,
        type: originalMessage.type,
        file: originalMessage.file,
        metadata: {
          ...originalMessage.metadata,
          forwardedFrom: originalMessage._id,
        },
        createdAt: new Date(),
      });

      await newMessage.save();
      await newMessage.populate('sender', 'name avatar role');

      // Update chat's last message
      chat.lastMessage = newMessage._id;
      chat.lastActivity = new Date();
      await chat.save();

      forwardedMessages.push(newMessage);

      // Emit socket event
      io.to(`chat_${chatId}`).emit('MESSAGE_RECEIVED', {
        chatId,
        message: newMessage.toObject(),
      });
    }

    res.json({
      success: true,
      message: `Message forwarded to ${forwardedMessages.length} chat(s)`,
      data: {
        forwardedMessages: forwardedMessages.map((m) => m.toObject()),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Search Messages
 * GET /api/messages/search?chatId=xxx&query=xxx
 */
exports.searchMessages = async (req, res, next) => {
  try {
    const { chatId, query } = req.query;
    const userId = req.user._id;

    if (!chatId || !query) {
      return res.status(400).json({
        success: false,
        message: 'Chat ID and search query are required',
      });
    }

    // Check if user is participant
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    const isParticipant = chat.participants.some(
      (p) => p.user.toString() === userId.toString()
    );
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant of this chat',
      });
    }

    // Search messages
    const messages = await Message.find({
      chat: chatId,
      content: { $regex: query, $options: 'i' },
      isDeleted: false,
    })
      .populate('sender', 'name avatar role')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      message: 'Messages found',
      data: {
        messages: messages.map((m) => m.toObject()),
        count: messages.length,
      },
    });
  } catch (error) {
    next(error);
  }
};
