/**
 * SMS Service
 *
 * Unified SMS sending service using Twilio API.
 * SMS is an optional feature - if Twilio credentials are not configured,
 * all send operations will be silently skipped.
 */

const logger = require('../lib/logger');

// Twilio client initialization (only when configured)
let client = null;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  const twilio = require('twilio');
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  logger.info('[SMSService] Twilio client initialized');
} else {
  logger.warn('[SMSService] Twilio credentials not configured, SMS sending disabled');
}

const smsService = {
  /**
   * Check if SMS service is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return !!client && !!TWILIO_PHONE_NUMBER;
  },

  /**
   * Format Australian phone number to E.164 format
   * "0412345678"   → "+61412345678"
   * "+61412345678" → "+61412345678"
   * "61412345678"  → "+61412345678"
   * "412345678"    → "+61412345678"
   * Returns null if the phone number is invalid
   *
   * @param {string} phone - Raw phone number
   * @returns {string|null} E.164 formatted phone number or null
   */
  formatAustralianPhone(phone) {
    if (!phone) return null;

    // Remove all non-digit characters except leading +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Already in E.164 format
    if (cleaned.startsWith('+61') && cleaned.length === 12) {
      return cleaned;
    }

    // Remove leading +
    cleaned = cleaned.replace(/^\+/, '');

    // Australian format starting with 0 (e.g., 0412345678)
    if (cleaned.startsWith('0') && cleaned.length === 10) {
      return `+61${cleaned.slice(1)}`;
    }

    // Already has country code 61 (e.g., 61412345678)
    if (cleaned.startsWith('61') && cleaned.length === 11) {
      return `+${cleaned}`;
    }

    // 9-digit number without prefix (e.g., 412345678)
    if (cleaned.length === 9 && cleaned.startsWith('4')) {
      return `+61${cleaned}`;
    }

    logger.warn('[SMSService] Could not format phone number', { phone });
    return null;
  },

  /**
   * Send a single SMS message
   * @param {Object} options
   * @param {string} options.to - Recipient phone number
   * @param {string} options.body - Message content (keep under 160 chars for single SMS)
   * @returns {Promise<Object|null>} Twilio message object or null if skipped
   */
  async sendSMS({ to, body }) {
    if (!this.isEnabled()) {
      logger.debug('[SMSService] SMS disabled, skipping', { to });
      return null;
    }

    const formattedPhone = this.formatAustralianPhone(to);
    if (!formattedPhone) {
      logger.warn('[SMSService] Invalid phone number, skipping SMS', { to });
      return null;
    }

    try {
      const message = await client.messages.create({
        body,
        from: TWILIO_PHONE_NUMBER,
        to: formattedPhone,
      });

      logger.info('[SMSService] SMS sent successfully', {
        to: formattedPhone,
        sid: message.sid,
        status: message.status,
      });

      return message;
    } catch (error) {
      logger.error('[SMSService] Failed to send SMS', {
        to: formattedPhone,
        error: error.message,
        code: error.code,
      });
      // Don't throw - SMS failure should not block email flow
      return null;
    }
  },

  /**
   * Send SMS to multiple recipients with concurrency control
   * @param {Array<{to: string, body: string}>} smsList - Array of SMS objects
   * @param {number} concurrency - Max concurrent sends
   * @returns {Promise<{sent: number, failed: number, skipped: number}>}
   */
  async sendBatch(smsList, concurrency = 5) {
    if (!this.isEnabled()) {
      logger.debug('[SMSService] SMS disabled, skipping batch');
      return { sent: 0, failed: 0, skipped: smsList.length };
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < smsList.length; i += concurrency) {
      const batch = smsList.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map((sms) => this.sendSMS(sms))
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          sent++;
        } else if (result.status === 'fulfilled' && !result.value) {
          skipped++;
        } else {
          failed++;
        }
      }
    }

    logger.info('[SMSService] Batch SMS complete', { sent, failed, skipped });
    return { sent, failed, skipped };
  },
};

module.exports = smsService;
