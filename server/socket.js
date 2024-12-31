// src/socket.js

const { Server } = require('socket.io');

let io;

module.exports = {
  /**
   * Initializes Socket.IO with the given HTTP server.
   * @param {http.Server} server - The HTTP server instance.
   * @returns {SocketIO.Server} - The initialized Socket.IO server.
   */
  init: (server) => {
    io = new Server(server, {
      cors: {
        origin: '*', // Adjust as needed for security in production
        methods: ['GET', 'POST'],
      },
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
