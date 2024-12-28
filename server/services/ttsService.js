const axios = require('axios');
const db = require('../db');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const logger = require('../logger'); // Ensure you have a logger setup

/*********************************************
 *  LOAD ENVIRONMENT VARIABLES
 ********************************************/
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
 *  VOICE ID MAPPING
 ********************************************/
const DEFAULT_VOICE_ID = 'pqHfZKP75CvOlQylNhV4'; // Replace with your preferred default voice ID

const validateAndMapVoice = (voice) => {
  if (voice.toLowerCase() === 'default') {
    logger.info(`Mapping 'default' voice to '${DEFAULT_VOICE_ID}'`);
    return DEFAULT_VOICE_ID;
  }
  return voice;
};

/*********************************************
 *  TTS GENERATION
 ********************************************/
const generateTTS = async (text, voice) => {
  const validVoice = validateAndMapVoice(voice);

  try {
    const response = await axios.post(
      `${ELEVENLABS_API_URL}/${validVoice}/stream`,
      { text },
      {
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        responseType: 'arraybuffer',
        timeout: 30000,
      }
    );
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.detail?.message || 'Failed to generate TTS.';
    logger.error('❌ Error generating TTS:', errorMessage);
    throw new Error(errorMessage);
  }
};

/*********************************************
 *  AUDIO STORAGE
 ********************************************/
const saveTTSAudioToS3 = async (ttsRequestId, audioData) => {
  try {
    const uniqueFileName = `${ttsRequestId}-${uuidv4()}.mp3`;
    const command = new PutObjectCommand({
      Bucket: AWS_S3_BUCKET_NAME,
      Key: `tts_audios/${uniqueFileName}`,
      Body: audioData,
      ContentType: 'audio/mpeg',
    });

    await s3Client.send(command);
    return `https://${AWS_S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/tts_audios/${uniqueFileName}`;
  } catch (error) {
    logger.error(`❌ Error uploading TTS audio to S3: ${error.message}`);
    throw new Error('Failed to upload TTS audio to S3.');
  }
};

/*********************************************
 *  DATABASE OPERATIONS
 ********************************************/
const updateTTSRequestInDB = async (ttsRequestId, status, audioUrl = null) => {
  try {
    await db.query(
      'UPDATE tts_requests SET status = ?, processed_at = NOW(), audio_url = ? WHERE id = ?',
      [status, audioUrl, ttsRequestId]
    );
  } catch (error) {
    logger.error(`❌ Error updating TTS request (ID: ${ttsRequestId}):`, error.message);
    throw new Error('Failed to update TTS request in the database.');
  }
};


/*********************************************
 *  PROCESSING FUNCTION
 ********************************************/
const processTTSRequest = async (ttsRequestId, message, voice, useS3 = true) => {
  try {
    const audioData = await generateTTS(message, voice);
    const audioUrl = useS3
      ? await saveTTSAudioToS3(ttsRequestId, audioData)
      : `/tts_audios/${ttsRequestId}-${uuidv4()}.mp3`; // Adjust for local storage

    await updateTTSRequestInDB(ttsRequestId, 'processed', audioUrl);
    logger.info(`✅ TTS Request ${ttsRequestId} processed successfully.`);
    return audioUrl;
  } catch (error) {
    await updateTTSRequestInDB(ttsRequestId, 'failed');
    throw error;
  }
};

const getAvailableVoices = async () => [
  { id: '0AUs737h1lTdWscPWdcj', name: 'Luminessence - Light Mirror' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
];

module.exports = {
  generateTTS,
  processTTSRequest,
  getAvailableVoices,
};
