// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

// Login
router.post('/login', authController.login);

// Register
router.post('/register', authController.register);

// Refresh token (get new access token)
router.post('/refresh', authMiddleware.authenticateToken, authController.refreshToken);

// Forgot password
router.post('/forgot-password', authController.forgotPassword);

// Reset password
router.post('/reset-password', authController.resetPassword);

// Get current user info
router.get('/me', authMiddleware.authenticateToken, authController.getCurrentUser);

// Logout
router.post('/logout', authController.logout);

module.exports = router;
