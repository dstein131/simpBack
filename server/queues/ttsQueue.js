// queues/ttsQueue.js

const Bull = require('bull');
const logger = require('../logger');

// Initialize Bull Queue with Redis configuration
const ttsQueue = new Bull('ttsQueue', {
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10),
    password: process.env.REDIS_PASSWORD,
    tls: {}, // Required for secure connections to Redis providers like Azure Redis
    retryStrategy: (attempts) => {
      const delay = Math.min(attempts * 50, 2000); // Exponential backoff up to 2 seconds
      logger.warn(`Redis connection retry in ${delay}ms. Attempt: ${attempts}`);
      return delay;
    },
  },
});

module.exports = ttsQueue;
