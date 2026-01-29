/**
 * Webhook Controller
 *
 * Handles incoming webhooks from external services (Mailgun).
 */

const crypto = require('crypto');
const emailService = require('../services/emailService');
const logger = require('../lib/logger');
const { success, error } = require('../lib/response');

const webhookController = {
  /**
   * Handle Mailgun inbound email webhook
   * POST /webhooks/mailgun/inbound
   *
   * Mailgun sends POST with multipart/form-data or application/x-www-form-urlencoded
   * Fields: sender, recipient, subject, body-plain, body-html, stripped-text, etc.
   */
  async handleMailgunInbound(req, res) {
    try {
      logger.info('[Webhook] Received Mailgun inbound email', {
        sender: req.body.sender,
        recipient: req.body.recipient,
        subject: req.body.subject,
      });

      // Verify Mailgun signature (optional but recommended)
      if (process.env.MAILGUN_WEBHOOK_SIGNING_KEY) {
        const isValid = webhookController.verifyMailgunSignature(req.body);
        if (!isValid) {
          logger.warn('[Webhook] Invalid Mailgun signature');
          return error(res, 'Invalid signature', 401);
        }
      }

      // Extract email data from Mailgun webhook payload
      const emailData = {
        subject: req.body.subject || '',
        sender: req.body.sender || req.body.from || '',
        textBody: req.body['body-plain'] || req.body['stripped-text'] || '',
        html: req.body['body-html'] || req.body['stripped-html'] || '',
        recipient: req.body.recipient || '',
        // Use Message-Id header as unique identifier
        messageId: req.body['Message-Id'] || req.body['message-id'] || null,
      };

      // Process with system user context
      const systemUser = {
        id: 0,
        role: 'system',
        agency_id: null,
      };

      const result = await emailService.processEmailWithAI(emailData, systemUser);

      if (result.duplicate) {
        logger.info('[Webhook] Duplicate email skipped', { messageId: emailData.messageId });
        return success(res, { message: 'Email already processed' }, 200);
      }

      logger.info('[Webhook] Email processed successfully', {
        emailId: result.email?.id,
        propertyId: result.property?.id,
        taskId: result.task?.id,
      });

      return success(res, result, 201);
    } catch (err) {
      logger.error('[Webhook] Failed to process Mailgun inbound', {
        error: err.message,
        stack: err.stack,
      });

      // Return 200 to prevent Mailgun from retrying (we logged the error)
      // Change to 500 if you want Mailgun to retry on failures
      return error(res, err.message, 200);
    }
  },

  /**
   * Verify Mailgun webhook signature
   * https://documentation.mailgun.com/en/latest/user_manual.html#webhooks
   */
  verifyMailgunSignature(body) {
    const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
    if (!signingKey) return true; // Skip if not configured

    const { timestamp, token, signature } = body;
    if (!timestamp || !token || !signature) {
      return false;
    }

    // Check timestamp is within 5 minutes
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
      logger.warn('[Webhook] Mailgun timestamp too old');
      return false;
    }

    // Verify HMAC signature
    const encodedToken = crypto
      .createHmac('sha256', signingKey)
      .update(timestamp + token)
      .digest('hex');

    return encodedToken === signature;
  },

  /**
   * Health check endpoint for webhooks
   * GET /webhooks/health
   */
  async healthCheck(req, res) {
    return success(res, {
      status: 'ok',
      service: 'webhooks',
      timestamp: new Date().toISOString(),
    });
  },
};

module.exports = webhookController;
