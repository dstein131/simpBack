// controllers/ttsController.js

const db = require('../db'); // Import the database connection
const logger = require('../logger'); // For logging
const ttsQueue = require('../queues/ttsQueue');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');
const util = require('util'); // For promisifying functions

// Initialize AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Submit a TTS Request
 * POST /api/tts
 */
const submitTTSRequest = async (req, res) => {
  try {
    const { message, voice, userId, creatorId } = req.body;

    console.log('Received Request:', { message, voice, userId, creatorId });

    // Validate inputs
    if (!userId || !message || !voice || !creatorId) {
      return res.status(400).json({
        error: 'All fields (userId, message, voice, creatorId) are required.',
      });
    }

    // Validate the user ID exists
    const [userExists] = await db.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (userExists.length === 0) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    // Validate the creator ID exists
    const [creatorExists] = await db.query('SELECT id FROM creators WHERE id = ?', [creatorId]);
    if (creatorExists.length === 0) {
      return res.status(400).json({ error: 'Invalid creator ID.' });
    }

    // Insert the TTS request into the database
    const [result] = await db.query(
      'INSERT INTO tts_requests (user_id, creator_id, message, status, voice) VALUES (?, ?, ?, ?, ?)',
      [userId, creatorId, message, 'pending', voice]
    );

    const ttsRequestId = result.insertId;
    console.log(`TTS Request Created with ID: ${ttsRequestId}`);

    // Update the status to 'processing' after insertion
    await db.query('UPDATE tts_requests SET status = "processing" WHERE id = ?', [ttsRequestId]);

    // Emit socket event to notify the creator's room of the new TTS request
    if (req.app.io) {
      req.app.io.to(`creator-room-${creatorId}`).emit('tts-request', {
        ttsRequestId,
        message,
        voice,
        userId,
        creatorId,
        status: 'pending',
      });
      console.log(`Socket event emitted to creator-room-${creatorId} for TTS Request ID ${ttsRequestId}`);
    }

    // Enqueue the TTS processing job
    await ttsQueue.add(
      {
        ttsRequestId,
        message,
        voice,
        useS3: true,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }
    );

    // Respond with success
    res.status(201).json({
      message: 'TTS request submitted successfully!',
      ttsRequestId,
    });
  } catch (error) {
    console.error('❌ Error in submitTTSRequest:', error);
    res.status(500).json({ error: 'Failed to submit TTS request.' });
  }
};




/**
 * Download TTS Audio
 * GET /api/tts/download/:id
 */
