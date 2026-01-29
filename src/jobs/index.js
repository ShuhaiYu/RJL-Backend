/**
 * Jobs Index
 *
 * Exports all background job modules.
 */

const { setupCronJobs } = require('./cron');
const { sendReminders } = require('./taskReminder');
const { updateExpiredTasks } = require('./taskStatusUpdater');

module.exports = {
  setupCronJobs,
  sendReminders,
  updateExpiredTasks,
};
