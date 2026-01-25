const { verifyAccessToken } = require('../utils/tokenUtils');
const User = require('../models/User');
const TokenBlacklist = require('../models/TokenBlacklist');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../constants');

const authenticateToken = async (req, res, next) => {
  try {
    let token;

    // Extract token from Authorization header or query parameter (for downloads)
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      // SECURITY FIX (MED-003): Log missing token attempts
      logger.warn('Authentication failed: No token provided', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('user-agent'),
        securityEvent: 'MISSING_TOKEN'
      });

      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.TOKEN_REQUIRED
      });
    }

    // Verify token
    const decoded = verifyAccessToken(token);

    if (!decoded) {
      // SECURITY FIX (MED-003): Log failed JWT verification (potential attack)
      logger.warn('Authentication failed: Invalid or expired JWT', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('user-agent'),
        tokenPreview: token.substring(0, 20) + '...',
        securityEvent: 'INVALID_JWT'
      });

      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.TOKEN_INVALID
      });
    }

    // SECURITY FIX (CRITICAL): Check if token has been blacklisted (revoked after logout)
    if (decoded.jti) {
      const isBlacklisted = await TokenBlacklist.isBlacklisted(decoded.jti);
      if (isBlacklisted) {
        logger.warn('Authentication failed: Token has been revoked', {
          ip: req.ip,
          path: req.path,
          userId: decoded.id,
          jti: decoded.jti,
          securityEvent: 'REVOKED_TOKEN_USAGE'
        });

        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: ERROR_MESSAGES.TOKEN_INVALID
        });
      }
    }

    // Get user from token and attach to request
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.NOT_AUTHORIZED
      });
    }

    if (!user.isActive) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.ACCOUNT_DEACTIVATED
      });
    }

    // SECURITY FIX (CRITICAL): Global Token Revocation
    // If user logged out of all devices, tokens issued before that time are invalid
    if (user.lastLoggedOutAllAt) {
      const tokenIssuedAt = new Date(decoded.iat * 1000);
      if (tokenIssuedAt < user.lastLoggedOutAllAt) {
        logger.warn('Authentication failed: Token revoked by global logout', {
          ip: req.ip,
          userId: user._id,
          tokenIssuedAt,
          lastLoggedOutAllAt: user.lastLoggedOutAllAt,
          securityEvent: 'GLOBAL_REVOCATION_LOGOUT'
        });

        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: ERROR_MESSAGES.TOKEN_INVALID
        });
      }
    }

    // Attach user to request
    req.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive
    };

    next();
  } catch (error) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: ERROR_MESSAGES.NOT_AUTHORIZED
    });
  }
};

const authorizeRoles = (...roles) => {
  // SECURITY FIX: Flatten roles array if passed as an array (common in some route files)
  const allowedRoles = Array.isArray(roles[0]) ? roles[0] : roles;

  return (req, res, next) => {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.NOT_AUTHORIZED
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      // SECURITY FIX (MED-003): Log failed authorization attempts
      logger.warn('Authorization failed: Insufficient permissions', {
        userId: req.user.id,
        userEmail: req.user.email,
        userRole: req.user.role,
        requiredRoles: roles,
        ip: req.ip,
        path: req.path,
        method: req.method,
        securityEvent: 'AUTHORIZATION_FAILED'
      });

      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: ERROR_MESSAGES.ROLE_NOT_AUTHORIZED
      });
    }

    next();
  };
};

// Socket.io authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error(ERROR_MESSAGES.TOKEN_REQUIRED));
    }

    const decoded = verifyAccessToken(token);

    if (!decoded) {
      return next(new Error(ERROR_MESSAGES.TOKEN_INVALID));
    }

    const user = await User.findById(decoded.id).select('-password');

    if (!user || !user.isActive) {
      return next(new Error(ERROR_MESSAGES.NOT_AUTHORIZED));
    }

    socket.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    next(new Error(ERROR_MESSAGES.NOT_AUTHORIZED));
  }
};

/**
 * Optional authentication middleware
 * Sets req.user if a valid token is present, but doesn't block the request if not
 * Used for public endpoints that may benefit from knowing the user's identity
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    // Extract token from Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    // No token - continue without user
    if (!token) {
      return next();
    }

    // Verify token
    const decoded = verifyAccessToken(token);

    if (!decoded) {
      // Invalid token - continue without user (don't block)
      return next();
    }

    // Get user from token and attach to request
    const user = await User.findById(decoded.id).select('-password');

    if (user && user.isActive) {
      // Attach user to request
      req.user = {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      };
    }

    next();
  } catch (error) {
    // On error, continue without user (don't block)
    next();
  }
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  authenticateSocket,
  optionalAuth
};
