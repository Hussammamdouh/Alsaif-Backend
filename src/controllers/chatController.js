const chatService = require('../services/chatService');
const { HTTP_STATUS } = require('../constants');

class ChatController {
  async createPrivateChat(req, res, next) {
    try {
      const { userId, initialMessage } = req.body;
      const currentUserId = req.user.id;

      if (!userId) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'User ID is required'
        });
      }

      if (userId === currentUserId) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Cannot create chat with yourself'
        });
      }

      const chat = await chatService.createPrivateChat(currentUserId, userId, initialMessage);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Private chat created successfully',
        data: { chat }
      });
    } catch (error) {
      next(error);
    }
  }

  async createGroupChat(req, res, next) {
    try {
      const { name, participantIds, isPremium } = req.body;
      const currentUserId = req.user.id;

      if (!name) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Group name is required'
        });
      }

      const chat = await chatService.createGroupChat(
        name,
        currentUserId,
        participantIds || [],
        isPremium || false
      );

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Group chat created successfully',
        data: { chat }
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyChats(req, res, next) {
    try {
      const userId = req.user.id;
      const { page, limit } = req.query;

      const result = await chatService.getUserChats(userId, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async getChatDetails(req, res, next) {
    try {
      const { chatId } = req.params;
      const userId = req.user.id;

      const chat = await chatService.getChatById(chatId, userId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: { chat }
      });
    } catch (error) {
      next(error);
    }
  }

  async getChatMessages(req, res, next) {
    try {
      const { chatId } = req.params;
      const userId = req.user.id;
      const { page, limit } = req.query;

      const result = await chatService.getChatMessages(chatId, userId, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async addParticipant(req, res, next) {
    try {
      const { chatId } = req.params;
      const { userId: newUserId } = req.body;
      const adminId = req.user.id;

      if (!newUserId) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'User ID is required'
        });
      }

      const chat = await chatService.addParticipant(chatId, adminId, newUserId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Participant added successfully',
        data: { chat }
      });
    } catch (error) {
      next(error);
    }
  }

  async removeParticipant(req, res, next) {
    try {
      const { chatId, userId } = req.params;
      const adminId = req.user.id;

      const chat = await chatService.removeParticipant(chatId, adminId, userId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Participant removed successfully',
        data: { chat }
      });
    } catch (error) {
      next(error);
    }
  }

  async leaveChat(req, res, next) {
    try {
      const { chatId } = req.params;
      const userId = req.user.id;

      const result = await chatService.leaveChat(chatId, userId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Left chat successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async archiveChat(req, res, next) {
    try {
      const { chatId } = req.params;
      const userId = req.user.id;
      const result = await chatService.archiveChat(chatId, userId);
      res.status(HTTP_STATUS.OK).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async unarchiveChat(req, res, next) {
    try {
      const { chatId } = req.params;
      const userId = req.user.id;
      const result = await chatService.unarchiveChat(chatId, userId);
      res.status(HTTP_STATUS.OK).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async deleteChat(req, res, next) {
    try {
      const { chatId } = req.params;
      const userId = req.user.id;
      const result = await chatService.deleteChatForUser(chatId, userId);
      res.status(HTTP_STATUS.OK).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async blockUser(req, res, next) {
    try {
      const { userId: blockedId } = req.body;
      const blockerId = req.user.id;
      const result = await chatService.blockUser(blockerId, blockedId);
      res.status(HTTP_STATUS.OK).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ChatController();
