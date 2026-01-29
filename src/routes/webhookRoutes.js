/**
 * Webhook Routes
 *
 * Routes for handling external webhooks (Mailgun, etc.)
 * These routes do NOT require authentication.
 */

const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Health check
router.get('/health', webhookController.healthCheck);

// Mailgun inbound email webhook
// Mailgun sends POST requests with form-encoded or multipart data
router.post('/mailgun/inbound', webhookController.handleMailgunInbound);

module.exports = router;
