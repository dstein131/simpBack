const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/auth');
const { sendTip } = require('../controllers/tipsController');

// Route to send a tip
router.post('/', authenticateToken, sendTip);

module.exports = router;
