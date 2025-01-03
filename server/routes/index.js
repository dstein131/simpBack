const express = require('express');
const router = express.Router();
const registerRoutes = require('./register');
const loginRoutes = require('./login');
const tipRoutes = require('./tips');
const ttsRoutes = require('./tts'); // Import TTS routes
const creatorRoutes = require('./creators');

// Attach routes
router.use('/register', registerRoutes);
router.use('/login', loginRoutes);
router.use('/tips', tipRoutes);
router.use('/tts', ttsRoutes); // Add TTS routes
router.use('/creators', creatorRoutes); // Add creator routes


// test route
router.get('/', (req, res) => {
  res.send('Hello from the API');
});

module.exports = router;
