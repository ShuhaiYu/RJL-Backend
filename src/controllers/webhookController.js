/**
 * Webhook Controller
 *
 * Handles incoming webhooks from external services (Resend).
 * Step 1 of 2-step email processing: Save raw email only (< 3 seconds)
 * Processing happens via cron job or manual trigger
 */

const crypto = require('crypto');
const axios = require('axios');
const emailRepository = require('../repositories/emailRepository');
const logger = require('../lib/logger');
const { sendSuccess, sendError } = require('../lib/response');

// Allowed domain for inbound emails
const ALLOWED_DOMAIN = 'rjlagroup.com';

/**
 * Fetch full inbound email content from Resend Receiving API
 * Webhook payload doesn't include email body, so we need to fetch it separately
 * https://resend.com/docs/api-reference/emails/retrieve-received-email
 * @param {string} emailId - The email ID from webhook payload
 * @returns {Promise<Object>} Full email content including html, text, headers
 */
async function fetchEmailContent(emailId) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  // Use the Receiving API endpoint for inbound emails
  const response = await axios.get(
    `https://api.resend.com/emails/receiving/${emailId}`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 5000, // 5 second timeout
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
        return sendError(res, { statusCode: 401, message: 'Invalid signature' });
      }

      // Only process email.received events
      if (payload.type !== 'email.received') {
        logger.info('[Webhook] Ignoring non-inbound event', { type: payload.type });
        return sendSuccess(res, { statusCode: 200, message: 'Event ignored' });
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
        return sendError(res, { statusCode: 200, message: 'Email fetch failed' });
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
        return sendSuccess(res, { statusCode: 200, message: 'Domain not handled' });
      }

      // Check for duplicate using messageId
      const exists = await emailRepository.existsByGmailMsgId(emailId);
      if (exists) {
        logger.info('[Webhook] Duplicate email skipped', { messageId: emailId });
        return sendSuccess(res, { statusCode: 200, message: 'Email already processed' });
      }

      // Step 1: Save raw email data only (no AI processing)
      // Processing will happen via cron job or manual trigger
      const rawEmailData = {
        subject: fullEmail.subject || '',
        sender: fullEmail.from || '',
        email_body: fullEmail.text || '',
        html: fullEmail.html || '',
        gmail_msgid: emailId,
      };

      logger.info('[Webhook] Saving raw email', {
        sender: rawEmailData.sender,
        subject: rawEmailData.subject,
        bodyLength: rawEmailData.email_body?.length || 0,
      });

      const savedEmail = await emailRepository.createRaw(rawEmailData);

      logger.info('[Webhook] Email saved successfully (pending processing)', {
        emailId: savedEmail.id,
        messageId: emailId,
      });

      return sendSuccess(res, {
        statusCode: 201,
        message: 'Email saved, pending processing',
        data: { id: savedEmail.id, isProcessed: false },
      });
    } catch (err) {
      logger.error('[Webhook] Failed to process Resend inbound', {
        error: err.message,
        stack: err.stack,
      });

      // Return 200 to prevent Resend from retrying (we logged the error)
      // Don't expose internal error details to external callers
      return sendError(res, { statusCode: 200, message: 'Email processing failed' });
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
    return sendSuccess(res, {
      data: {
        status: 'ok',
        service: 'webhooks',
        timestamp: new Date().toISOString(),
      },
    });
  },
};

module.exports = webhookController;
