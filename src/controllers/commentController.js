/**
 * Comment Controller
 * Handles comment-related operations for insights
 */

const Comment = require('../models/Comment');
const Insight = require('../models/Insight');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../constants');
const logger = require('../utils/logger');

class CommentController {
  /**
   * Get comments for an insight
   * GET /api/comments/insights/:insightId/comments
   * Public endpoint
   */
  async getCommentsForInsight(req, res, next) {
    try {
      const { insightId } = req.params;
      const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = -1 } = req.query;

      // Check if insight exists
      const insight = await Insight.findById(insightId);
      if (!insight) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.RESOURCE_NOT_FOUND,
        });
      }

      const result = await Comment.getForInsight(insightId, {
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder: parseInt(sortOrder),
        includeReplies: false,
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('[CommentController] Get comments for insight error:', error);
      next(error);
    }
  }

  /**
   * Get replies for a comment
   * GET /api/comments/:commentId/replies
   * Public endpoint
   */
  async getRepliesForComment(req, res, next) {
    try {
      const { commentId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      // Check if comment exists
      const comment = await Comment.findById(commentId);
      if (!comment) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.RESOURCE_NOT_FOUND,
        });
      }

      const result = await Comment.getReplies(commentId, {
        page: parseInt(page),
        limit: parseInt(limit),
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('[CommentController] Get replies error:', error);
      next(error);
    }
  }

  /**
   * Create a comment on an insight
   * POST /api/comments/insights/:insightId/comments
   * Requires authentication
   */
  async createComment(req, res, next) {
    try {
      const { insightId } = req.params;
      const { content } = req.body;
      const userId = req.user.id;

      // Check if insight exists
      const insight = await Insight.findById(insightId);
      if (!insight) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.RESOURCE_NOT_FOUND,
        });
      }

      // Create comment
      const comment = await Comment.create({
        insightId,
        author: userId,
        content,
        level: 0,
        parentComment: null,
      });

      // Populate author details
      await comment.populate('author', 'name email avatar');

      // Increment insight comment count
      insight.commentsCount = (insight.commentsCount || 0) + 1;
      await insight.save();

      logger.info(`[CommentController] User ${userId} created comment on insight ${insightId}`);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        data: { comment },
      });
    } catch (error) {
      logger.error('[CommentController] Create comment error:', error);
      next(error);
    }
  }

  /**
   * Reply to a comment
   * POST /api/comments/:commentId/reply
   * Requires authentication
   */
  async replyToComment(req, res, next) {
    try {
      const { commentId } = req.params;
      const { content } = req.body;
      const userId = req.user.id;

      // Check if parent comment exists
      const parentComment = await Comment.findById(commentId);
      if (!parentComment) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.RESOURCE_NOT_FOUND,
        });
      }

      // Check nesting level
      if (parentComment.level >= 3) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Maximum nesting level reached',
        });
      }

      // Create reply
      const reply = await Comment.create({
        insightId: parentComment.insightId,
        author: userId,
        content,
        level: parentComment.level + 1,
        parentComment: commentId,
      });

      // Populate author details
      await reply.populate('author', 'name email avatar');

      // Increment insight comment count
      await Insight.findByIdAndUpdate(parentComment.insightId, {
        $inc: { commentsCount: 1 }
      });

      logger.info(`[CommentController] User ${userId} replied to comment ${commentId}`);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        data: { comment: reply },
      });
    } catch (error) {
      logger.error('[CommentController] Reply to comment error:', error);
      next(error);
    }
  }

  /**
   * Update a comment
   * PATCH /api/comments/:commentId
   * Requires authentication (own comment)
   */
  async updateComment(req, res, next) {
    try {
      const { commentId } = req.params;
      const { content } = req.body;
      const userId = req.user.id;

      // Find comment
      const comment = await Comment.findById(commentId);
      if (!comment) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.RESOURCE_NOT_FOUND,
        });
      }

      // Check if user owns the comment
      if (comment.author.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.FORBIDDEN,
        });
      }

      // Check if comment is deleted
      if (comment.isDeleted) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Cannot edit deleted comment',
        });
      }

      // Update comment
      await comment.edit(content);

      logger.info(`[CommentController] User ${userId} updated comment ${commentId}`);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: { comment },
      });
    } catch (error) {
      logger.error('[CommentController] Update comment error:', error);
      next(error);
    }
  }

  /**
   * Delete a comment
   * DELETE /api/comments/:commentId
   * Requires authentication (own comment or admin)
   */
  async deleteComment(req, res, next) {
    try {
      const { commentId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;

      // Find comment
      const comment = await Comment.findById(commentId);
      if (!comment) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.RESOURCE_NOT_FOUND,
        });
      }

      // Check if user owns the comment or is admin
      const isOwner = comment.author.toString() === userId;
      const isAdmin = ['admin', 'superadmin'].includes(userRole);

      if (!isOwner && !isAdmin) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.FORBIDDEN,
        });
      }

      // Soft delete comment
      await comment.softDelete();

      // Decrement insight comment count
      const insight = await Insight.findById(comment.insightId);
      if (insight) {
        insight.commentsCount = Math.max(0, (insight.commentsCount || 0) - 1);
        await insight.save();
      }

      logger.info(`[CommentController] User ${userId} deleted comment ${commentId}`);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Comment deleted successfully',
      });
    } catch (error) {
      logger.error('[CommentController] Delete comment error:', error);
      next(error);
    }
  }

  /**
   * Like/unlike a comment
   * POST /api/comments/:commentId/like
   * Requires authentication
   */
  async likeComment(req, res, next) {
    try {
      const { commentId } = req.params;
      const userId = req.user.id;

      // Find comment
      const comment = await Comment.findById(commentId);
      if (!comment) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.RESOURCE_NOT_FOUND,
        });
      }

      // Toggle like
      const hasLiked = comment.likedBy.some((id) => id.toString() === userId);

      if (hasLiked) {
        await comment.removeLike(userId);
        logger.info(`[CommentController] User ${userId} unliked comment ${commentId}`);
      } else {
        await comment.addLike(userId);
        logger.info(`[CommentController] User ${userId} liked comment ${commentId}`);
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          liked: !hasLiked,
          likes: comment.likes,
        },
      });
    } catch (error) {
      logger.error('[CommentController] Like comment error:', error);
      next(error);
    }
  }

  /**
   * Flag a comment for moderation
   * POST /api/comments/:commentId/flag
   * Requires authentication
   */
  async flagComment(req, res, next) {
    try {
      const { commentId } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      // Find comment
      const comment = await Comment.findById(commentId);
      if (!comment) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.RESOURCE_NOT_FOUND,
        });
      }

      // Check if user already flagged this comment
      const alreadyFlagged = comment.flaggedBy.some(
        (f) => f.userId.toString() === userId
      );

      if (alreadyFlagged) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'You have already flagged this comment',
        });
      }

      // Flag comment
      await comment.flag(userId, reason);

      logger.info(`[CommentController] User ${userId} flagged comment ${commentId}`);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Comment flagged for moderation',
      });
    } catch (error) {
      logger.error('[CommentController] Flag comment error:', error);
      next(error);
    }
  }

  /**
   * Get flagged comments (admin only)
   * GET /api/comments/admin/flagged
   * Requires admin authentication
   */
  async getFlaggedComments(req, res, next) {
    try {
      const { page = 1, limit = 50 } = req.query;

      const result = await Comment.getFlagged({
        page: parseInt(page),
        limit: parseInt(limit),
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('[CommentController] Get flagged comments error:', error);
      next(error);
    }
  }

  /**
   * Moderate a comment (admin only)
   * POST /api/comments/admin/:commentId/moderate
   * Requires admin authentication
   */
  async moderateComment(req, res, next) {
    try {
      const { commentId } = req.params;
      const { action, reason } = req.body;
      const userId = req.user.id;

      // Find comment
      const comment = await Comment.findById(commentId);
      if (!comment) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.RESOURCE_NOT_FOUND,
        });
      }

      // Perform moderation action
      switch (action) {
        case 'approve':
          comment.isApproved = true;
          comment.isFlagged = false;
          comment.moderatedBy = userId;
          comment.moderatedAt = new Date();
          break;

        case 'delete':
          await comment.softDelete();
          comment.moderatedBy = userId;
          comment.moderatedAt = new Date();

          // Decrement insight comment count
          const insight = await Insight.findById(comment.insightId);
          if (insight) {
            insight.commentsCount = Math.max(0, (insight.commentsCount || 0) - 1);
            await insight.save();
          }
          break;

        case 'unflag':
          comment.isFlagged = false;
          comment.moderatedBy = userId;
          comment.moderatedAt = new Date();
          break;

        default:
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Invalid moderation action',
          });
      }

      await comment.save();

      logger.info(`[CommentController] Admin ${userId} moderated comment ${commentId} with action: ${action}`);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: `Comment ${action}d successfully`,
        data: { comment },
      });
    } catch (error) {
      logger.error('[CommentController] Moderate comment error:', error);
      next(error);
    }
  }
}

module.exports = new CommentController();
