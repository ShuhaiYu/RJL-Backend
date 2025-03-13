// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

// Login
router.post('/login', authController.login);

// Refresh token (get new access token)
router.post('/refresh',  authController.refreshToken);

// Forgot password
router.post('/forgot-password', authController.forgotPassword);

// Reset password
router.post('/reset-password', authController.resetPassword);

// Change password
router.post('/change-password', authMiddleware.authenticateToken, authController.changePassword);

// Get current user info
router.get('/me', authMiddleware.authenticateToken, authController.getCurrentUser);

// Logout
router.post('/logout', authController.logout);

module.exports = router;
