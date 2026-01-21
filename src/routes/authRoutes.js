/**
 * Authentication Routes
 */

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const { authLimiter, passwordResetLimiter } = require('../middlewares/rateLimiter');
const { validate } = require('../validators');
const {
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} = require('../validators/authValidator');

// Public routes (with rate limiting)
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh-token', validate(refreshTokenSchema), authController.refreshToken);
router.post('/forgot-password', passwordResetLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', passwordResetLimiter, validate(resetPasswordSchema), authController.resetPassword);

// Protected routes (require authentication)
router.post('/change-password',
  authMiddleware.authenticateToken,
  validate(changePasswordSchema),
  authController.changePassword
);

router.post('/logout',
  authMiddleware.authenticateToken,
  authController.logout
);

router.get('/me',
  authMiddleware.authenticateToken,
  authController.getCurrentUser
);

module.exports = router;
