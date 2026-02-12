/**
 * Email Processor Job
 *
 * Processes unprocessed emails from the database.
 * Called by cron job every 5 minutes.
 *
 * Step 2 of 2-step email processing:
 * - Step 1: Webhook saves raw email (< 3 seconds)
 * - Step 2: This job processes emails with AI (can take 7-12 seconds per email)
 */

const emailRepository = require('../repositories/emailRepository');
const emailService = require('../services/emailService');
const logger = require('../lib/logger');

/**
 * Process unprocessed emails
 * @param {number} limit - Maximum emails to process per run
 * @returns {Object} - Processing results
 */
async function processUnprocessedEmails(limit = 5) {
  logger.info('[EmailProcessor] Starting email processing job');

  const emails = await emailRepository.findUnprocessed(limit);

  if (emails.length === 0) {
    logger.info('[EmailProcessor] No unprocessed emails found');
    return { processed: 0, failed: 0, total: 0 };
  }

  logger.info(`[EmailProcessor] Found ${emails.length} unprocessed emails`);

  let processed = 0;
  let failed = 0;
  const results = [];

  for (const email of emails) {
    try {
      logger.info(`[EmailProcessor] Processing email ${email.id}`, {
        subject: email.subject,
        sender: email.sender,
      });

      const result = await emailService.processStoredEmail(email);

      processed++;
      results.push({
        emailId: email.id,
        success: true,
        propertyIds: result.properties?.map((p) => p.id) || [],
        taskId: result.task?.id,
      });

      logger.info(`[EmailProcessor] Email ${email.id} processed successfully`, {
        propertyIds: result.properties?.map((p) => p.id) || [],
        taskId: result.task?.id,
      });
    } catch (err) {
      failed++;
      results.push({
        emailId: email.id,
        success: false,
        error: err.message,
      });

      logger.error('[EmailProcessor] Failed to process email', {
        emailId: email.id,
        error: err.message,
        stack: err.stack,
      });

      // Mark as processed with error note to prevent infinite retry
      try {
        await emailRepository.markAsProcessed(email.id, {
          processNote: `❌ Processing failed: ${err.message}`,
        });
      } catch (updateErr) {
        logger.error('[EmailProcessor] Failed to mark email as processed', {
          emailId: email.id,
          error: updateErr.message,
        });
      }
    }
  }

  logger.info('[EmailProcessor] Job completed', {
    processed,
    failed,
    total: emails.length,
  });

  return { processed, failed, total: emails.length, results };
}

module.exports = { processUnprocessedEmails };
