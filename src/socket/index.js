const socketIO = require('socket.io');
const { authenticateSocket } = require('../middleware/authMiddleware');
const chatHandlers = require('./chatHandlers');
const logger = require('../utils/logger');
const { SOCKET_EVENTS } = require('../constants');

const initializeSocket = (server) => {
  const io = socketIO(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    // SECURITY FIX (HIGH-005): Prevent DoS via large WebSocket messages
    maxHttpBufferSize: 1e6, // 1MB max message size (default is 1MB, but explicit is better)
    // Additional security options
    perMessageDeflate: false, // Disable compression to prevent compression bombs
    allowEIO3: false // Disable legacy Engine.IO protocol v3 (security vulnerability)
  });

  // Authentication middleware
  io.use(authenticateSocket);

  // Connection handler
  io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    logger.info(`Socket connected: ${socket.id} - User: ${socket.user.id}`);

    // Store user's socket ID for direct messaging
    socket.userId = socket.user.id;
    socket.join(`user:${socket.user.id}`);

    // Initialize chat handlers
    chatHandlers(io, socket);

    // Disconnect handler
    socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
      logger.info(`Socket disconnected: ${socket.id} - Reason: ${reason}`);
    });

    // Error handler
    socket.on(SOCKET_EVENTS.ERROR, (error) => {
      logger.error(`Socket error: ${socket.id}`, { error });
    });
  });

  logger.info('Socket.IO initialized');

  return io;
};

module.exports = initializeSocket;
