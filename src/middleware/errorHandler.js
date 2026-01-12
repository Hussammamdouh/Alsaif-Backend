const { HTTP_STATUS, ERROR_MESSAGES } = require('../constants');
const logger = require('../utils/logger');
const { NODE_ENV } = require('../config/env');

const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === HTTP_STATUS.OK ? HTTP_STATUS.INTERNAL_SERVER : res.statusCode;
  let message = err.message || ERROR_MESSAGES.SERVER_ERROR;

  // Mongoose duplicate key error
  if (err.code === 11000) {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    const field = Object.keys(err.keyPattern)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    const errors = Object.values(err.errors).map(e => e.message);
    message = errors.join(', ');
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = HTTP_STATUS.NOT_FOUND;
    message = ERROR_MESSAGES.RESOURCE_NOT_FOUND;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = HTTP_STATUS.UNAUTHORIZED;
    message = ERROR_MESSAGES.TOKEN_INVALID;
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = HTTP_STATUS.UNAUTHORIZED;
    message = ERROR_MESSAGES.TOKEN_EXPIRED;
  }

  // Log error
  logger.error(`${req.method} ${req.path} - ${message}`, {
    error: err.message,
    stack: err.stack,
    statusCode,
    ip: req.ip
  });

  // SECURITY NOTE: Stack traces exposed in development mode only
  // In production, stack traces are hidden to prevent information leakage
  // Ensure NODE_ENV is set to 'production' in production environments
  res.status(statusCode).json({
    success: false,
    message,
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
};

const notFound = (req, res, next) => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);

  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
};

module.exports = {
  errorHandler,
  notFound
};
