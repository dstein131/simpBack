// controllers/ttsController.js

const db = require('../db'); // Import the database connection
const logger = require('../logger'); // For logging
const ttsQueue = require('../queues/ttsQueue');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

/**
 * Submit a TTS Request
 * POST /api/tts
 */
const submitTTSRequest = async (req, res) => {
  try {
    const { message, voice, userId, creatorId } = req.body;

    logger.info('Received TTS Request:', { message, voice, userId, creatorId });

    // Validate input fields
    if (!userId || !message || !voice || !creatorId) {
      logger.warn('Missing required fields in TTS Request:', { message, voice, userId, creatorId });
      return res.status(400).json({
        error: 'All fields (userId, message, voice, creatorId) are required.',
      });
    }

    // Check if the user exists
    const [userExists] = await db.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (userExists.length === 0) {
      logger.warn(`Invalid user ID: ${userId}`);
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    // Check if the creator exists
    const [creatorExists] = await db.query('SELECT id FROM creators WHERE id = ?', [creatorId]);
    if (creatorExists.length === 0) {
      logger.warn(`Invalid creator ID: ${creatorId}`);
      return res.status(400).json({ error: 'Invalid creator ID.' });
    }

    // Insert the TTS request into the database with 'pending' status
    const [result] = await db.query(
      'INSERT INTO tts_requests (user_id, creator_id, message, status, voice) VALUES (?, ?, ?, ?, ?)',
      [userId, creatorId, message, 'pending', voice]
    );

    const ttsRequestId = result.insertId;
    logger.info(`TTS Request Created with ID: ${ttsRequestId}`);

    // Update the status to 'processing'
    await db.query('UPDATE tts_requests SET status = "processing" WHERE id = ?', [ttsRequestId]);

    // Emit a socket event for 'processing' status
    if (req.app.io) {
      const eventData = {
        ttsRequestId,
        message,
        voice,
        userId,
        creatorId,
        status: 'processing',
      };
      req.app.io.to(`creator-room-${creatorId}`).emit('tts-request', eventData);
      logger.info(
        `Socket event emitted to creator-room-${creatorId} for TTS Request ID ${ttsRequestId}:`,
        eventData
      );
    }

    // Add the TTS processing job to the queue
    await ttsQueue.add(
      { ttsRequestId, message, voice, useS3: true },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
    );
    logger.info(`TTS Request ID ${ttsRequestId} added to the processing queue.`);

    // Send response
    if (!res.headersSent) {
      return res.status(201).json({
        message: 'TTS request submitted successfully!',
        ttsRequestId,
      });
    }
  } catch (error) {
    logger.error('❌ Error in submitTTSRequest:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to submit TTS request.' });
    }
  }
};

/**
 * Download TTS Audio
 * GET /api/tts/download/:id
 */
