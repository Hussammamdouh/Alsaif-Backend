/**
 * Monitoring Routes
 *
 * Endpoints for metrics and monitoring
 */

const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

/**
 * @route   GET /api/monitoring/health
 * @desc    Get health status (public for load balancers)
 * @access  Public
 */
router.get('/health', monitoringController.getHealth);

/**
 * All other monitoring routes require admin authentication
 */
router.use(authenticateToken);
router.use(authorizeRoles(['admin', 'superadmin']));

/**
 * @route   GET /api/monitoring/metrics
 * @desc    Get all metrics
 * @access  Admin
 */
router.get('/metrics', monitoringController.getMetrics);

/**
 * @route   GET /api/monitoring/system
 * @desc    Get system metrics
 * @access  Admin
 */
router.get('/system', monitoringController.getSystemMetrics);

/**
 * @route   GET /api/monitoring/endpoints/top
 * @desc    Get top endpoints by request count
 * @access  Admin
 */
router.get('/endpoints/top', monitoringController.getTopEndpoints);

/**
 * @route   GET /api/monitoring/endpoints/slow
 * @desc    Get slow endpoints
 * @access  Admin
 */
router.get('/endpoints/slow', monitoringController.getSlowEndpoints);

/**
 * @route   GET /api/monitoring/errors/trend
 * @desc    Get error rate trend
 * @access  Admin
 */
router.get('/errors/trend', monitoringController.getErrorTrend);

/**
 * @route   POST /api/monitoring/reset
 * @desc    Reset metrics
 * @access  Admin
 */
router.post('/reset', monitoringController.resetMetrics);

/**
 * @route   GET /api/monitoring/export
 * @desc    Export metrics
 * @access  Admin
 */
router.get('/export', monitoringController.exportMetrics);

module.exports = router;
