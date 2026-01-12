/**
 * Social Controller
 *
 * Handles social features (comments, likes, saves, follows)
 */

const Comment = require('../models/Comment');
const Like = require('../models/Like');
const Save = require('../models/Save');
const Follow = require('../models/Follow');
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

// ========== LIKES ==========

/**
 * Toggle like on an insight
 * POST /api/social/likes/:insightId
 */
exports.toggleLike = async (req, res) => {
  try {
    const { insightId } = req.params;
    const userId = req.user.id;

    const result = await Like.toggleLike(userId, insightId);

    // Record analytics if liked
    if (result.liked) {
      analyticsService.recordEngagement('like', insightId, userId).catch(logger.error);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('[SocialController] Toggle like failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to toggle like',
      error: error.message
    });
  }
};

/**
 * Get user's liked insights
 * GET /api/social/likes
 */
exports.getUserLikes = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const result = await Like.getUserLikes(userId, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('[SocialController] Get user likes failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve liked insights',
      error: error.message
    });
  }
};

// ========== SAVES ==========

/**
 * Toggle save on an insight
 * POST /api/social/saves/:insightId
 */
exports.toggleSave = async (req, res) => {
  try {
    const { insightId } = req.params;
    const userId = req.user.id;
    const { note, tags } = req.body;

    const result = await Save.toggleSave(userId, insightId, { note, tags });

    // Record analytics if saved
    if (result.saved) {
      analyticsService.recordEngagement('save', insightId, userId).catch(logger.error);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('[SocialController] Toggle save failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to toggle save',
      error: error.message
    });
  }
};

/**
 * Get user's saved insights
 * GET /api/social/saves
 */
exports.getUserSaves = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, tags } = req.query;

    const result = await Save.getUserSaves(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      tags: tags ? tags.split(',') : undefined
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('[SocialController] Get user saves failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve saved insights',
      error: error.message
    });
  }
};

/**
 * Update save note/tags
 * PUT /api/social/saves/:insightId
 */
exports.updateSave = async (req, res) => {
  try {
    const { insightId } = req.params;
    const userId = req.user.id;
    const { note, tags } = req.body;

    const save = await Save.updateSave(userId, insightId, { note, tags });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: save
    });
  } catch (error) {
    logger.error('[SocialController] Update save failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to update save',
      error: error.message
    });
  }
};

// ========== FOLLOWS ==========

/**
 * Follow a user
 * POST /api/social/follow/:userId
 */
exports.followUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const followerId = req.user.id;

    const follow = await Follow.createFollow(followerId, userId);

    // Send notification email (non-blocking)
    const User = require('../models/User');
    const [follower, following] = await Promise.all([
      User.findById(followerId).select('name email'),
      User.findById(userId).select('name email')
    ]);

    if (follower && following) {
      emailService.sendFollowNotification(following, follower).catch(logger.error);
    }

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: follow
    });
  } catch (error) {
    logger.error('[SocialController] Follow user failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to follow user',
      error: error.message
    });
  }
};

/**
 * Unfollow a user
 * DELETE /api/social/follow/:userId
 */
exports.unfollowUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const followerId = req.user.id;

    await Follow.removeFollow(followerId, userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Unfollowed successfully'
    });
  } catch (error) {
    logger.error('[SocialController] Unfollow user failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to unfollow user',
      error: error.message
    });
  }
};

/**
 * Get user's followers
 * GET /api/social/followers/:userId
 */
exports.getFollowers = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const result = await Follow.getFollowers(userId, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('[SocialController] Get followers failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve followers',
      error: error.message
    });
  }
};

/**
 * Get users that a user is following
 * GET /api/social/following/:userId
 */
exports.getFollowing = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const result = await Follow.getFollowing(userId, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('[SocialController] Get following failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve following list',
      error: error.message
    });
  }
};
