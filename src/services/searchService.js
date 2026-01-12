const Insight = require('../models/Insight');
const { getPaginationParams } = require('../utils/pagination');

/**
 * Advanced Search Service
 *
 * Features:
 * - Full-text search (MongoDB text indexes)
 * - Multi-field search (title, content, excerpt)
 * - Advanced filtering (status, type, category, tags, date ranges)
 * - Fuzzy matching
 * - Search result ranking
 * - Search suggestions/autocomplete
 * - Saved searches (future)
 */

class SearchService {
  /**
   * Perform advanced search with filters
   *
   * @param {Object} params - Search parameters
   * @param {string} params.query - Search query
   * @param {string} params.type - Content type (free/premium)
   * @param {string} params.category - Category filter
   * @param {Array} params.tags - Tags filter
   * @param {string} params.status - Status filter
   * @param {Date} params.dateFrom - Start date
   * @param {Date} params.dateTo - End date
   * @param {string} params.sortBy - Sort field
   * @param {string} params.sortOrder - Sort order (asc/desc)
   * @param {number} params.page - Page number
   * @param {number} params.limit - Items per page
   * @returns {Promise<Object>} Search results with pagination
   */
  async search(params) {
    const {
      query,
      type,
      category,
      tags,
      status,
      dateFrom,
      dateTo,
      sortBy = 'relevance',
      sortOrder = 'desc',
      page = 1,
      limit = 20
    } = params;

    // Build search query
    const searchQuery = { isDeleted: false };

    // Text search (if query provided)
    if (query && query.trim()) {
      // MongoDB text search
      searchQuery.$text = { $search: query };
    }

    // Type filter
    if (type) {
      searchQuery.type = type;
    }

    // Category filter
    if (category) {
      searchQuery.category = category;
    }

    // Tags filter (match any of the provided tags)
    if (tags && tags.length > 0) {
      searchQuery.tags = { $in: tags };
    }

    // Status filter
    if (status) {
      searchQuery.status = status;
    } else {
      // Default: only published
      searchQuery.status = 'published';
    }

    // Date range filter
    if (dateFrom || dateTo) {
      searchQuery.createdAt = {};
      if (dateFrom) searchQuery.createdAt.$gte = new Date(dateFrom);
      if (dateTo) searchQuery.createdAt.$lte = new Date(dateTo);
    }

    // Pagination
    const { skip } = getPaginationParams({ page, limit });

    // Sorting
    let sortOptions = {};
    switch (sortBy) {
      case 'relevance':
        // Text search score (only if text search is used)
        if (query && query.trim()) {
          sortOptions = { score: { $meta: 'textScore' } };
        } else {
          sortOptions = { createdAt: -1 }; // Default to newest
        }
        break;
      case 'date':
        sortOptions = { createdAt: sortOrder === 'asc' ? 1 : -1 };
        break;
      case 'views':
        sortOptions = { viewCount: sortOrder === 'asc' ? 1 : -1 };
        break;
      case 'likes':
        sortOptions = { likes: sortOrder === 'asc' ? 1 : -1 };
        break;
      case 'title':
        sortOptions = { title: sortOrder === 'asc' ? 1 : -1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    // Execute search with text score projection if needed
    const projection = query && query.trim()
      ? { score: { $meta: 'textScore' } }
      : {};

    const [results, total] = await Promise.all([
      Insight.find(searchQuery, projection)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('author', 'name email')
        .lean(),
      Insight.countDocuments(searchQuery)
    ]);

    return {
      results,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      hasNextPage: skip + results.length < total,
      hasPrevPage: page > 1
    };
  }

  /**
   * Get search suggestions (autocomplete)
   *
   * @param {string} query - Partial search query
   * @param {number} limit - Max suggestions
   * @returns {Promise<Array>} Suggested titles
   */
  async getSuggestions(query, limit = 10) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    // Search titles that start with or contain the query
    const regex = new RegExp(query, 'i');

    const suggestions = await Insight.find({
      title: regex,
      status: 'published',
      isDeleted: false
    })
      .select('title category type')
      .sort({ viewCount: -1, likes: -1 })
      .limit(limit)
      .lean();

    return suggestions.map(s => ({
      title: s.title,
      category: s.category,
      type: s.type
    }));
  }

  /**
   * Get trending searches (popular searches)
   *
   * @returns {Promise<Array>} Trending search terms
   */
  async getTrendingSearches() {
    // For now, return trending based on most viewed insights
    // In future, track actual search queries
    const trending = await Insight.find({
      status: 'published',
      isDeleted: false
    })
      .select('title tags')
      .sort({ viewCount: -1 })
      .limit(10)
      .lean();

    // Extract unique tags from trending insights
    const trendingTags = new Set();
    trending.forEach(insight => {
      if (insight.tags) {
        insight.tags.forEach(tag => trendingTags.add(tag));
      }
    });

    return Array.from(trendingTags).slice(0, 10);
  }

  /**
   * Get all available categories (for filter dropdown)
   *
   * @returns {Promise<Array>} Available categories
   */
  async getCategories() {
    const categories = await Insight.distinct('category', {
      status: 'published',
      isDeleted: false
    });

    return categories.filter(Boolean);
  }

  /**
   * Get all available tags (for filter dropdown)
   *
   * @returns {Promise<Array>} Available tags with counts
   */
  async getTags() {
    const tags = await Insight.aggregate([
      {
        $match: {
          status: 'published',
          isDeleted: false,
          tags: { $exists: true, $ne: [] }
        }
      },
      { $unwind: '$tags' },
      {
        $group: {
          _id: '$tags',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]);

    return tags.map(t => ({
      tag: t._id,
      count: t.count
    }));
  }

  /**
   * Get search filters metadata (for building UI)
   *
   * @returns {Promise<Object>} Available filters
   */
  async getSearchFilters() {
    const [categories, tags] = await Promise.all([
      this.getCategories(),
      this.getTags()
    ]);

    return {
      categories,
      tags,
      types: ['free', 'premium'],
      statuses: ['published', 'draft', 'archived'],
      sortOptions: [
        { value: 'relevance', label: 'Relevance' },
        { value: 'date', label: 'Date' },
        { value: 'views', label: 'Most Viewed' },
        { value: 'likes', label: 'Most Liked' },
        { value: 'title', label: 'Title' }
      ]
    };
  }
}

module.exports = new SearchService();
