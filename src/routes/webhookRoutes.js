/**
 * Webhook Routes
 *
 * Routes for handling external webhooks (Resend, etc.)
 * These routes do NOT require authentication.
 */

const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { createRateLimiter } = require('../middlewares/rateLimiter');

// Webhook rate limiter - 100 requests per minute
const webhookLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: 'Too many webhook requests',
});

// Health check
router.get('/health', webhookController.healthCheck);

// Resend inbound email webhook
// Resend sends POST requests with JSON body
router.post('/resend/inbound', webhookLimiter, webhookController.handleResendInbound);

module.exports = router;
