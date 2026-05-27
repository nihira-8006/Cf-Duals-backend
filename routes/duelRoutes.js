// routes/duelRoutes.js
const express = require('express');
const router = express.Router();
const duelController = require('../controllers/duelController');

// The :roomId parameter matches what we destructure in the controller
router.post('/:roomId/next', duelController.startNextDuel);

module.exports = router;