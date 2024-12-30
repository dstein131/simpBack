const express = require('express');
const router = express.Router();
const {
  submitTTSRequest,
  getTTSRequests,
  updateTTSRequestStatus,
  getAvailableVoices,
  downloadTTSAudio,
} = require('../controllers/ttsController');  // Ensure correct path
const { authenticateToken } = require('../middlewares/auth');  // Ensure correct path

// Define routes
router.post('/', authenticateToken, submitTTSRequest);  // POST route to submit TTS request
router.get('/', authenticateToken, getTTSRequests);  // GET route to fetch TTS requests for logged-in user
router.put('/:id', authenticateToken, updateTTSRequestStatus);  // PUT route to update TTS request status
router.get('/voices', authenticateToken, getAvailableVoices);  // GET route to fetch available voices
router.get('/download/:id', authenticateToken, downloadTTSAudio);  // GET route to download TTS audio
router.get('/creator/:creatorId', authenticateToken, getTTSRequestsByCreatorId); // GET route to fetch TTS requests by creator ID


// Export the router
module.exports = router;
