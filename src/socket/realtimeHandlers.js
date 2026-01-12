/**
 * Real-Time Handlers
 *
 * Enhanced WebSocket handlers for real-time features
 */

const logger = require('../utils/logger');
const { SOCKET_EVENTS } = require('../constants');

// Store online users
const onlineUsers = new Map();

/**
 * Initialize real-time handlers
 */
function initializeRealtimeHandlers(io, socket) {
  const userId = socket.user?.id;

  // User comes online
  socket.on('user:online', () => {
    if (userId) {
      onlineUsers.set(userId, {
        socketId: socket.id,
        lastSeen: new Date(),
        status: 'online'
      });

      // Broadcast to all clients
      io.emit('user:status', {
        userId,
        status: 'online',
        timestamp: new Date()
      });

      logger.info('[Realtime] User online', { userId });
    }
  });

  // User goes offline
  socket.on('disconnect', () => {
    if (userId && onlineUsers.has(userId)) {
      onlineUsers.delete(userId);

      io.emit('user:status', {
        userId,
        status: 'offline',
        timestamp: new Date()
      });

      logger.info('[Realtime] User offline', { userId });
    }
  });

  // Real-time notifications
  socket.on('notification:subscribe', (data) => {
    const { userId: targetUserId } = data;
    if (targetUserId) {
      socket.join(`user:${targetUserId}`);
      logger.info('[Realtime] Subscribed to notifications', { userId: targetUserId });
    }
  });

  // Real-time comment updates
  socket.on('comment:subscribe', (data) => {
    const { insightId } = data;
    if (insightId) {
      socket.join(`insight:${insightId}:comments`);
      logger.info('[Realtime] Subscribed to comments', { insightId });
    }
  });

  socket.on('comment:unsubscribe', (data) => {
    const { insightId } = data;
    if (insightId) {
      socket.leave(`insight:${insightId}:comments`);
    }
  });

  // Real-time like updates
  socket.on('like:update', (data) => {
    const { insightId, action, count } = data;
    io.to(`insight:${insightId}:comments`).emit('like:changed', {
      insightId,
      action,
      count,
      userId
    });
  });

  // Typing indicators for comments
  socket.on('comment:typing:start', (data) => {
    const { insightId } = data;
    socket.to(`insight:${insightId}:comments`).emit('user:typing', {
      insightId,
      userId,
      userName: socket.user?.name
    });
  });

  socket.on('comment:typing:stop', (data) => {
    const { insightId } = data;
    socket.to(`insight:${insightId}:comments`).emit('user:stopped_typing', {
      insightId,
      userId
    });
  });

  // Real-time analytics updates (for admin dashboard)
  if (socket.user?.role === 'admin' || socket.user?.role === 'superadmin') {
    socket.on('analytics:subscribe', () => {
      socket.join('analytics:live');
      logger.info('[Realtime] Admin subscribed to analytics');
    });
  }
}

/**
 * Broadcast new comment
 */
function broadcastNewComment(io, insightId, comment) {
  io.to(`insight:${insightId}:comments`).emit('comment:new', {
    insightId,
    comment,
    timestamp: new Date()
  });
}

/**
 * Broadcast notification to user
 */
function broadcastNotification(io, userId, notification) {
  io.to(`user:${userId}`).emit('notification:new', {
    notification,
    timestamp: new Date()
  });

  // Also send to user's online status room if they're online
  const user = onlineUsers.get(userId);
  if (user) {
    io.to(user.socketId).emit('notification:new', {
      notification,
      timestamp: new Date()
    });
  }
}

/**
 * Broadcast analytics update
 */
function broadcastAnalyticsUpdate(io, data) {
  io.to('analytics:live').emit('analytics:update', {
    data,
    timestamp: new Date()
  });
}

/**
 * Get online users count
 */
function getOnlineUsersCount() {
  return onlineUsers.size;
}

/**
 * Check if user is online
 */
function isUserOnline(userId) {
  return onlineUsers.has(userId);
}

/**
 * Get online users list
 */
function getOnlineUsers() {
  return Array.from(onlineUsers.entries()).map(([userId, data]) => ({
    userId,
    ...data
  }));
}

module.exports = {
  initializeRealtimeHandlers,
  broadcastNewComment,
  broadcastNotification,
  broadcastAnalyticsUpdate,
  getOnlineUsersCount,
  isUserOnline,
  getOnlineUsers
};
