const express = require('express');
const router = express.Router();
const newsService = require('../services/newsService');
const compression = require('compression');

// Use compression for better performance with 5000 users
router.use(compression());

/**
 * @route   GET /api/news
 * @desc    Get latest 20 news articles from cache
 * @access  Public
 */
router.get('/', (req, res) => {
    try {
        const news = newsService.getLatestNews();
        res.json({
            success: true,
            count: news.length,
            data: news
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch news',
            error: error.message
        });
    }
});

module.exports = router;
