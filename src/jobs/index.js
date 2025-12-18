/**
 * Jobs Index
 *
 * Exports all background job modules.
 */

const { setupCronJobs } = require('./cron');
const { startImapListener, stopImapListener } = require('./emailListener');
const { sendReminders } = require('./taskReminder');
const { updateExpiredTasks } = require('./taskStatusUpdater');

module.exports = {
  setupCronJobs,
  startImapListener,
  stopImapListener,
  sendReminders,
  updateExpiredTasks,
};
