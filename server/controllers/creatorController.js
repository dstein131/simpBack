const db = require('../db');

// Get all creators
const getCreators = async (req, res) => {
  try {
    const [creators] = await db.query('SELECT * FROM creators');
    res.status(200).json(creators);
  } catch (error) {
    console.error('❌ Error fetching creators:', error);
    res.status(500).json({ error: 'Failed to fetch creators.' });
  }
};

// Get a specific creator by ID
const getCreatorById = async (req, res) => {
  try {
    const { id } = req.params;
    const [creator] = await db.query('SELECT * FROM creators WHERE id = ?', [id]);

    if (creator.length === 0) {
      return res.status(404).json({ error: 'Creator not found.' });
    }

    res.status(200).json(creator[0]);
  } catch (error) {
    console.error('❌ Error fetching creator by ID:', error);
    res.status(500).json({ error: 'Failed to fetch creator.' });
  }
};

// Create a new creator
const createCreator = async (req, res) => {
  try {
    const { user_id, display_name, overlay_url, bio, payment_info, revenue_share } = req.body;

    if (!user_id || !display_name) {
      return res.status(400).json({ error: 'User ID and display name are required.' });
    }

    const [result] = await db.query(
      'INSERT INTO creators (user_id, display_name, overlay_url, bio, payment_info, revenue_share) VALUES (?, ?, ?, ?, ?, ?)',
      [user_id, display_name, overlay_url || null, bio || null, JSON.stringify(payment_info) || null, revenue_share || 70.0]
    );

    res.status(201).json({ message: 'Creator added successfully!', creatorId: result.insertId });
  } catch (error) {
    console.error('❌ Error creating creator:', error);
    res.status(500).json({ error: 'Failed to create creator.' });
  }
};

// Update a creator
const updateCreator = async (req, res) => {
  try {
    const { id } = req.params;
    const { display_name, overlay_url, bio, payment_info, revenue_share } = req.body;

    const [result] = await db.query(
      'UPDATE creators SET display_name = ?, overlay_url = ?, bio = ?, payment_info = ?, revenue_share = ? WHERE id = ?',
      [display_name || null, overlay_url || null, bio || null, JSON.stringify(payment_info) || null, revenue_share || 70.0, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Creator not found or no changes made.' });
    }

    res.status(200).json({ message: 'Creator updated successfully!' });
  } catch (error) {
    console.error('❌ Error updating creator:', error);
    res.status(500).json({ error: 'Failed to update creator.' });
  }
};

// Delete a creator
const deleteCreator = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query('DELETE FROM creators WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Creator not found.' });
    }

    res.status(200).json({ message: 'Creator deleted successfully!' });
  } catch (error) {
    console.error('❌ Error deleting creator:', error);
    res.status(500).json({ error: 'Failed to delete creator.' });
  }
};

module.exports = {
  getCreators,
  getCreatorById,
  createCreator,
  updateCreator,
  deleteCreator,
};
