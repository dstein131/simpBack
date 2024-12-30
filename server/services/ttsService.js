const axios = require('axios');
const db = require('../db');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = process.env.ELEVENLABS_API_URL || 'https://api.elevenlabs.io/v1/text-to-speech';
const AWS_REGION = process.env.AWS_REGION;
const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const validateAndMapVoice = (voice) => {
  const DEFAULT_VOICE_ID = 'pqHfZKP75CvOlQylNhV4'; // Replace as needed
  return voice.toLowerCase() === 'default' ? DEFAULT_VOICE_ID : voice;
};

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

const saveTTSAudioToS3 = async (ttsRequestId, audioData) => {
  const uniqueFileName = `${ttsRequestId}-${uuidv4()}.mp3`;

  try {
    const command = new PutObjectCommand({
      Bucket: AWS_S3_BUCKET_NAME,
      Key: `tts_audios/${uniqueFileName}`,
      Body: audioData,
      ContentType: 'audio/mpeg',
    });
    await s3Client.send(command);

    const audioUrl = `https://${AWS_S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/tts_audios/${uniqueFileName}`;
    return audioUrl;
  } catch (error) {
    logger.error(`❌ Error uploading TTS audio to S3: ${error.message}`);
    throw new Error('Failed to upload TTS audio to S3.');
  }
};

const updateTTSRequestInDB = async (ttsRequestId, status, audioUrl = null) => {
  try {
    await db.query(
      'UPDATE tts_requests SET status = ?, processed_at = NOW(), audio_url = ? WHERE id = ?',
      [status, audioUrl, ttsRequestId]
    );
  } catch (error) {
    logger.error(`❌ Error updating TTS request ID: ${ttsRequestId} - ${error.message}`);
    throw new Error('Failed to update TTS request in the database.');
  }
};

const processTTSRequest = async (ttsRequestId, message, voice, useS3 = true) => {
  try {
    const audioData = await generateTTS(message, voice);
    const audioUrl = useS3
      ? await saveTTSAudioToS3(ttsRequestId, audioData)
      : `/tts_audios/${ttsRequestId}-${uuidv4()}.mp3`;

    await updateTTSRequestInDB(ttsRequestId, 'processed', audioUrl);
    logger.info(`✅ TTS Request ID ${ttsRequestId} processed successfully.`);
    return audioUrl;
  } catch (error) {
    await updateTTSRequestInDB(ttsRequestId, 'failed');
    throw error;
  }
};

module.exports = { processTTSRequest, generateTTS };
