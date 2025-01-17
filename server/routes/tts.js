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
  getTTSRequestStatus, // Import the new controller for polling
} = require('../controllers/ttsController'); // Ensure correct path
const { authenticateToken } = require('../middlewares/auth'); // Import the authentication middleware

// Define routes

// Public Route
router.get('/voices', getAvailableVoices); // GET route to fetch available voices (public if no auth is required)
// If voices are specific to authenticated users, keep authenticateToken
// router.get('/voices', authenticateToken, getAvailableVoices);

// Protected Routes
router.post('/', submitTTSRequest); // POST route to submit TTS request
router.get('/', getTTSRequests); // GET route to fetch TTS requests for logged-in user
router.put('/:id/status', updateTTSRequestStatus); // PUT route to update TTS request status
router.get('/download/:id', downloadTTSAudio); // GET route to download TTS audio

// New routes for fetching TTS requests by creator and polling status
router.get('/creator', getTTSRequestsByCreator); // GET route to fetch TTS requests by creator
router.get('/request-status/:ttsRequestId', getTTSRequestStatus); // GET route to poll TTS request status

// Export the router
module.exports = router;
