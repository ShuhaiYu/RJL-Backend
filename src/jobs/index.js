/**
 * Jobs Index
 *
 * Exports all background job modules.
 *
 * Usage:
 * - In traditional server: setupCronJobs() schedules jobs via node-cron
 * - In Vercel: Jobs are triggered via /api/cron/* endpoints (see cronRoutes.js)
 */

const { setupCronJobs } = require('./cron');
const { sendReminders } = require('./taskReminder');
const { updateExpiredTasks } = require('./taskStatusUpdater');

module.exports = {
  // Cron setup for traditional server environments
  setupCronJobs,

  // Individual job functions (can be called directly or via Vercel Cron)
  sendReminders,
  updateExpiredTasks,
};
