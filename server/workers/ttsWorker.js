/*********************************************
 *  DEPENDENCIES
 ********************************************/
const Bull = require('bull');
const { processTTSRequest } = require('../services/ttsService');
const logger = require('../logger');
const db = require('../db'); // Import db connection properly

/*********************************************
 *  INITIALIZE REDIS CONNECTION WITH DEBUG LOGGING
 ********************************************/
// Validate Redis environment variables
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// Log Redis configuration
logger.debug(`Initializing Bull queue with Redis configuration:
  Host: ${REDIS_HOST}
  Port: ${REDIS_PORT}
  Password: ${REDIS_PASSWORD ? '********' : 'Not Set'}
`);

// Initialize the queue with Redis connection details
const ttsQueue = new Bull('ttsQueue', {
  redis: {
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    // Optional: Add more Redis options if needed
    // tls: {}, // If connecting to a secured Redis instance
  },
});

/*********************************************
 *  HANDLE QUEUE ERRORS
 ********************************************/
// Listen for global queue errors
ttsQueue.on('error', (error) => {
  logger.error(`Global Bull Queue Error: ${error.message}`, { error });
});

/*********************************************
 *  DEFINE THE PROCESSING FUNCTION WITH MAX DEBUG LOGGING
 ********************************************/
ttsQueue.process(async (job) => {
  const { ttsRequestId, message, voice, useS3 } = job.data;

  logger.debug(`Received job [ID: ${job.id}] with data:`, job.data);

  try {
    logger.info(`✅ Starting processing for TTS Request ID: ${ttsRequestId}`);

    // Process the TTS request (this should return the audio URL)
    const audioUrl = await processTTSRequest(ttsRequestId, message, voice, useS3);
    logger.info(`✅ Successfully processed TTS Request ID: ${ttsRequestId}, Audio URL: ${audioUrl}`);

    // After processing, update the status of the TTS request in the database to "completed"
    const updateQuery = 'UPDATE tts_requests SET status = "completed", audio_url = ? WHERE id = ?';
    const [updateResult] = await db.query(updateQuery, [audioUrl, ttsRequestId]);

    // Log database update result
    logger.debug(`Database Update Result for TTS Request ID ${ttsRequestId}:`, updateResult);

    if (updateResult.affectedRows === 0) {
      logger.warn(`⚠️ No records updated for TTS Request ID: ${ttsRequestId}. Possible missing entry.`);
    } else {
      logger.info(`✅ Successfully updated TTS Request ID: ${ttsRequestId} status to "completed" with Audio URL.`);
    }

    // Optionally, you can return additional information
    return { audioUrl, ttsRequestId };
  } catch (error) {
    logger.error(`❌ Error processing TTS Request ID: ${ttsRequestId} - ${error.message}`, { error });

    try {
      // Attempt to update the status to "failed" in the database
      const updateFailedQuery = 'UPDATE tts_requests SET status = "failed" WHERE id = ?';
      const [failedUpdateResult] = await db.query(updateFailedQuery, [ttsRequestId]);

      // Log database update result
      logger.debug(`Database Update (Failed) Result for TTS Request ID ${ttsRequestId}:`, failedUpdateResult);

      if (failedUpdateResult.affectedRows === 0) {
        logger.warn(`⚠️ No records updated to "failed" for TTS Request ID: ${ttsRequestId}. Possible missing entry.`);
      } else {
        logger.info(`✅ Successfully updated TTS Request ID: ${ttsRequestId} status to "failed".`);
      }
    } catch (dbError) {
      logger.error(`❌ Failed to update status to "failed" for TTS Request ID: ${ttsRequestId} - ${dbError.message}`, { dbError });
    }

    // Rethrow the error to let Bull handle retries based on job options
    throw error;
  }
});

/*********************************************
 *  ADD EVENT LISTENERS FOR BETTER MONITORING
 ********************************************/

// When a job is added to the queue
ttsQueue.on('added', (job) => {
  logger.debug(`🔄 Job Added to Queue [ID: ${job.id}]`, { job });
});

// When a job starts processing
ttsQueue.on('active', (job, jobPromise) => {
  logger.info(`▶️ Job Started [ID: ${job.id}]`);
});

// When a job completes successfully
ttsQueue.on('completed', (job, result) => {
  logger.info(`✅ Job Completed [ID: ${job.id}] with result:`, result);
});

// When a job fails
ttsQueue.on('failed', (job, err) => {
  logger.error(`❌ Job Failed [ID: ${job.id}] - Error: ${err.message}`, { error: err });
});

// When a job is retried
ttsQueue.on('stalled', (job) => {
  logger.warn(`⚠️ Job Stalled [ID: ${job.id}] and will be retried.`);
});

// Listen for global events like pause and resume
ttsQueue.on('paused', () => {
  logger.info('⏸️ Bull Queue Paused.');
});

ttsQueue.on('resumed', () => {
  logger.info('▶️ Bull Queue Resumed.');
});

/*********************************************
 *  EXPORT THE QUEUE
 ********************************************/
module.exports = ttsQueue;
