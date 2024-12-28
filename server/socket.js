// socket.js

let io = null;

module.exports = {
  /**
   * Initializes the Socket.IO server.
   * @param {http.Server} server - The HTTP server instance.
   * @returns {SocketIO.Server} - The initialized Socket.IO server.
   */
  init: (server) => {
    const socketIo = require('socket.io');
    io = socketIo(server, {
      cors: {
        origin: '*', // Adjust as needed for security in production
        methods: ['GET', 'POST'],
      },
    });
    return io;
  },

  /**
   * Retrieves the Socket.IO instance.
   * @returns {SocketIO.Server} - The Socket.IO server instance.
   * @throws Will throw an error if Socket.IO has not been initialized.
   */
  getIO: () => {
    if (!io) {
      throw new Error('Socket.io not initialized!');
    }
    return io;
  },
};
