const db = require('../db'); // Updated to use the index.js
const socket = require('../socket');

// 1. Send a Tip
exports.sendTip = async (req, res) => {
  try {
    const { streamerId, tipAmount, message } = req.body;

    if (!streamerId || !tipAmount) {
      return res.status(400).json({ error: 'Streamer ID and tip amount are required.' });
    }

    // Broadcast the tip to the streamer using Socket.IO
    const io = socket.getIO();
    if (io) {
      io.to(streamerId).emit('receive-tip', { tipAmount, message });
    }

    // Save the tip to the database
    await db.query(
      'INSERT INTO tips (creator_id, tipper_id, amount, message, platform_fee) VALUES (?, ?, ?, ?, ?)',
      [streamerId, req.user.userId, tipAmount, message, tipAmount * 0.1]
    );

    res.status(200).json({ message: 'Tip sent successfully!' });
  } catch (error) {
    console.error('❌ Error in Tips Controller - sendTip:', error);
    res.status(500).json({ error: 'Server Error' });
  }
};

// Additional methods for future expansion, such as retrieving tip history, can go here
