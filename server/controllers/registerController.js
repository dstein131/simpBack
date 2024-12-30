const bcrypt = require('bcryptjs');

const jwt = require('jsonwebtoken'); // Add this line to import jwt
const db = require('../db'); // Updated to use the index.js

// User Registration
exports.registerUser = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    // Check if the email or username already exists
    const [existingUser] = await db.query('SELECT * FROM users WHERE email = ? OR username = ?', [email, username]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Email or username already exists.' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Use 'tipper' as the default role if not provided
    const userRole = role || 'tipper';

    // Insert the new user
    await db.query('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)', [
      username,
      email,
      hashedPassword,
      userRole,
    ]);

    // Generate a JWT token
    const token = jwt.sign({ email, username, role: userRole }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(201).json({
      message: 'User registered successfully!',
      token,
      user: { username, email, role: userRole },
    });
  } catch (error) {
    console.error('❌ Error in Register Controller - registerUser:', error);
    res.status(500).json({ error: 'Server Error' });
  }
};