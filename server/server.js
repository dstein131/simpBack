/*********************************************
 *  DEPENDENCIES
 ********************************************/
const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path'); // For handling file paths
const { fork } = require('child_process'); // For starting the worker as a child process
const routes = require('./routes'); // Import all routes
const socket = require('./socket'); // Shared Socket.IO instance
const ttsQueue = require('./queues/ttsQueue'); // Import the TTS queue
const db = require('./db'); // Now correctly requires server/db/index.js
const logger = require('./logger'); // Import the Winston logger

/*********************************************
 *  LOAD ENVIRONMENT VARIABLES
 ********************************************/
dotenv.config();

/*********************************************
 *  INITIALIZE EXPRESS
 ********************************************/
const app = express();

// CORS Configuration
app.use(cors({
  origin: '*', // Adjust as needed for security in production
  methods: 'GET,POST,PUT,DELETE',
  allowedHeaders: 'Content-Type, Authorization',
}));

// Middleware to parse JSON bodies
app.use(express.json());

/*********************************************
 *  REQUEST LOGGING MIDDLEWARE
 ********************************************/
app.use((req, res, next) => {
  logger.info(`Incoming Request: ${req.method} ${req.url}`);
  
  res.on('finish', () => {
    logger.info(`Response: ${req.method} ${req.url} - Status: ${res.statusCode}`);
  });
  
  next();
});

/*********************************************
 *  SERVE STATIC TTS AUDIO FILES
 ********************************************/
// Serve the 'tts_audios' directory for accessing generated audio files
app.use('/tts_audios', express.static(path.join(__dirname, 'public', 'tts_audios')));

/*********************************************
 *  SOCKET.IO
 ********************************************/
const server = http.createServer(app);
const io = socket.init(server); // Initialize Socket.IO and export

// Attach Socket.IO to the app so it can be accessed in controllers
app.io = io;

// Handle Socket.IO connections
io.on('connection', (socket) => {
  logger.info(`✅ User connected: ${socket.id}`);

  // Join a specific streamer room
  socket.on('join-streamer-room', (roomId) => {
    socket.join(roomId);
    logger.info(`User ${socket.id} joined room: ${roomId}`);
  });

  // Handle sending tips
  socket.on('send-tip', (data) => {
    const { streamerId, tipAmount, message } = data;
    io.to(streamerId).emit('receive-tip', { tipAmount, message });
    logger.info(`Tip sent to streamer ${streamerId}: $${tipAmount}`);
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    logger.info(`❌ User disconnected: ${socket.id}`);
  });
});

/*********************************************
 *  API ROUTES
 ********************************************/
// Basic health check
app.get('/', (req, res) => {
  res.send('Tip System Backend is running. (MySQL & Protected Routes Enabled)');
});

// Use separated route files with a prefix
app.use('/api', routes);

/*********************************************
 *  ERROR HANDLING MIDDLEWARE
 ********************************************/
// Catch-all error handler
app.use((err, req, res, next) => {
  logger.error(`Express Error Handler: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal Server Error' });
});

/*********************************************
 *  START WORKER AS CHILD PROCESS
 ********************************************/
const workerPath = path.join(__dirname, 'workers/ttsWorker.js');

const startWorker = () => {
  const worker = fork(workerPath);

  // Log messages from the worker
  worker.on('message', (msg) => logger.info(`[Worker Message]: ${msg}`));

  // Handle worker errors
  worker.on('error', (err) => logger.error(`[Worker Error]: ${err.message}`, { stack: err.stack }));

  // Restart worker if it exits unexpectedly
  worker.on('exit', (code, signal) => {
    if (code !== 0) {
      logger.error(`[Worker] exited with code ${code} and signal ${signal}. Restarting...`);
      startWorker();
    } else {
      logger.info(`[Worker] exited gracefully with code ${code}.`);
    }
  });
};

// Start the worker
startWorker();

/*********************************************
 *  TTS QUEUE EVENT HANDLERS
 ********************************************/

/**
 * Handle Completed TTS Jobs
 */
ttsQueue.on('completed', async (job, result) => {
  const { ttsRequestId, message, voice } = job.data;
  const audioUrl = result;

  try {
    // Fetch creator_id based on ttsRequestId
    const [rows] = await db.query(
      'SELECT creator_id FROM tts_requests WHERE id = ?',
      [ttsRequestId]
    );

    if (rows.length === 0) {
      logger.error('❌ No TTS request found with ID:', ttsRequestId);
      return;
    }

    const creatorId = rows[0].creator_id;

    // Emit the 'tts-request' event to the specific creator's room
    io.to(`creator-room-${creatorId}`).emit('tts-request', {
      ttsRequestId,
      message,
      voice,
      audioUrl,
    });

    logger.info(`✅ TTS Request ${job.id} completed for TTS Request ID ${ttsRequestId}`);
  } catch (err) {
    logger.error('❌ Error handling completed TTS job:', err);
  }
});

/**
 * Handle Failed TTS Jobs
 */
ttsQueue.on('failed', async (job, err) => {
  const { ttsRequestId, message, voice } = job.data;

  try {
    // Fetch creator_id based on ttsRequestId
    const [rows] = await db.query(
      'SELECT creator_id FROM tts_requests WHERE id = ?',
      [ttsRequestId]
    );

    if (rows.length === 0) {
      logger.error('❌ No TTS request found with ID:', ttsRequestId);
      return;
    }

    const creatorId = rows[0].creator_id;

    // Emit the 'tts-request-failed' event to the specific creator's room
    io.to(`creator-room-${creatorId}`).emit('tts-request-failed', {
      ttsRequestId,
      message,
      voice,
      error: err.message,
    });

    logger.error(`❌ TTS Request ${job.id} failed for TTS Request ID ${ttsRequestId}: ${err.message}`, { error: err });
  } catch (error) {
    logger.error('❌ Error handling failed TTS job:', error);
  }
});

/*********************************************
 *  START THE SERVER
 ********************************************/
const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`✅ Server is running on http://localhost:${PORT}`);
  logger.debug(`Environment PORT: ${process.env.PORT}`);
});

/*********************************************
 *  PROCESS LEVEL ERROR HANDLING
 ********************************************/
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1); // Optional: Exit the process if necessary
});
