/**
 * Media Upload Routes
 *
 * Handles image upload, deletion, and management
 * Features:
 * - Single and multiple image upload
 * - Image deletion (admin/author only)
 * - Image metadata retrieval
 * - Image listing (admin only)
 */

const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { uploadSingleImage, uploadMultipleImages } = require('../middleware/fileUpload');

/**
 * @route   POST /api/media/upload
 * @desc    Upload single image
 * @access  Private (authenticated users)
 */
router.post('/upload', authenticateToken, uploadSingleImage, mediaController.uploadImage);

/**
 * @route   POST /api/media/upload-multiple
 * @desc    Upload multiple images (max 10)
 * @access  Private (authenticated users)
 */
router.post('/upload-multiple', authenticateToken, uploadMultipleImages, mediaController.uploadMultipleImages);

/**
 * @route   DELETE /api/media/:filename
 * @desc    Delete image
 * @access  Private (admin only)
 */
router.delete('/:filename', authenticateToken, authorizeRoles(['admin', 'superadmin']), mediaController.deleteImage);

/**
 * @route   GET /api/media/:filename/metadata
 * @desc    Get image metadata
 * @access  Public
 */
router.get('/:filename/metadata', mediaController.getImageMetadata);

/**
 * @route   GET /api/media
 * @desc    List all uploaded images (paginated)
 * @access  Private (admin only)
 */
router.get('/', authenticateToken, authorizeRoles(['admin', 'superadmin']), mediaController.listImages);

module.exports = router;
