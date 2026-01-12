// User Roles
const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin'
};

// Token Types
const TOKEN_TYPES = {
  ACCESS: 'access',
  REFRESH: 'refresh'
};

// Token Expiration
const TOKEN_EXPIRATION = {
  ACCESS: '15m',  // Short-lived access tokens
  REFRESH: '7d'   // Long-lived refresh tokens
};

// Rate Limiting
const RATE_LIMIT = {
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  MAX_REQUESTS: 100, // Default for regular users
  MAX_LOGIN_REQUESTS: 5,
  MAX_REGISTER_REQUESTS: 3,

  // Role-based multipliers
  ADMIN_MULTIPLIER: 3, // Admins get 3x the limit
  SUPERADMIN_BYPASS: true, // Superadmins bypass rate limits

  // Endpoint-specific limits
  MESSAGE_LIMIT: 20, // Messages per minute for users
  MESSAGE_LIMIT_ADMIN: 100, // Messages per minute for admins
  CONTENT_CREATION_LIMIT: 10, // Content creations per hour for users
  CONTENT_CREATION_LIMIT_ADMIN: 200, // Content creations per hour for admins
  BULK_OPERATION_LIMIT: 10, // Bulk operations per hour
  UPLOAD_LIMIT: 20, // File uploads per hour for users
  UPLOAD_LIMIT_ADMIN: 100, // File uploads per hour for admins
  STRICT_OPERATION_LIMIT: 3 // Sensitive operations per hour
};

// Pagination
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100
};

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER: 500
};

// Error Messages
const ERROR_MESSAGES = {
  // Auth
  INVALID_CREDENTIALS: 'Invalid credentials',
  ACCOUNT_DEACTIVATED: 'Account is deactivated',
  USER_EXISTS: 'User already exists with this email',
  USER_NOT_FOUND: 'User not found',
  TOKEN_REQUIRED: 'Not authorized, no token provided',
  TOKEN_INVALID: 'Not authorized, invalid token',
  TOKEN_EXPIRED: 'Token expired',
  REFRESH_TOKEN_REQUIRED: 'Refresh token is required',
  REFRESH_TOKEN_INVALID: 'Invalid refresh token',

  // Authorization
  NOT_AUTHORIZED: 'Not authorized',
  ROLE_NOT_AUTHORIZED: 'Your role is not authorized to access this resource',

  // Validation
  MISSING_FIELDS: 'Please provide all required fields',
  INVALID_EMAIL: 'Please provide a valid email',
  PASSWORD_TOO_SHORT: 'Password must be at least 6 characters',
  INVALID_ROLE: 'Please provide a valid role',
  INVALID_STATUS: 'Please provide a valid status',

  // General
  RESOURCE_NOT_FOUND: 'Resource not found',
  SERVER_ERROR: 'Server error',
  CANNOT_DELETE_SUPERADMIN: 'Cannot delete superadmin user',
  CANNOT_DELETE_SELF: 'Cannot delete your own account'
};

// Success Messages
const SUCCESS_MESSAGES = {
  REGISTER_SUCCESS: 'User registered successfully',
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logged out successfully',
  TOKEN_REFRESHED: 'Token refreshed successfully',
  USER_UPDATED: 'User updated successfully',
  USER_DELETED: 'User deleted successfully',
  ADMIN_CREATED: 'Admin created successfully',
  ROLE_UPDATED: 'User role updated successfully',
  STATUS_UPDATED: 'User status updated successfully'
};

// Chat Constants
const CHAT_TYPES = {
  PRIVATE: 'private',
  GROUP: 'group'
};

const CHAT_PERMISSIONS = {
  READ_ONLY: 'read_only',
  MEMBER: 'member',
  ADMIN: 'admin'
};

const MESSAGE_STATUS = {
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read'
};

