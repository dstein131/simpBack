const express = require('express');
const router = express.Router();
const { registerUser } = require('../controllers/registerController');

// Route to handle user registration
router.post('/', registerUser);

module.exports = router;
