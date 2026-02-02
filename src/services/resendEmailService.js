/**
 * Resend Email Service
 *
 * Unified email sending service using Resend API.
 * Replaces nodemailer + SMTP for all outgoing emails.
 */

const { Resend } = require('resend');
const emailRepository = require('../repositories/emailRepository');
const logger = require('../lib/logger');

// Validate required environment variable
if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY environment variable is required');
}

const resend = new Resend(process.env.RESEND_API_KEY);

// Default sender address
const DEFAULT_FROM = 'RJL System <noreply@rjlagroup.com.au>';

// Reply instruction to add to emails
const REPLY_INSTRUCTION = '\n\nFor replies, please email ray@rjlagroup.com';

const resendEmailService = {
  /**
   * Send a single email and optionally save to database
   * @param {Object} options - Email options
   * @param {string|string[]} options.to - Recipient email(s)
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML content
   * @param {string} [options.text] - Plain text content (optional)
   * @param {string} [options.from] - Sender address (optional, uses default if not provided)
   * @param {boolean} [options.saveToDb] - Whether to save email to database (default: false)
   * @param {number} [options.property_id] - Property ID for database record
   * @param {number} [options.agency_id] - Agency ID for database record
   * @returns {Promise<Object>} Resend response data
   */
  async sendEmail({ to, subject, html, text, from, saveToDb = false, property_id, agency_id }) {
    const fromAddress = from || DEFAULT_FROM;
    const recipientEmail = Array.isArray(to) ? to[0] : to;

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    });

    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }

    // Save to database if requested
    if (saveToDb) {
      try {
        await emailRepository.createOutbound({
          subject,
          from: fromAddress,
          to: recipientEmail,
          text,
          html,
          property_id,
          agency_id,
        });
        logger.info('[ResendEmailService] Outbound email saved to database', {
          to: recipientEmail,
          subject,
        });
      } catch (dbError) {
        // Log but don't fail the email send
        logger.error('[ResendEmailService] Failed to save outbound email to database', {
          error: dbError.message,
          to: recipientEmail,
          subject,
        });
      }
    }

    return data;
  },

  /**
   * Send multiple emails in a batch
   * @param {Array<Object>} emails - Array of email objects with to, subject, html, text, from
   * @returns {Promise<Object>} Resend batch response data
   */
  async sendBatch(emails) {
    const formattedEmails = emails.map((email) => ({
      from: email.from || DEFAULT_FROM,
      to: Array.isArray(email.to) ? email.to : [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }));

    const { data, error } = await resend.batch.send(formattedEmails);

    if (error) {
      throw new Error(`Resend batch error: ${error.message}`);
    }

    return data;
  },

  /**
   * Get the reply instruction text to append to emails
   * @returns {string}
   */
  getReplyInstruction() {
    return REPLY_INSTRUCTION;
  },
};

module.exports = resendEmailService;
