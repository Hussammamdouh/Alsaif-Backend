const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');

/**
 * @route   GET /api/banners
 * @desc    Get active banners for home screen
 * @access  Public
 */
router.get('/', bannerController.getActiveBanners);

module.exports = router;
