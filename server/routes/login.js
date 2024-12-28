const express = require('express');
const router = express.Router();
const { loginUser } = require('../controllers/loginController');

// Route to handle user login
router.post('/', loginUser);

module.exports = router;
