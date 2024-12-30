// middleware/authenticateToken.js

const jwt = require('jsonwebtoken');
const db = require('../db'); // Adjust the path as necessary
const logger = require('../logger'); // Import your logger

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer token

  if (!token) {
    return res.status(401).json({ error: 'No token provided.' });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    // Fetch user details from the database
    const [users] = await db.query('SELECT id, email, role, creator_id FROM users WHERE id = ?', [decoded.userId]);

    if (users.length === 0) {
      return res.status(401).json({ error: 'User not found.' });
    }

    const user = users[0]; // { id, email, role, creator_id }

    // Attach the user object to the request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      creatorId: user.creator_id, // Ensure your users table has a 'creator_id' field
    };

    next();
  } catch (err) {
    logger.error('❌ Error in authenticateToken:', err);
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

module.exports = { authenticateToken };
