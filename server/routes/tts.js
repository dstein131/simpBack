// routes/ttsRoutes.js

const express = require('express');
const router = express.Router();
const {
  submitTTSRequest,
  getTTSRequests,
  updateTTSRequestStatus,
  getAvailableVoices,
  downloadTTSAudio,
  getTTSRequestsByCreator, // Import the new controller
} = require('../controllers/ttsController'); // Ensure correct path
const { authenticateToken } = require('../middleware/authenticateToken'); // Ensure correct path

// Define routes

// Public Route
router.get('/voices', getAvailableVoices); // GET route to fetch available voices (public if no auth is required)
// If voices are specific to authenticated users, keep authenticateToken
// router.get('/voices', authenticateToken, getAvailableVoices);

// Protected Routes
router.post('/', authenticateToken, submitTTSRequest); // POST route to submit TTS request
router.get('/', authenticateToken, getTTSRequests); // GET route to fetch TTS requests for logged-in user
router.put('/:id/status', authenticateToken, updateTTSRequestStatus); // PUT route to update TTS request status
router.get('/download/:id', authenticateToken, downloadTTSAudio); // GET route to download TTS audio

// New route for fetching TTS requests by creator
router.get('/creator/:creatorId', authenticateToken, getTTSRequestsByCreator); // GET route to fetch TTS requests by creator

// Export the router
module.exports = router;
