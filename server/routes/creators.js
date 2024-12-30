const express = require('express');
const router = express.Router();
const {
  getCreators,
  getCreatorById,
  createCreator,
  updateCreator,
  deleteCreator,
} = require('../controllers/creatorController'); // Import creator controller
const { authenticateToken } = require('../middlewares/auth'); // Authentication middleware

// Routes for creators
router.get('/', authenticateToken, getCreators); // GET all creators
router.get('/:id', authenticateToken, getCreatorById); // GET a specific creator by ID
router.post('/', authenticateToken, createCreator); // POST to create a new creator
router.put('/:id', authenticateToken, updateCreator); // PUT to update a specific creator
router.delete('/:id', authenticateToken, deleteCreator); // DELETE a creator

module.exports = router;
