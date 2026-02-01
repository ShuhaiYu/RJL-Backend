/**
 * Resend Email Service
 *
 * Unified email sending service using Resend API.
 * Replaces nodemailer + SMTP for all outgoing emails.
 */

const { Resend } = require('resend');

// Validate required environment variable
if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY environment variable is required');
}

const resend = new Resend(process.env.RESEND_API_KEY);

// Default sender address
const DEFAULT_FROM = 'RJL System <noreply@rjlagroup.com.au>';

const resendEmailService = {
  /**
   * Send a single email
   * @param {Object} options - Email options
   * @param {string|string[]} options.to - Recipient email(s)
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML content
   * @param {string} [options.text] - Plain text content (optional)
   * @param {string} [options.from] - Sender address (optional, uses default if not provided)
   * @returns {Promise<Object>} Resend response data
   */
  async sendEmail({ to, subject, html, text, from }) {
    const fromAddress = from || DEFAULT_FROM;

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
};

module.exports = resendEmailService;
