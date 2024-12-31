const Bull = require('bull');
const { processTTSRequest } = require('../services/ttsService');
const logger = require('../logger');
const debug = require('debug')('ttsQueue'); // Debugging
const db = require('../db');

// Initialize Redis with connection options
const ttsQueue = new Bull('ttsQueue', {
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10),
    password: process.env.REDIS_PASSWORD,
    tls: {}, // Required for secure connections to Azure Redis
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000); // Exponential backoff
      logger.warn(`Redis connection retry in ${delay}ms. Attempt: ${times}`);
      return delay;
    },
  },
});

// Define job processing logic
ttsQueue.process(async (job) => {
  const { ttsRequestId, message, voice, useS3 } = job.data;

  debug(`Processing job [ID: ${job.id}] with data:`, job.data);

  try {
    debug(`Starting TTS processing for Request ID: ${ttsRequestId}`);
    const audioUrl = await processTTSRequest(ttsRequestId, message, voice, useS3);
    logger.info(`✅ TTS Request ${ttsRequestId} processed successfully.`);
    debug(`Audio URL generated for TTS Request ID ${ttsRequestId}: ${audioUrl}`);

    const updateQuery = 'UPDATE tts_requests SET status = "completed", audio_url = ? WHERE id = ?';
    const [updateResult] = await db.query(updateQuery, [audioUrl, ttsRequestId]);
    debug(`Database updated for TTS Request ID ${ttsRequestId}. Update result:`, updateResult);

    if (updateResult.affectedRows === 0) {
      logger.warn(`⚠️ No rows updated for TTS Request ID: ${ttsRequestId}.`);
    }

    return audioUrl;
  } catch (error) {
    logger.error(`❌ Error processing TTS Request ${ttsRequestId}: ${error.message}`);
    debug('Error details:', error);

    try {
      const updateFailedQuery = 'UPDATE tts_requests SET status = "failed" WHERE id = ?';
      const [failedUpdateResult] = await db.query(updateFailedQuery, [ttsRequestId]);
      debug(`Database updated to "failed" for TTS Request ID ${ttsRequestId}. Update result:`, failedUpdateResult);

      if (failedUpdateResult.affectedRows === 0) {
        logger.warn(`⚠️ No rows updated to "failed" for TTS Request ID: ${ttsRequestId}.`);
      }
    } catch (dbError) {
      logger.error(`❌ Failed to update status to "failed" for TTS Request ID: ${ttsRequestId} - ${dbError.message}`);
      debug('Database update error details:', dbError);
    }

    throw error;
  }
});

// Add monitoring for queue events
ttsQueue.on('added', (job) => {
  debug(`🔄 Job added to queue. ID: ${job.id}, Data:`, job.data);
  logger.info(`🔄 Job added to queue. ID: ${job.id}`);
});

ttsQueue.on('active', (job) => {
  debug(`▶️ Job started. ID: ${job.id}`);
  logger.info(`▶️ Job started. ID: ${job.id}`);
});

ttsQueue.on('completed', (job, result) => {
  debug(`✅ Job completed. ID: ${job.id}, Result: ${result}`);
  logger.info(`✅ Job completed. ID: ${job.id}, Result: ${result}`);
});

ttsQueue.on('failed', (job, error) => {
  debug(`❌ Job failed. ID: ${job.id}, Error: ${error.message}`);
  logger.error(`❌ Job failed. ID: ${job.id}, Error: ${error.message}`);
});

ttsQueue.on('stalled', (job) => {
  debug(`⚠️ Job stalled. ID: ${job.id}`);
  logger.warn(`⚠️ Job stalled. ID: ${job.id}`);
});

ttsQueue.on('paused', () => {
  debug('⏸️ Queue paused.');
  logger.info('⏸️ Queue paused.');
});

ttsQueue.on('resumed', () => {
  debug('▶️ Queue resumed.');
  logger.info('▶️ Queue resumed.');
});

ttsQueue.on('error', (error) => {
  debug(`❌ Queue error: ${error.message}`);
  logger.error(`❌ Queue error: ${error.message}`);
});

module.exports = ttsQueue;
