const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const { optionalAuth } = require('../middleware/authMiddleware');
const { query } = require('express-validator');
const { validate } = require('../middleware/validation');

/**
 * Search Routes
 *
 * All routes are public but optionalAuth allows personalization if user is logged in
 */

// Search validation
const searchValidation = [
  query('q')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters'),
  query('type')
    .optional()
    .isIn(['free', 'premium'])
    .withMessage('Invalid type'),
  query('sortBy')
    .optional()
    .isIn(['relevance', 'date', 'views', 'likes', 'title'])
    .withMessage('Invalid sort option'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Invalid sort order'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  validate
];

/**
 * Advanced search
 * GET /api/search?q=stock&category=tech&tags=ai,ml&page=1&limit=20
 */
router.get('/', optionalAuth, searchValidation, searchController.search);

/**
 * Get search suggestions (autocomplete)
 * GET /api/search/suggestions?q=sto
 */
router.get('/suggestions', searchController.getSuggestions);

/**
 * Get trending searches
 * GET /api/search/trending
 */
router.get('/trending', searchController.getTrending);

/**
 * Get available filters
 * GET /api/search/filters
 */
router.get('/filters', searchController.getFilters);

module.exports = router;
