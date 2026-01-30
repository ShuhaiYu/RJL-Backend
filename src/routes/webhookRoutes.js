/**
 * Webhook Routes
 *
 * Routes for handling external webhooks (Resend, etc.)
 * These routes do NOT require authentication.
 */

const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Health check
router.get('/health', webhookController.healthCheck);

// Resend inbound email webhook
// Resend sends POST requests with JSON body
router.post('/resend/inbound', webhookController.handleResendInbound);

module.exports = router;
