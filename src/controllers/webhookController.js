/**
 * Webhook Controller
 *
 * Handles incoming webhooks from external services (Resend).
 */

const crypto = require('crypto');
const emailService = require('../services/emailService');
const logger = require('../lib/logger');
const { success, error } = require('../lib/response');

const webhookController = {
  /**
   * Handle Resend inbound email webhook
   * POST /webhooks/resend/inbound
   *
   * Resend sends POST with JSON body
   * https://resend.com/docs/dashboard/webhooks/introduction
   */
  async handleResendInbound(req, res) {
    try {
      const payload = req.body;

      logger.info('[Webhook] Received Resend webhook', {
        type: payload.type,
        createdAt: payload.created_at,
      });

      // Verify Resend webhook signature (using Svix)
      if (process.env.RESEND_WEBHOOK_SECRET) {
        const isValid = webhookController.verifyResendSignature(req);
        if (!isValid) {
          logger.warn('[Webhook] Invalid Resend signature');
          return error(res, 'Invalid signature', 401);
        }
      }

      // Only process email.received events
      if (payload.type !== 'email.received') {
        logger.info('[Webhook] Ignoring non-inbound event', { type: payload.type });
        return success(res, { message: 'Event ignored' }, 200);
      }

      const emailData = payload.data;

      // Extract email data from Resend webhook payload
      const processData = {
        subject: emailData.subject || '',
        sender: emailData.from || '',
        textBody: emailData.text || '',
        html: emailData.html || '',
        recipient: Array.isArray(emailData.to) ? emailData.to[0] : emailData.to || '',
        messageId: emailData.email_id || null,
      };

      logger.info('[Webhook] Processing inbound email', {
        sender: processData.sender,
        recipient: processData.recipient,
        subject: processData.subject,
      });

      // Process with system user context
      const systemUser = {
        id: 0,
        role: 'system',
        agency_id: null,
      };

      const result = await emailService.processEmailWithAI(processData, systemUser);

      if (result.duplicate) {
        logger.info('[Webhook] Duplicate email skipped', { messageId: processData.messageId });
        return success(res, { message: 'Email already processed' }, 200);
      }

      logger.info('[Webhook] Email processed successfully', {
        emailId: result.email?.id,
        propertyId: result.property?.id,
        taskId: result.task?.id,
        senderType: result.senderType,
      });

      return success(res, result, 201);
    } catch (err) {
      logger.error('[Webhook] Failed to process Resend inbound', {
        error: err.message,
        stack: err.stack,
      });

      // Return 200 to prevent Resend from retrying (we logged the error)
      return error(res, err.message, 200);
    }
  },

  /**
   * Verify Resend webhook signature (Svix)
   * https://resend.com/docs/dashboard/webhooks/verify-webhook-requests
   */
  verifyResendSignature(req) {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return true; // Skip if not configured

    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];

    if (!svixId || !svixTimestamp || !svixSignature) {
      logger.warn('[Webhook] Missing Svix headers');
      return false;
    }

    // Check timestamp is within 5 minutes
    const currentTime = Math.floor(Date.now() / 1000);
    const webhookTime = parseInt(svixTimestamp);
    if (Math.abs(currentTime - webhookTime) > 300) {
      logger.warn('[Webhook] Resend timestamp too old');
      return false;
    }

    // Verify signature
    // Svix signature format: "v1,signature1 v1,signature2"
    const signedContent = `${svixId}.${svixTimestamp}.${JSON.stringify(req.body)}`;

    // Extract the secret (remove "whsec_" prefix if present)
    const secretBytes = Buffer.from(
      secret.startsWith('whsec_') ? secret.slice(6) : secret,
      'base64'
    );

    const expectedSignature = crypto
      .createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');

    // Check if any of the provided signatures match
    const signatures = svixSignature.split(' ');
    for (const sig of signatures) {
      const [version, signature] = sig.split(',');
      if (version === 'v1' && signature === expectedSignature) {
        return true;
      }
    }

    logger.warn('[Webhook] Resend signature mismatch');
    return false;
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
