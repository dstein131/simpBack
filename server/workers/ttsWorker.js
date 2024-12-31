// workers/ttsWorker.js

const ttsQueue = require('../queues/ttsQueue'); // Import the existing Bull queue
const { processTTSRequest } = require('../services/ttsService');
const logger = require('../logger');

/*********************************************
 *  DEFINE JOB PROCESSING LOGIC
 ********************************************/
ttsQueue.process(async (job) => {
  const { ttsRequestId, message, voice, useS3 } = job.data;

  logger.debug(`Processing job [ID: ${job.id}] with data:`, job.data);

  try {
    logger.info(`Starting TTS processing for Request ID: ${ttsRequestId}`);
    const audioUrl = await processTTSRequest(ttsRequestId, message, voice, useS3);
    logger.info(`✅ TTS Request ${ttsRequestId} processed successfully.`);
    logger.debug(`Audio URL generated for TTS Request ID ${ttsRequestId}: ${audioUrl}`);

    // Bull job result: Return audioUrl as the result of the job
    return audioUrl;
  } catch (error) {
    logger.error(`❌ Error processing TTS Request ${ttsRequestId}: ${error.message}`);
    throw error; // This will trigger Bull's retry mechanism based on job options
  }
});

/*********************************************
 *  ADD EVENT LISTENERS FOR JOB EVENTS
 ********************************************/
ttsQueue.on('added', (job) => {
  logger.debug(`🔄 Job added to queue. ID: ${job.id}, Data:`, job.data);
  logger.info(`🔄 Job added to queue. ID: ${job.id}`);
});

ttsQueue.on('active', (job) => {
  logger.debug(`▶️ Job started. ID: ${job.id}`);
  logger.info(`▶️ Job started. ID: ${job.id}`);
});

ttsQueue.on('completed', (job, result) => {
  logger.debug(`✅ Job completed. ID: ${job.id}, Result: ${result}`);
  logger.info(`✅ Job completed. ID: ${job.id}, Result: ${result}`);
});

ttsQueue.on('failed', (job, error) => {
  logger.debug(`❌ Job failed. ID: ${job.id}, Error: ${error.message}`);
  logger.error(`❌ Job failed. ID: ${job.id}, Error: ${error.message}`);
});

ttsQueue.on('stalled', (job) => {
  logger.debug(`⚠️ Job stalled. ID: ${job.id}`);
  logger.warn(`⚠️ Job stalled. ID: ${job.id}`);
});

ttsQueue.on('paused', () => {
  logger.debug('⏸️ Queue paused.');
  logger.info('⏸️ Queue paused.');
});

ttsQueue.on('resumed', () => {
  logger.debug('▶️ Queue resumed.');
  logger.info('▶️ Queue resumed.');
});

ttsQueue.on('error', (error) => {
  logger.debug(`❌ Queue error: ${error.message}`);
  logger.error(`❌ Queue error: ${error.message}`);
});