const downloadTTSAudio = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId;

    logger.info(`Received download request for TTS ID: ${id}, User ID: ${userId}`);

    if (!userId) {
      logger.warn('User ID is missing in download request.');
      return res.status(400).json({ error: 'User ID is required.' });
    }

    const [ttsRequests] = await db.query(
      'SELECT audio_url, status FROM tts_requests WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (ttsRequests.length === 0) {
      logger.warn(`TTS request not found or not associated with user ID: ${userId} for TTS ID: ${id}`);
      return res.status(404).json({ error: 'TTS request not found or not associated with this user.' });
    }

    const { audio_url: audioUrl, status } = ttsRequests[0];
    logger.info(`TTS request found: ID: ${id}, Status: ${status}, Audio URL: ${audioUrl}`);

    if (status !== 'completed') {
      logger.info(`TTS request ID ${id} is still being processed.`);
      return res.status(202).set('Retry-After', '5').json({
        message: 'Audio file is still being processed. Please retry after 5 seconds.',
      });
    }

    if (!audioUrl) {
      logger.warn(`Audio URL is not available for TTS request ID: ${id}`);
      return res.status(400).json({ error: 'Audio file URL not available.' });
    }

    const s3Url = new URL(audioUrl);
    const bucketName = s3Url.host.split('.')[0];
    const key = decodeURIComponent(s3Url.pathname.slice(1));

    logger.info(`Preparing to download audio from S3. Bucket: ${bucketName}, Key: ${key}`);

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const s3Response = await s3Client.send(command);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="audio-${id}.mp3"`);

    s3Response.Body.pipe(res).on('error', (err) => {
      logger.error('Error streaming audio file:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming audio file.' });
      }
    });

    logger.info(`Audio file streaming initiated for TTS request ID: ${id}`);
  } catch (error) {
    logger.error('Error in downloadTTSAudio:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download TTS audio.' });
    }
  }
};

/**
 * Get Available Voices
 * GET /api/tts/voices
 */
const getAvailableVoicesController = async (req, res) => {
  try {
    const voices = [
      { id: 'sDSBbBr0YrSbCDpcIuFZ', name: 'Joey C' },
      { id: 'fDcUY6KGYmGCzhp8Ozg4', name: 'Quadfather' },
      { id: '1RcwTpiWrRYrRDK2Tkeu', name: 'Sam Hyde' },
      { id: 's2wvuS7SwITYg8dqsJdn', name: 'Old Italian Man' },
      { id: '3DxWrjC62YRLoXiYBGB0', name: 'Evil Orc' },
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
    const { id } = req.params;
    const { status, audioUrl } = req.body;

    logger.info(`Received request to update TTS Request ID ${id} with status: ${status}, audioUrl: ${audioUrl}`);

    const validStatuses = ['pending', 'processing', 'completed', 'failed'];
    if (!validStatuses.includes(status)) {
      logger.warn(`Invalid status provided: ${status} for TTS Request ID ${id}`);
      return res.status(400).json({ error: 'Invalid status provided.' });
    }

    const [ttsRequests] = await db.query('SELECT * FROM tts_requests WHERE id = ?', [id]);
    if (ttsRequests.length === 0) {
      logger.warn(`TTS Request not found for ID: ${id}`);
      return res.status(404).json({ error: 'TTS request not found.' });
    }

    const ttsRequest = ttsRequests[0];
    logger.info(`Found TTS Request: ${JSON.stringify(ttsRequest)}`);

    const updateQuery = 'UPDATE tts_requests SET status = ?, audio_url = ? WHERE id = ?';
    const updateValues = [status, audioUrl || null, id];

    await db.query(updateQuery, updateValues);
    logger.info(`TTS Request ID ${id} successfully updated to status: ${status}, audioUrl: ${audioUrl || 'null'}`);

    if (req.app.io) {
      const eventData = {
        ttsRequestId: id,
        status,
        audioUrl: audioUrl || null,
        message: ttsRequest.message,
        voice: ttsRequest.voice,
        creatorId: ttsRequest.creator_id,
        userId: ttsRequest.user_id,
      };

      req.app.io.to(`creator-room-${ttsRequest.creator_id}`).emit('tts-request', eventData);
      logger.info(
        `Socket event emitted to creator-room-${ttsRequest.creator_id} for TTS Request ID ${id}: ${JSON.stringify(
          eventData
        )}`
      );
    } else {
      logger.error('Socket.IO instance is not available. Event emission skipped.');
    }

    return res.status(200).json({
      message: `TTS request status updated successfully to: ${status}`,
    });
  } catch (error) {
    logger.error(`Error in updateTTSRequestStatus for TTS Request ID ${req.params.id}:`, error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to update TTS request status.' });
    }
  }
};

/**
 * Get TTS Requests for Logged-in User
 * GET /api/tts
 */
const getTTSRequests = async (req, res) => {
  try {
    const userId = req.user.id; // Derived from authentication middleware

    logger.info(`User ID: ${userId} is fetching their TTS requests.`);

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
    logger.error('❌ Error in getTTSRequests:', error);
    res.status(500).json({ error: 'Failed to fetch TTS requests.' });
  }
};

/**
 * Get TTS Requests by Creator
 * GET /api/tts/creator
 */
const getTTSRequestsByCreator = async (req, res) => {
  try {
    const { userId, creatorId, role, page = 1, limit = 50 } = req.query;

    logger.info(`User ID: ${userId}, Role: ${role}, Creator ID: ${creatorId} requested TTS data`);

    // Validate creatorId
    if (!creatorId) {
      logger.warn('Creator ID is missing in request.');
      return res.status(400).json({ error: 'Creator ID is required.' });
    }

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
    logger.error('❌ Error in getTTSRequestsByCreator:', error);
    res.status(500).json({ error: 'Failed to fetch TTS requests for the creator.' });
  }
};

/**
 * Get TTS Request Status
 * GET /api/tts/request-status/:ttsRequestId
 */
const getTTSRequestStatus = async (req, res) => {
  try {
    const { ttsRequestId } = req.params;

    logger.info(`Fetching status for TTS Request ID: ${ttsRequestId}`);

    const [ttsRequests] = await db.query(
      'SELECT status, audio_url AS audioUrl FROM tts_requests WHERE id = ?',
      [ttsRequestId]
    );

    if (ttsRequests.length === 0) {
      logger.warn(`TTS Request not found for ID: ${ttsRequestId}`);
      return res.status(404).json({ error: 'TTS request not found.' });
    }

    const { status, audioUrl } = ttsRequests[0];

    res.status(200).json({ status, audioUrl });
  } catch (error) {
    logger.error(`❌ Error in getTTSRequestStatus:`, error);
    res.status(500).json({ error: 'Failed to fetch TTS request status.' });
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
  getTTSRequestStatus, // Export the new polling function
};
