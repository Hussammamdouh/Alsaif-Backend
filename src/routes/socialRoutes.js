/**
 * Social Routes
 *
 * Endpoints for social features (comments, likes, saves, follows)
 */

const express = require('express');
const router = express.Router();
const socialController = require('../controllers/socialController');
const { authenticateToken } = require('../middleware/authMiddleware');

// ========== COMMENT ROUTES ==========

/**
 * @route   POST /api/social/comments
 * @desc    Create a comment on an insight
 * @access  Private
 */
router.post('/comments', authenticateToken, socialController.createComment);

/**
 * @route   GET /api/social/comments/:insightId
 * @desc    Get comments for an insight
 * @access  Public
 */
router.get('/comments/:insightId', socialController.getComments);

/**
 * @route   GET /api/social/comments/:commentId/replies
 * @desc    Get replies to a comment
 * @access  Public
 */
router.get('/comments/:commentId/replies', socialController.getReplies);

/**
 * @route   PUT /api/social/comments/:commentId
 * @desc    Edit a comment
 * @access  Private (author only)
 */
router.put('/comments/:commentId', authenticateToken, socialController.editComment);

/**
 * @route   DELETE /api/social/comments/:commentId
 * @desc    Delete a comment
 * @access  Private (author or admin)
 */
router.delete('/comments/:commentId', authenticateToken, socialController.deleteComment);

/**
 * @route   POST /api/social/comments/:commentId/like
 * @desc    Like a comment
 * @access  Private
 */
router.post('/comments/:commentId/like', authenticateToken, socialController.likeComment);

/**
 * @route   DELETE /api/social/comments/:commentId/like
 * @desc    Unlike a comment
 * @access  Private
 */
router.delete('/comments/:commentId/like', authenticateToken, socialController.unlikeComment);

// ========== LIKE ROUTES ==========

/**
 * @route   POST /api/social/likes/:insightId
 * @desc    Toggle like on an insight
 * @access  Private
 */
router.post('/likes/:insightId', authenticateToken, socialController.toggleLike);

/**
 * @route   GET /api/social/likes
 * @desc    Get user's liked insights
 * @access  Private
 */
router.get('/likes', authenticateToken, socialController.getUserLikes);

// ========== SAVE ROUTES ==========

/**
 * @route   POST /api/social/saves/:insightId
 * @desc    Toggle save/bookmark on an insight
 * @access  Private
 */
router.post('/saves/:insightId', authenticateToken, socialController.toggleSave);

/**
 * @route   GET /api/social/saves
 * @desc    Get user's saved insights
 * @access  Private
 */
router.get('/saves', authenticateToken, socialController.getUserSaves);

/**
 * @route   PUT /api/social/saves/:insightId
 * @desc    Update save note/tags
 * @access  Private
 */
router.put('/saves/:insightId', authenticateToken, socialController.updateSave);

// ========== FOLLOW ROUTES ==========

/**
 * @route   POST /api/social/follow/:userId
 * @desc    Follow a user
 * @access  Private
 */
router.post('/follow/:userId', authenticateToken, socialController.followUser);

/**
 * @route   DELETE /api/social/follow/:userId
 * @desc    Unfollow a user
 * @access  Private
 */
router.delete('/follow/:userId', authenticateToken, socialController.unfollowUser);

/**
 * @route   GET /api/social/followers/:userId
 * @desc    Get user's followers
 * @access  Public
 */
router.get('/followers/:userId', socialController.getFollowers);

/**
 * @route   GET /api/social/following/:userId
 * @desc    Get users that a user is following
 * @access  Public
 */
router.get('/following/:userId', socialController.getFollowing);

module.exports = router;
