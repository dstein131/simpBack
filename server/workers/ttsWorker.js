const Bull = require('bull');
const { processTTSRequest } = require('../services/ttsService');
const logger = require('../logger');
const db = require('../db'); // Import db connection properly

// Initialize the queue
const ttsQueue = new Bull('ttsQueue', {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
});

// Define the processing function
ttsQueue.process(async (job) => {
  const { ttsRequestId, message, voice, useS3 } = job.data;

  try {
    // Process the TTS request (this will return the audio URL)
    const audioUrl = await processTTSRequest(ttsRequestId, message, voice, useS3);
    logger.info(`✅ Successfully processed TTS Request ID: ${ttsRequestId}`);

    // After processing, update the status of the TTS request in the database to "completed"
    const updateQuery = 'UPDATE tts_requests SET status = "completed", audio_url = ? WHERE id = ?';
    await db.query(updateQuery, [audioUrl, ttsRequestId]); // Updating with the generated audio URL

    logger.info(`✅ Successfully updated TTS Request ID: ${ttsRequestId} status to completed with audio URL`);

    // Return the audio URL as the result of the job
    return { audioUrl };
  } catch (error) {
    // In case of failure, update the status to "failed" and log the error
    const updateQuery = 'UPDATE tts_requests SET status = "failed" WHERE id = ?';
    await db.query(updateQuery, [ttsRequestId]); // Update status to failed
    logger.error(`❌ Failed to process TTS Request ID: ${ttsRequestId} - ${error.message}`);

    throw error; // Bull will handle retries based on the job options
  }
});


// Optional: Add event listeners for better monitoring
ttsQueue.on('completed', (job, result) => {
  logger.info(`Job completed with result ${result ? result.audioUrl : 'no audio URL'}`);
});

ttsQueue.on('failed', (job, err) => {
  logger.error(`Job failed with error ${err.message}`);
});

module.exports = ttsQueue;
