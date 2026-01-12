/**
 * Export Routes
 *
 * Endpoints for data export
 */

const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

/**
 * @route   GET /api/export/insights/:id/pdf
 * @desc    Export insight to PDF
 * @access  Public
 */
router.get('/insights/:id/pdf', exportController.exportInsightPDF);

/**
 * @route   GET /api/export/my-data
 * @desc    Export user data (GDPR compliance)
 * @access  Private
 */
router.get('/my-data', authenticateToken, exportController.exportUserData);

/**
 * Admin-only exports
 */
router.use(authenticateToken);
router.use(authorizeRoles(['admin', 'superadmin']));

/**
 * @route   GET /api/export/analytics/csv
 * @desc    Export analytics to CSV
 * @access  Admin
 */
router.get('/analytics/csv', exportController.exportAnalyticsCSV);

/**
 * @route   GET /api/export/insights/csv
 * @desc    Export insights list to CSV
 * @access  Admin
 */
router.get('/insights/csv', exportController.exportInsightsCSV);

module.exports = router;
