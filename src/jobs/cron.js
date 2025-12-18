/**
 * Cron Jobs Setup
 *
 * Initializes scheduled tasks for the application.
 */

const cron = require('node-cron');
const { sendReminders } = require('./taskReminder');
const { updateExpiredTasks } = require('./taskStatusUpdater');
const logger = require('../lib/logger');

/**
 * Setup all cron jobs
 * Call this function once at application startup
 */
function setupCronJobs() {
  // Daily job at 04:00 Melbourne time
  cron.schedule(
    '0 4 * * *',
    async () => {
      logger.info('[CRON] Running daily tasks at 04:00...');
      try {
        // 1) Send task reminders
        await sendReminders();

        // 2) Update expired task statuses
        await updateExpiredTasks();
      } catch (err) {
        logger.error('[CRON] Daily cron job error', { error: err.message });
      }
    },
    {
      scheduled: true,
      timezone: 'Australia/Melbourne',
    }
  );

  logger.info('[CRON] Scheduled job: everyday 04:00 (Melbourne) for task reminders and status updates');
}

module.exports = { setupCronJobs };
