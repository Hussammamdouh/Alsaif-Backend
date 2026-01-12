/**
 * Performance Monitoring Middleware
 *
 * Tracks request performance metrics
 */

const performanceMonitoringService = require('../services/performanceMonitoringService');

/**
 * Middleware to track request performance
 */
exports.trackPerformance = (req, res, next) => {
  const startTime = Date.now();

  // Override res.send to capture response time
  const originalSend = res.send;

  res.send = function (data) {
    const responseTime = Date.now() - startTime;

    // Record request in performance monitoring
    performanceMonitoringService.recordRequest(req, res, responseTime);

    // Call original send
    originalSend.call(this, data);
  };

  next();
};

/**
 * Middleware to track errors
 */
exports.trackErrors = (err, req, res, next) => {
  performanceMonitoringService.recordError(err, {
    path: req.path,
    method: req.method,
    statusCode: res.statusCode,
    user: req.user?.id
  });

  next(err);
};
