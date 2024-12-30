const db = require('../db'); // Import the database connection
const logger = require('../logger'); // For error handling
const ttsQueue = require('../queues/ttsQueue');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');
const util = require('util'); // Add this import

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
/**
 * Submit a TTS Request
 * POST /api/tts
 */
const submitTTSRequest = async (req, res) => {
  try {
    const { message, voice, userId, creatorId } = req.body;

    console.log('Received Request:', { message, voice, userId, creatorId });

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required.' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    if (!voice) {
      return res.status(400).json({ error: 'Voice selection is required.' });
    }

    if (!creatorId) {
      return res.status(400).json({ error: 'Creator ID is required.' });
    }

    // Validate the user ID exists in the database
    const [userExists] = await db.query('SELECT id FROM users WHERE id = ?', [userId]);

    if (userExists.length === 0) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    // Validate the creator ID exists in the database
    const [creatorExists] = await db.query('SELECT id FROM creators WHERE id = ?', [creatorId]);

    if (creatorExists.length === 0) {
      return res.status(400).json({ error: 'Invalid creator ID.' });
    }

    // Insert the TTS request into the database
    const [result] = await db.query(
      'INSERT INTO tts_requests (user_id, creator_id, status, voice) VALUES (?, ?, ?, ?)',
      [userId, creatorId, 'pending', voice]
    );

    const ttsRequestId = result.insertId;
    console.log('TTS Request Created with ID:', ttsRequestId);

    // Ensure the status is updated to 'processing' after insertion
    await db.query('UPDATE tts_requests SET status = "processing" WHERE id = ?', [ttsRequestId]);

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
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      }
    );

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
      { id: 's2wvuS7SwITYg8dqsJdn', name: 'Old Italian Grandpa' },
      { id: '0AUs737h1lTdWscPWdcj', name: 'Luminessence - Light Mirror' },
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
    const { id } = req.params;
    const { status, audioUrl } = req.body;

    // Validate status
    const validStatuses = ['pending', 'processing', 'completed', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status provided.' });
    }

    // Fetch the TTS request to check if it exists
    const [ttsRequests] = await db.query('SELECT id FROM tts_requests WHERE id = ?', [id]);

    if (ttsRequests.length === 0) {
      return res.status(404).json({ error: 'TTS request not found.' });
    }

    // Prepare the update query
    const updateQuery = 'UPDATE tts_requests SET status = ?, audio_url = ? WHERE id = ?';
    const updateValues = [status, audioUrl || null, id];

    // Update the TTS request in the database
    await db.query(updateQuery, updateValues);

    console.log(`TTS Request ID ${id} status updated to ${status}`);

    res.status(200).json({
      message: `TTS request ${status} successfully.`,
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
    const userId = req.user.id;

    // Fetch TTS requests for the logged-in user from the database
    const [ttsRequests] = await db.query(
      'SELECT id AS ttsRequestId, status, processed_at, audio_url, voice FROM tts_requests WHERE user_id = ?',
      [userId]
    );

    // Respond with the TTS requests
    res.status(200).json(ttsRequests);
  } catch (error) {
    logger.error('❌ Error in getTTSRequests:', error);
    res.status(500).json({ error: 'Failed to fetch TTS requests.' });
  }
};

/**
 * Get TTS Requests by Creator
 * GET /api/tts/creator/:creatorId
 */
const getTTSRequestsByCreator = async (req, res) => {
  try {
    const { creatorId } = req.params;
    const requestingUser = req.user; // Assuming `req.user` is populated by your auth middleware

    console.log(`User ${requestingUser.id} is fetching TTS requests for Creator ID: ${creatorId}`);

    // Validate creatorId
    if (!creatorId) {
      return res.status(400).json({ error: 'Creator ID is required.' });
    }

    // Check if the requesting user is the creator or has admin privileges
    // Assuming `requestingUser.role` exists and 'admin' is a possible role
    if (requestingUser.role !== 'admin' && requestingUser.id !== parseInt(creatorId, 10)) {
      return res.status(403).json({ error: 'Forbidden: You do not have access to these resources.' });
    }

    // Optional: Validate the creator exists
    const [creatorExists] = await db.query('SELECT id FROM creators WHERE id = ?', [creatorId]);
    if (creatorExists.length === 0) {
      return res.status(404).json({ error: 'Creator not found.' });
    }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Fetch total count for pagination
    const [countResult] = await db.query(
      'SELECT COUNT(*) AS total FROM tts_requests WHERE creator_id = ?',
      [creatorId]
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Fetch TTS requests with pagination
    const [ttsRequests] = await db.query(
      `SELECT 
         tr.id AS ttsRequestId, 
         tr.user_id AS userId, 
         tr.message,        -- Added message field
         tr.status, 
         tr.processed_at, 
         tr.audio_url AS audioUrl, 
         tr.voice,
         u.username AS userName
       FROM tts_requests tr
       JOIN users u ON tr.user_id = u.id
       WHERE tr.creator_id = ?
       ORDER BY tr.created_at DESC
       LIMIT ? OFFSET ?`,
      [creatorId, limit, offset]
    );

    res.status(200).json({
      page,
      limit,
      total,
      totalPages,
      ttsRequests,
    });
  } catch (error) {
    logger.error('❌ Error in getTTSRequestsByCreator:', error);
    res.status(500).json({ error: 'Failed to fetch TTS requests for the creator.' });
  }
};




// Export controller functions
module.exports = {
  submitTTSRequest,
  getTTSRequests,
  updateTTSRequestStatus,
  getAvailableVoices: getAvailableVoicesController,
  downloadTTSAudio,
  getTTSRequestsByCreator,
};
