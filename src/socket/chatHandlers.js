const chatService = require('../services/chatService');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const logger = require('../utils/logger');
const { SOCKET_EVENTS, MESSAGE_STATUS } = require('../constants');
const { rateLimitedHandler } = require('../middleware/socketRateLimit');

const chatHandlers = (io, socket) => {
  const userId = socket.user.id;

  // Join a chat room
  socket.on(SOCKET_EVENTS.JOIN_CHAT, async (data) => {
    try {
      const { chatId } = data;

      // Verify user can access this chat
      const chat = await Chat.findById(chatId);

      if (!chat) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Chat not found' });
        return;
      }

      if (!chat.isParticipant(userId)) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          message: 'You are not a participant of this chat'
        });
        return;
      }

      // Join the room
      socket.join(`chat:${chatId}`);

      logger.info(`User ${userId} joined chat ${chatId}`);

      // Notify user
      socket.emit('joined_chat', {
        chatId,
        chat: await chat.populate('participants.user', 'name email')
      });
    } catch (error) {
      logger.error('Error joining chat:', error);
      socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
    }
  });

  // Leave a chat room
  socket.on(SOCKET_EVENTS.LEAVE_CHAT, async (data) => {
    try {
      const { chatId } = data;

      socket.leave(`chat:${chatId}`);

      logger.info(`User ${userId} left chat ${chatId}`);

      socket.emit('left_chat', { chatId });
    } catch (error) {
      logger.error('Error leaving chat:', error);
      socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
    }
  });

  // Send message - SECURITY: Rate limited to prevent spam
  socket.on(SOCKET_EVENTS.SEND_MESSAGE, rateLimitedHandler(async function (data) {
    try {
      const { chatId, content, replyTo, type = 'text', fileData = null } = data;

      // SECURITY FIX (HIGH-005): Validate message content length
      if ((!content || !content.trim()) && type === 'text') {
        this.emit(SOCKET_EVENTS.ERROR, { message: 'Message content is required for text messages' });
        return;
      }

      // Enforce maximum message length (10KB per message)
      if (content && content.length > 10000) {
        this.emit(SOCKET_EVENTS.ERROR, {
          message: 'Message too long. Maximum 10,000 characters allowed.',
          code: 'MESSAGE_TOO_LONG'
        });
        return;
      }

      // Send message via service (includes XSS sanitization)
      const message = await chatService.sendMessage(chatId, userId, content?.trim(), {
        replyTo,
        type,
        fileData
      });

      // Emit to all participants in the chat room
      const messageData = {
        _id: message._id,
        content: message.content,
        sender: message.sender,
        status: message.status,
        type: message.type,
        file: message.file,
        createdAt: message.createdAt
      };

      // Include replyTo if exists
      if (message.replyTo) {
        messageData.replyTo = {
          _id: message.replyTo._id,
          content: message.replyTo.content,
          sender: message.replyTo.sender,
          createdAt: message.replyTo.createdAt
        };
      }

      io.to(`chat:${chatId}`).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, {
        chatId,
        message: messageData
      });

      // Get updated chat with populated fields for chat list update
      const chat = await Chat.findById(chatId)
        .populate('participants.user', 'name email avatar')
        .populate('lastMessage.sender', 'name email');

      // Emit chat list update to all participants
      chat.participants.forEach(participant => {
        io.to(`user:${participant.user._id}`).emit(SOCKET_EVENTS.CHAT_LIST_UPDATED, {
          chat: chat.toObject()
        });
      });

      logger.info(`Message sent in chat ${chatId} by user ${userId}`);
    } catch (error) {
      logger.error('Error sending message:', error);
      this.emit(SOCKET_EVENTS.ERROR, { message: error.message });
    }
  }, {
    maxEvents: 20,  // 20 messages per minute
    windowMs: 60 * 1000,
    errorMessage: 'Too many messages. Please slow down.'
  }));

  // Mark messages as read
  socket.on('mark_messages_read', async (data) => {
    try {
      const { chatId } = data;

      await chatService.markMessagesAsRead(chatId, userId);

      // Notify sender that messages were read
      socket.to(`chat:${chatId}`).emit('messages_read', {
        chatId,
        userId
      });

      logger.info(`User ${userId} marked messages as read in chat ${chatId}`);
    } catch (error) {
      logger.error('Error marking messages as read:', error);
      socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
    }
  });

  // Typing indicators
  // SECURITY FIX (HIGH): Verify chat membership before broadcasting typing status
  socket.on(SOCKET_EVENTS.TYPING_START, async (data) => {
    try {
      const { chatId } = data;

      // Verify user is participant before broadcasting
      const chat = await Chat.findById(chatId);
      if (!chat || !chat.isParticipant(userId)) {
        return; // Silently ignore unauthorized typing indicators
      }

      socket.to(`chat:${chatId}`).emit('user_typing', {
        chatId,
        userId,
        userName: socket.user.name
      });
    } catch (error) {
      // Silently fail for typing indicators to avoid breaking UX
      logger.error('Error handling typing indicator:', { error: error.message, userId, chatId: data?.chatId });
    }
  });

  socket.on(SOCKET_EVENTS.TYPING_STOP, async (data) => {
    try {
      const { chatId } = data;

      // Verify user is participant before broadcasting
      const chat = await Chat.findById(chatId);
      if (!chat || !chat.isParticipant(userId)) {
        return; // Silently ignore unauthorized typing indicators
      }

      socket.to(`chat:${chatId}`).emit('user_stopped_typing', {
        chatId,
        userId
      });
    } catch (error) {
      logger.error('Error handling typing stop:', { error: error.message, userId, chatId: data?.chatId });
    }
  });

  // Get online status
  socket.on('get_online_users', async (data) => {
    try {
      const { chatId } = data;

      const chat = await Chat.findById(chatId);

      if (!chat || !chat.isParticipant(userId)) {
        return;
      }

      // Get all connected sockets
      const onlineUsers = [];
      const sockets = await io.in(`chat:${chatId}`).fetchSockets();

      sockets.forEach((s) => {
        if (s.userId !== userId) {
          onlineUsers.push(s.userId);
        }
      });

      socket.emit('online_users', {
        chatId,
        onlineUsers: [...new Set(onlineUsers)]
      });
    } catch (error) {
      logger.error('Error getting online users:', error);
    }
  });
};

module.exports = chatHandlers;
