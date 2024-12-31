// socket.js

const { Server } = require('socket.io');
const logger = require('./logger'); // Ensure you have a logger

let io;

/**
 * Initializes Socket.IO with the given HTTP server.
 * @param {http.Server} server - The HTTP server instance.
 * @returns {SocketIO.Server} - The initialized Socket.IO server.
 */
module.exports = {
  init: (server) => {
    io = new Server(server, {
      cors: {
        origin: '*', // Adjust as needed for security in production
        methods: ['GET', 'POST'],
      },
    });

    io.on('connection', (socket) => {
      logger.info(`✅ User connected: ${socket.id}`);

      // Define your socket event handlers here
      socket.on('join-streamer-room', (roomId) => {
        socket.join(roomId);
        logger.info(`User ${socket.id} joined room: ${roomId}`);
      });

      socket.on('send-tip', (data) => {
        const { streamerId, tipAmount, message } = data;
        io.to(streamerId).emit('receive-tip', { tipAmount, message });
        logger.info(`Tip sent to streamer ${streamerId}: $${tipAmount}`);
      });

      socket.on('disconnect', () => {
        logger.info(`❌ User disconnected: ${socket.id}`);
      });
    });

    return io;
  },

  /**
   * Retrieves the initialized Socket.IO server instance.
   * @returns {SocketIO.Server} - The Socket.IO server instance.
   */
  getIO: () => {
    if (!io) {
      throw new Error('Socket.io not initialized!');
    }
    return io;
  },
};
