/**
 * Webhook Controller
 *
 * Handles incoming webhooks from external services (Resend).
 */

const crypto = require('crypto');
const axios = require('axios');
const emailService = require('../services/emailService');
const logger = require('../lib/logger');
const { success, error } = require('../lib/response');

// Allowed domain for inbound emails
const ALLOWED_DOMAIN = 'rjlagroup.com';

/**
 * Fetch full email content from Resend API
 * Webhook payload doesn't include email body, so we need to fetch it separately
 * @param {string} emailId - The email ID from webhook payload
 * @returns {Promise<Object>} Full email content
 */
async function fetchEmailContent(emailId) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const response = await axios.get(
    `https://api.resend.com/emails/${emailId}`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    }
  );
  return response.data;
}

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
      const isValid = webhookController.verifyResendSignature(req);
      if (!isValid) {
        logger.warn('[Webhook] Invalid Resend signature');
        return error(res, 'Invalid signature', 401);
      }

      // Only process email.received events
      if (payload.type !== 'email.received') {
        logger.info('[Webhook] Ignoring non-inbound event', { type: payload.type });
        return success(res, { message: 'Event ignored' }, 200);
      }

      const emailData = payload.data;
      const emailId = emailData.email_id;

      // Fetch full email content from Resend API (webhook doesn't include body)
      let fullEmail;
      try {
        fullEmail = await fetchEmailContent(emailId);
        logger.info('[Webhook] Fetched full email content from Resend API', {
          emailId,
          hasText: !!fullEmail.text,
          hasHtml: !!fullEmail.html,
        });
      } catch (fetchError) {
        logger.error('[Webhook] Failed to fetch email content from Resend API', {
          emailId,
          error: fetchError.message,
        });
        // Return 200 to prevent retry, but log the failure
        return error(res, 'Email processing failed', 200);
      }

      // Check if recipient domain is allowed
      const recipients = Array.isArray(fullEmail.to) ? fullEmail.to : [fullEmail.to].filter(Boolean);
      const isAllowedDomain = recipients.some(email => {
        const domain = email.split('@')[1]?.toLowerCase();
        return domain === ALLOWED_DOMAIN || domain?.endsWith(`.${ALLOWED_DOMAIN}`);
      });

      if (!isAllowedDomain) {
        logger.info('[Webhook] Ignoring email for non-allowed domain', {
          to: recipients,
          allowedDomain: ALLOWED_DOMAIN,
        });
        return success(res, { message: 'Domain not handled' }, 200);
      }

      // Extract email data from full email content
      const processData = {
        subject: fullEmail.subject || '',
        sender: fullEmail.from || '',
        textBody: fullEmail.text || '',
        html: fullEmail.html || '',
        recipient: recipients[0] || '',
        messageId: emailId,
      };

      logger.info('[Webhook] Processing inbound email', {
        sender: processData.sender,
        recipient: processData.recipient,
        subject: processData.subject,
        bodyLength: processData.textBody?.length || 0,
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
      // Don't expose internal error details to external callers
      return error(res, 'Email processing failed', 200);
    }
  },

  /**
   * Verify Resend webhook signature (Svix)
   * https://resend.com/docs/dashboard/webhooks/verify-webhook-requests
   */
  verifyResendSignature(req) {
    const secret = process.env.RESEND_WEBHOOK_SECRET;

    // Production environment requires webhook secret
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        logger.error('[Webhook] RESEND_WEBHOOK_SECRET not configured in production');
        return false;
      }
      logger.warn('[Webhook] Skipping signature verification in development');
      return true;
    }

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
    // Use raw body for signature verification to avoid JSON serialization inconsistencies
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;

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
