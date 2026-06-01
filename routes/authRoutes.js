const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const verifyToken = require('../middleware/authMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);

// These routes are protected by the token guard!
router.get('/stats', verifyToken, authController.getDashboardStats);
router.get('/history', verifyToken, authController.getHistory);

module.exports = router;