const Bull = require('bull');
const { processTTSRequest } = require('../services/ttsService');
const logger = require('../logger');
const db = require('../db');

// Initialize Redis with connection options
const ttsQueue = new Bull('ttsQueue', {
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10),
    password: process.env.REDIS_PASSWORD,
    tls: {}, // Required for secure connections to Azure Redis
    retryStrategy: (times) => Math.min(times * 50, 2000),
  },
});

// Define job processing logic
ttsQueue.process(async (job) => {
  const { ttsRequestId, message, voice, useS3 } = job.data;

  try {
    const audioUrl = await processTTSRequest(ttsRequestId, message, voice, useS3);
    logger.info(`✅ TTS Request ${ttsRequestId} processed successfully.`);
    await db.query(
      'UPDATE tts_requests SET status = "completed", audio_url = ? WHERE id = ?',
      [audioUrl, ttsRequestId]
    );
    return audioUrl;
  } catch (error) {
    logger.error(`❌ TTS Request ${ttsRequestId} failed: ${error.message}`);
    await db.query('UPDATE tts_requests SET status = "failed" WHERE id = ?', [ttsRequestId]);
    throw error;
  }
});

// Add monitoring for queue events
ttsQueue.on('completed', (job, result) => {
  logger.info(`✅ Job completed. ID: ${job.id}, Result: ${result}`);
});

ttsQueue.on('failed', (job, error) => {
  logger.error(`❌ Job failed. ID: ${job.id}, Error: ${error.message}`);
});

module.exports = ttsQueue;
