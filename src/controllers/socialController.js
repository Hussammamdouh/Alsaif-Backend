/**
 * Social Controller
 *
 * Handles social features (comments, likes, saves, follows)
 */

const Comment = require('../models/Comment');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');
const analyticsService = require('../services/analyticsService');
const emailService = require('../services/emailService');
const moderationService = require('../services/moderationService');

// ========== COMMENTS ==========

/**
 * Create a comment on an insight
 * POST /api/social/comments
 */
exports.createComment = async (req, res) => {
  try {
    const { insightId, content, parentComment } = req.body;
    const userId = req.user.id;

    // Validate content
    if (!content || content.trim().length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Comment content is required'
      });
    }

    // Moderate content
    const moderation = moderationService.moderateContent(content.trim());
    const isApproved = moderation.approved;

    // Determine nesting level
    let level = 0;
    if (parentComment) {
      const parent = await Comment.findById(parentComment);
      if (!parent) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'Parent comment not found'
        });
      }
      level = parent.level + 1;

      if (level > 3) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Maximum nesting level reached'
        });
      }
    }

    // Create comment
    const comment = await Comment.create({
      insightId,
      author: userId,
      content: content.trim(),
      parentComment: parentComment || null,
      level,
      isApproved
    });

    await comment.populate('author', 'name email');

    // Record analytics
    analyticsService.recordEngagement('comment', insightId, userId).catch(logger.error);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: comment
    });
  } catch (error) {
    logger.error('[SocialController] Create comment failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to create comment',
      error: error.message
    });
  }
};

/**
 * Get comments for an insight
 * GET /api/social/comments/:insightId
 */
exports.getComments = async (req, res) => {
  try {
    const { insightId } = req.params;
    const { page = 1, limit = 20, sortBy = 'createdAt' } = req.query;

    const result = await Comment.getForInsight(insightId, {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      includeReplies: false
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('[SocialController] Get comments failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve comments',
      error: error.message
    });
  }
};

/**
 * Get replies to a comment
 * GET /api/social/comments/:commentId/replies
 */
exports.getReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const result = await Comment.getReplies(commentId, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('[SocialController] Get replies failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve replies',
      error: error.message
    });
  }
};

/**
 * Edit a comment
 * PUT /api/social/comments/:commentId
 */
exports.editComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    const comment = await Comment.findById(commentId);

    if (!comment) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Comment not found'
      });
    }

    // Check ownership
    if (comment.author.toString() !== userId) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'You can only edit your own comments'
      });
    }

    await comment.edit(content);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: comment
    });
  } catch (error) {
    logger.error('[SocialController] Edit comment failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to edit comment',
      error: error.message
    });
  }
};

/**
 * Delete a comment
 * DELETE /api/social/comments/:commentId
 */
exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const comment = await Comment.findById(commentId);

    if (!comment) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Comment not found'
      });
    }

    // Check ownership or admin
    if (comment.author.toString() !== userId && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'You can only delete your own comments'
      });
    }

    await comment.softDelete();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    logger.error('[SocialController] Delete comment failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to delete comment',
      error: error.message
    });
  }
};

/**
 * Like a comment
 * POST /api/social/comments/:commentId/like
 */
exports.likeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const comment = await Comment.findById(commentId);

    if (!comment) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Comment not found'
      });
    }

    await comment.addLike(userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { likes: comment.likes }
    });
  } catch (error) {
    logger.error('[SocialController] Like comment failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to like comment',
      error: error.message
    });
  }
};

/**
 * Unlike a comment
 * DELETE /api/social/comments/:commentId/like
 */
exports.unlikeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const comment = await Comment.findById(commentId);

    if (!comment) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Comment not found'
      });
    }

    await comment.removeLike(userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { likes: comment.likes }
    });
  } catch (error) {
    logger.error('[SocialController] Unlike comment failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to unlike comment',
      error: error.message
    });
  }
};