// Socket Events
const SOCKET_EVENTS = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',
  AUTHENTICATION_ERROR: 'authentication_error',
  JOIN_CHAT: 'join_chat',
  LEAVE_CHAT: 'leave_chat',
  SEND_MESSAGE: 'send_message',
  MESSAGE_RECEIVED: 'message_received',
  CHAT_LIST_UPDATED: 'chat_list_updated',
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
  ERROR: 'error'
};

// Subscription Tiers
const SUBSCRIPTION_TIERS = {
  FREE: 'free',
  PREMIUM: 'premium'
};

// Subscription Status
const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};

// Subscription Sources (for tracking how subscription was granted)
const SUBSCRIPTION_SOURCES = {
  MANUAL: 'manual',           // Admin-granted
  PAYMENT: 'payment',         // Payment gateway (future)
  TRIAL: 'trial',             // Free trial
  PROMOTION: 'promotion',     // Promotional grant
  SYSTEM: 'system'            // System-granted (migrations, etc.)
};

// Content Access Levels
const CONTENT_ACCESS = {
  FREE: 'free',
  PREMIUM: 'premium'
};

// Audit Action Types
const AUDIT_ACTIONS = {
  // Authentication
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGOUT_ALL: 'LOGOUT_ALL',
  REFRESH_TOKEN: 'REFRESH_TOKEN',
  REGISTER: 'REGISTER',

  // User Management
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  USER_SUSPENDED: 'USER_SUSPENDED',
  USER_ACTIVATED: 'USER_ACTIVATED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',

  // Admin Management
  ADMIN_CREATED: 'ADMIN_CREATED',
  ADMIN_REMOVED: 'ADMIN_REMOVED',

  // Content Management
  INSIGHT_CREATED: 'INSIGHT_CREATED',
  INSIGHT_UPDATED: 'INSIGHT_UPDATED',
  INSIGHT_DELETED: 'INSIGHT_DELETED',
  INSIGHT_FEATURED: 'INSIGHT_FEATURED',
  INSIGHT_PUBLISHED: 'INSIGHT_PUBLISHED',
  INSIGHT_UNPUBLISHED: 'INSIGHT_UNPUBLISHED',

  // Subscription Management
  SUBSCRIPTION_GRANTED: 'SUBSCRIPTION_GRANTED',
  SUBSCRIPTION_UPGRADED: 'SUBSCRIPTION_UPGRADED',
  SUBSCRIPTION_DOWNGRADED: 'SUBSCRIPTION_DOWNGRADED',
  SUBSCRIPTION_RENEWED: 'SUBSCRIPTION_RENEWED',
  SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED',
  SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',

  // Content Access
  PREMIUM_CONTENT_ACCESSED: 'PREMIUM_CONTENT_ACCESSED',
  PREMIUM_ACCESS_DENIED: 'PREMIUM_ACCESS_DENIED',

  // Chat Management
  CHAT_CREATED: 'CHAT_CREATED',
  CHAT_DELETED: 'CHAT_DELETED',
  USER_MUTED: 'USER_MUTED',
  USER_UNMUTED: 'USER_UNMUTED',
  USER_BANNED: 'USER_BANNED',
  USER_UNBANNED: 'USER_UNBANNED',
  PARTICIPANT_ADDED: 'PARTICIPANT_ADDED',
  PARTICIPANT_REMOVED: 'PARTICIPANT_REMOVED',

  // System Configuration
  CONFIG_UPDATED: 'CONFIG_UPDATED',
  RATE_LIMIT_CHANGED: 'RATE_LIMIT_CHANGED',

  // Abuse Management
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED: 'ACCOUNT_UNLOCKED',
  SPAM_DETECTED: 'SPAM_DETECTED',
  ABUSE_REPORTED: 'ABUSE_REPORTED'
};

module.exports = {
  ROLES,
  TOKEN_TYPES,
  TOKEN_EXPIRATION,
  RATE_LIMIT,
  PAGINATION,
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  CHAT_TYPES,
  CHAT_PERMISSIONS,
  MESSAGE_STATUS,
  SOCKET_EVENTS,
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_SOURCES,
  CONTENT_ACCESS,
  AUDIT_ACTIONS
};
