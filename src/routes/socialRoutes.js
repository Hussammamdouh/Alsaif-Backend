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


module.exports = router;
