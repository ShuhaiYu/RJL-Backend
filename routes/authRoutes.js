// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// POST /auth/login
router.post('/login', authController.login);

// POST /auth/register
router.post('/register', authController.register);

// POST /auth/refresh (获取新的access token)
router.post('/refresh', authController.refreshToken);

// POST /auth/forgot-password
router.post('/forgot-password', authController.forgotPassword);

// POST /auth/reset-password
router.post('/reset-password', authController.resetPassword);

router.post('/user', authController.getCurrentUser);

// 可选：登出接口
router.post('/logout', authController.logout);

module.exports = router;
