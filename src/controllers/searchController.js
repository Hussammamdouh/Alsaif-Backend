const searchService = require('../services/searchService');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../constants');

class SearchController {
  /**
   * Advanced search endpoint
   * GET /api/search
   */
  async search(req, res, next) {
    try {
      const {
        q, // query
        type,
        category,
        tags,
        status,
        dateFrom,
        dateTo,
        sortBy,
        sortOrder,
        page,
        limit
      } = req.query;

      // Parse tags if provided as comma-separated string
      const parsedTags = tags ? tags.split(',').map(t => t.trim()) : [];

      const results = await searchService.search({
        query: q,
        type,
        category,
        tags: parsedTags,
        status,
        dateFrom,
        dateTo,
        sortBy,
        sortOrder,
        page,
        limit
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Search completed successfully',
        data: results
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get search suggestions (autocomplete)
   * GET /api/search/suggestions?q=stock
   */
  async getSuggestions(req, res, next) {
    try {
      const { q } = req.query;
      const limit = parseInt(req.query.limit) || 10;

      const suggestions = await searchService.getSuggestions(q, limit);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: { suggestions }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get trending searches
   * GET /api/search/trending
   */
  async getTrending(req, res, next) {
    try {
      const trending = await searchService.getTrendingSearches();

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: { trending }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get available search filters
   * GET /api/search/filters
   */
  async getFilters(req, res, next) {
    try {
      const filters = await searchService.getSearchFilters();

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: filters
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SearchController();
