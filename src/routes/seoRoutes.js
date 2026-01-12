/**
 * SEO Routes
 *
 * Endpoints for SEO metadata and sitemaps
 */

const express = require('express');
const router = express.Router();
const seoController = require('../controllers/seoController');

/**
 * All SEO routes are public
 */

/**
 * @route   GET /api/seo/insights/:id/meta
 * @desc    Get meta tags for an insight
 * @access  Public
 */
router.get('/insights/:id/meta', seoController.getInsightMeta);

/**
 * @route   GET /api/seo/insights/:id/structured-data
 * @desc    Get structured data (Schema.org) for an insight
 * @access  Public
 */
router.get('/insights/:id/structured-data', seoController.getInsightStructuredData);

/**
 * @route   GET /api/seo/sitemap.xml
 * @desc    Generate sitemap
 * @access  Public
 */
router.get('/sitemap.xml', seoController.getSitemap);

/**
 * @route   GET /api/seo/robots.txt
 * @desc    Generate robots.txt
 * @access  Public
 */
router.get('/robots.txt', seoController.getRobots);

module.exports = router;
