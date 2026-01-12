/**
 * Monitoring Middleware
 *
 * Tracks request metrics and performance
 */

const monitoringService = require('../services/monitoringService');
const logger = require('../utils/logger');

/**
 * Request monitoring middleware
 */
const requestMonitoring = (req, res, next) => {
  const startTime = Date.now();

  // Log request
  logger.info(`[Request] ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Capture response
  const originalSend = res.send;
  res.send = function (data) {
    const responseTime = Date.now() - startTime;

    // Record metrics
    monitoringService.recordRequest(req, res, responseTime);

    // Log response
    logger.info(`[Response] ${req.method} ${req.originalUrl} - ${res.statusCode}`, {
      responseTime: `${responseTime}ms`
    });

    originalSend.call(this, data);
  };

  next();
};

/**
 * Error monitoring middleware
 */
const errorMonitoring = (err, req, res, next) => {
  // Record error
  monitoringService.recordError(err, {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: req.body,
    params: req.params,
    query: req.query
  });

  // Pass to next error handler
  next(err);
};

module.exports = {
  requestMonitoring,
  errorMonitoring
};
