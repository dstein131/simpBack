// service/ttsService.js

const axios = require('axios');
const db = require('../db');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');

// Load environment variables
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = process.env.ELEVENLABS_API_URL || 'https://api.elevenlabs.io/v1/text-to-speech';
const AWS_REGION = process.env.AWS_REGION;
const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

// Initialize AWS S3 Client
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/*********************************************
 * Validate and Map Voice
 ********************************************/
const validateAndMapVoice = (voice) => {
  const DEFAULT_VOICE_ID = 'pqHfZKP75CvOlQylNhV4'; // Replace as needed
  logger.debug(`Mapping voice: ${voice}`);
  return voice.toLowerCase() === 'default' ? DEFAULT_VOICE_ID : voice;
};

/*********************************************
 * Generate TTS Audio
 ********************************************/
const generateTTS = async (text, voice) => {
  const validVoice = validateAndMapVoice(voice);

  try {
    logger.info(`Generating TTS for text: "${text}" with voice: "${validVoice}"`);
    const response = await axios.post(
      `${ELEVENLABS_API_URL}/${validVoice}/stream`,
      { text },
      {
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        responseType: 'arraybuffer',
        timeout: 30000, // 30 seconds timeout
      }
    );
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.detail?.message || error.message || 'Failed to generate TTS';
    logger.error(`❌ TTS Generation Error: ${errorMessage}`);
    throw new Error(errorMessage);
  }
};

/*********************************************
 * Save TTS Audio to S3
 ********************************************/
const saveTTSAudioToS3 = async (ttsRequestId, audioData) => {
  const uniqueFileName = `${ttsRequestId}-${uuidv4()}.mp3`;

  try {
    logger.info(`Saving TTS audio to S3: ${uniqueFileName}`);
    const command = new PutObjectCommand({
      Bucket: AWS_S3_BUCKET_NAME,
      Key: `tts_audios/${uniqueFileName}`,
      Body: audioData,
      ContentType: 'audio/mpeg',
    });
    await s3Client.send(command);

    const audioUrl = `https://${AWS_S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/tts_audios/${uniqueFileName}`;
    logger.info(`✅ Audio saved to S3: ${audioUrl}`);
    return audioUrl;
  } catch (error) {
    logger.error(`❌ Error uploading TTS audio to S3: ${error.message}`);
    throw new Error('Failed to upload TTS audio to S3.');
  }
};

/*********************************************
 * Update TTS Request in Database
 ********************************************/
const updateTTSRequestInDB = async (ttsRequestId, status, audioUrl = null) => {
  try {
    logger.debug(`Updating TTS request ID ${ttsRequestId} with status: ${status}`);
    await db.query(
      'UPDATE tts_requests SET status = ?, processed_at = NOW(), audio_url = ? WHERE id = ?',
      [status, audioUrl, ttsRequestId]
    );
    logger.info(`✅ TTS request ID ${ttsRequestId} updated successfully.`);
  } catch (error) {
    logger.error(`❌ Error updating TTS request ID: ${ttsRequestId} - ${error.message}`);
    throw new Error('Failed to update TTS request in the database.');
  }
};


/*********************************************
 * Process TTS Request
 ********************************************/
const processTTSRequest = async (ttsRequestId, message, voice, useS3 = true) => {
  try {
    logger.info(`Processing TTS request ID: ${ttsRequestId}`);
    const audioData = await generateTTS(message, voice);
    const audioUrl = useS3
      ? await saveTTSAudioToS3(ttsRequestId, audioData)
      : `/tts_audios/${ttsRequestId}-${uuidv4()}.mp3`; // For local storage

    await updateTTSRequestInDB(ttsRequestId, 'completed', audioUrl);
    logger.info(`✅ TTS request ID ${ttsRequestId} processed successfully with audio URL: ${audioUrl}`);
    return audioUrl;
  } catch (error) {
    await updateTTSRequestInDB(ttsRequestId, 'failed');
    logger.error(`❌ Failed to process TTS request ID: ${ttsRequestId}`);
    throw error;
  }
};

/*********************************************
 * Export Functions
 ********************************************/
module.exports = { processTTSRequest, generateTTS };
