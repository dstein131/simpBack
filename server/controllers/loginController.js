const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db'); // Updated to use the index.js

// User Login
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Check if the email exists
    const [user] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (user.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials.' });
    }

    // Compare the password
    const isMatch = await bcrypt.compare(password, user[0].password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials.' });
    }

    // Generate a JWT token
    const token = jwt.sign(
      { userId: user[0].id, email: user[0].email, role: user[0].role },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '1h' }
    );
    

    // Prepare response data
    const responseData = {
      message: 'Logged in successfully!',
      token,
      user: user[0], // Send full user object
    };

    // Log the response data
    console.log('Login Response:', responseData);

    // Send the response
    res.status(200).json(responseData);
  } catch (error) {
    console.error('❌ Error in Login Controller - loginUser:', error);
    res.status(500).json({ error: 'Server Error' });
  }
};