const downloadTTSAudio = async (req, res) => {
  try {
    const { id } = req.params; // TTS request ID
    const userId = req.query.userId; // User ID from query parameters

    console.log(`Requesting download for TTS request ID: ${id}, User ID: ${userId}`);

    // Validate userId
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required.' });
    }

    // Fetch TTS request details from the database
    const [ttsRequests] = await db.query(
      'SELECT audio_url, status FROM tts_requests WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (ttsRequests.length === 0) {
      return res.status(404).json({ error: 'TTS request not found or not associated with this user.' });
    }

    const { audio_url: audioUrl, status } = ttsRequests[0];

    // Ensure TTS processing is completed
    if (status !== 'completed') {
      return res.status(400).json({ error: 'Audio file is still being processed.' });
    }

    if (!audioUrl) {
      return res.status(400).json({ error: 'Audio file URL not available.' });
    }

    // Parse the audioUrl to extract bucket and key
    const s3Url = new URL(audioUrl);
    const bucketName = s3Url.host.split('.')[0]; // Extract bucket name from URL host
    const key = decodeURIComponent(s3Url.pathname.slice(1)); // Remove leading slash and decode

    console.log(`Fetching audio file from S3 bucket: ${bucketName}, key: ${key}`);

    // Prepare the S3 command to fetch the object
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await s3Client.send(command);

    // Stream the S3 file to the client
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="audio-${id}.mp3"`);
    response.Body.pipe(res);

    console.log(`Audio file for TTS request ID ${id} served successfully.`);
  } catch (error) {
    console.error('❌ Error in downloadTTSAudio:', error);
    res.status(500).json({ error: 'Failed to download TTS audio.' });
  }
};



/**
 * Get Available Voices
 * GET /api/tts/voices
 */
const getAvailableVoicesController = async (req, res) => {
  try {
    const voices = [
      { id: 's2wvuS7SwITYg8dqsJdn', name: 'Old Italian Man' },
      { id: '2xnESBHcLHCxcxvOM2bJ', name: 'Middle-Aged British Man' },
      { id: 'rl410D8bMOfIkD4QyPae', name: 'Midwestern American Man' },
      { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill' },
      { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
    ];
    res.status(200).json({ voices });
  } catch (error) {
    logger.error('❌ Error in getAvailableVoicesController:', error);
    res.status(500).json({ error: 'Failed to fetch available voices.' });
  }
};

/**
 * Update TTS Request Status
 * PUT /api/tts/:id/status
 */
const updateTTSRequestStatus = async (req, res) => {
  try {
    const { id } = req.params; // TTS Request ID
    const { status, audioUrl } = req.body; // New status and optional audio URL

    console.log(`Updating TTS Request ID ${id} with status ${status} and audio URL ${audioUrl || 'None'}`);

    // Validate status
    const validStatuses = ['pending', 'processing', 'completed', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status provided.' });
    }

    // Fetch the TTS request to check if it exists
    const [ttsRequests] = await db.query('SELECT * FROM tts_requests WHERE id = ?', [id]);

    if (ttsRequests.length === 0) {
      console.error(`TTS Request ID ${id} not found.`);
      return res.status(404).json({ error: 'TTS request not found.' });
    }

    const ttsRequest = ttsRequests[0];

    // Prepare the update query
    const updateQuery = 'UPDATE tts_requests SET status = ?, audio_url = ? WHERE id = ?';
    const updateValues = [status, audioUrl || null, id];

    // Update the TTS request in the database
    await db.query(updateQuery, updateValues);

    console.log(`TTS Request ID ${id} successfully updated to status ${status}`);

    // Emit socket event to notify the creator's room about the status change
    if (req.app.io) {
      try {
        req.app.io.to(`creator-room-${ttsRequest.creator_id}`).emit('tts-request', {
          ttsRequestId: id,
          status,
          audioUrl,
          message: ttsRequest.message,
          voice: ttsRequest.voice,
          creatorId: ttsRequest.creator_id,
          userId: ttsRequest.user_id,
        });
        console.log(`Socket event emitted to creator-room-${ttsRequest.creator_id} for TTS Request ID ${id}`);
      } catch (socketError) {
        console.error(`❌ Failed to emit socket event for TTS Request ID ${id}:`, socketError);
      }
    } else {
      console.warn('⚠️ req.app.io is undefined. Socket event not emitted.');
    }

    // Respond with a success message
    res.status(200).json({
      message: `TTS request ${status} successfully updated.`,
    });
  } catch (error) {
    console.error('❌ Error in updateTTSRequestStatus:', error);
    res.status(500).json({ error: 'Failed to update TTS request status.' });
  }
};



/**
 * Get TTS Requests for Logged-in User
 * GET /api/tts
 */
const getTTSRequests = async (req, res) => {
  try {
    const userId = req.user.id; // Derived from authentication middleware

    console.log(`User ID: ${userId} is fetching their TTS requests.`);

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Fetch total count for pagination
    const [countResult] = await db.query(
      'SELECT COUNT(*) AS total FROM tts_requests WHERE user_id = ?',
      [userId]
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Fetch TTS requests with pagination
    const [ttsRequests] = await db.query(
      `SELECT 
         tr.id AS ttsRequestId, 
         tr.status, 
         tr.processed_at, 
         tr.audio_url AS audioUrl, 
         tr.voice,
         tr.message,
         c.name AS creatorName
       FROM tts_requests tr
       JOIN creators c ON tr.creator_id = c.id
       WHERE tr.user_id = ?
       ORDER BY tr.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    res.status(200).json({
      page,
      limit,
      total,
      totalPages,
      ttsRequests,
    });
  } catch (error) {
    console.error('❌ Error in getTTSRequests:', error);
    logger.error('❌ Error in getTTSRequests:', error);
    res.status(500).json({ error: 'Failed to fetch TTS requests.' });
  }
};


const getTTSRequestsByCreator = async (req, res) => {
  try {
    const { userId, creatorId, role, page = 1, limit = 50 } = req.query;

    logger.info(`User ID: ${userId}, Role: ${role}, Creator ID: ${creatorId} requested TTS data`);

    // Pagination
    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 50;
    const offset = (parsedPage - 1) * parsedLimit;

    // Fetch total count for pagination
    const [countResult] = await db.query(
      'SELECT COUNT(*) AS total FROM tts_requests WHERE creator_id = ?',
      [creatorId]
    );
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / parsedLimit);

    // Fetch TTS requests with pagination
    const [ttsRequests] = await db.query(
      `SELECT 
         tr.id AS ttsRequestId, 
         tr.user_id AS userId, 
         IFNULL(NULLIF(TRIM(tr.message), ''), 'No message provided') AS message, 
         tr.status, 
         tr.processed_at, 
         tr.audio_url AS audioUrl, 
         tr.voice,
         u.username AS userName
       FROM tts_requests tr
       JOIN users u ON tr.user_id = u.id
       WHERE tr.creator_id = ?
       ORDER BY tr.processed_at DESC
       LIMIT ? OFFSET ?`,
      [creatorId, parsedLimit, offset]
    );

    res.status(200).json({
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages,
      ttsRequests,
    });
  } catch (error) {
    console.error('❌ Error in getTTSRequestsByCreator:', error);
    logger.error('❌ Error in getTTSRequestsByCreator:', error);
    res.status(500).json({ error: 'Failed to fetch TTS requests for the creator.' });
  }
};





// Export controller functions
module.exports = {
  submitTTSRequest,
  downloadTTSAudio,
  getAvailableVoices: getAvailableVoicesController,
  updateTTSRequestStatus,
  getTTSRequests,
  getTTSRequestsByCreator,
};
