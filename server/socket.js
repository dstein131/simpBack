const debug = require('debug')('socket'); // For detailed debugging logs
let io = null;

module.exports = {
  /**
   * Initializes the Socket.IO server.
   * @param {http.Server} server - The HTTP server instance.
   * @returns {SocketIO.Server} - The initialized Socket.IO server.
   */
  init: (server) => {
    const socketIo = require('socket.io');
    debug('Initializing Socket.IO');
    io = socketIo(server, {
      cors: {
        origin: '*', // Adjust as needed for security in production
        methods: ['GET', 'POST'],
      },
    });

    // Log every new connection and event
    io.on('connection', (socket) => {
      debug(`New connection established: Socket ID ${socket.id}`);

      // Log room joins
      socket.on('join-room', (roomId) => {
        socket.join(roomId);
        debug(`Socket ID ${socket.id} joined room: ${roomId}`);
      });

      // Log every emitted event and payload
      const originalEmit = socket.emit.bind(socket);
      socket.emit = (event, payload) => {
        debug(`Socket ID ${socket.id} emitting event "${event}" with payload:`, payload);
        originalEmit(event, payload);
      };

      // Log disconnections
      socket.on('disconnect', (reason) => {
        debug(`Socket ID ${socket.id} disconnected. Reason: ${reason}`);
      });
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
      throw new Error('Socket.IO has not been initialized. Call init(server) first.');
    }
    debug('Socket.IO instance retrieved');
    return io;
  },
};
