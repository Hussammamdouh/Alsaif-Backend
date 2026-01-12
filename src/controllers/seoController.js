/**
 * SEO Controller
 *
 * Handles SEO-related endpoints
 */

const seoService = require('../services/seoService');
const Insight = require('../models/Insight');
const { HTTP_STATUS } = require('../constants');
const logger = require('../utils/logger');

/**
 * Get meta tags for an insight
 * GET /api/seo/insights/:id/meta
 */
exports.getInsightMeta = async (req, res) => {
  try {
    const { id } = req.params;

    const insight = await Insight.findById(id)
      .populate('author', 'name')
      .select('title content excerpt category tags featuredImage publishedAt updatedAt');

    if (!insight) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Insight not found'
      });
    }

    const metaTags = seoService.generateMetaTags(insight);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: metaTags
    });
  } catch (error) {
    logger.error('[SeoController] Get insight meta failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to generate meta tags',
      error: error.message
    });
  }
};

/**
 * Get structured data for an insight
 * GET /api/seo/insights/:id/structured-data
 */
exports.getInsightStructuredData = async (req, res) => {
  try {
    const { id } = req.params;

    const insight = await Insight.findById(id)
      .populate('author', 'name')
      .select('title content excerpt category tags featuredImage publishedAt updatedAt');

    if (!insight) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Insight not found'
      });
    }

    const structuredData = seoService.generateStructuredData(insight);
    const breadcrumb = seoService.generateBreadcrumb(insight);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        article: structuredData,
        breadcrumb
      }
    });
  } catch (error) {
    logger.error('[SeoController] Get structured data failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to generate structured data',
      error: error.message
    });
  }
};

/**
 * Generate sitemap.xml
 * GET /api/seo/sitemap.xml
 */
exports.getSitemap = async (req, res) => {
  try {
    const insights = await Insight.find({ status: 'published' })
      .select('_id updatedAt analytics')
      .sort({ publishedAt: -1 });

    const sitemap = await seoService.generateSitemap(insights);

    res.set('Content-Type', 'application/xml');
    res.status(HTTP_STATUS.OK).send(sitemap);
  } catch (error) {
    logger.error('[SeoController] Generate sitemap failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to generate sitemap',
      error: error.message
    });
  }
};

/**
 * Generate robots.txt
 * GET /api/seo/robots.txt
 */
exports.getRobots = async (req, res) => {
  try {
    const robotsTxt = seoService.generateRobotsTxt();

    res.set('Content-Type', 'text/plain');
    res.status(HTTP_STATUS.OK).send(robotsTxt);
  } catch (error) {
    logger.error('[SeoController] Generate robots.txt failed:', error);
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Failed to generate robots.txt',
      error: error.message
    });
  }
};
