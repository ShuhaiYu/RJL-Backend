/**
 * Cron Controller
 *
 * Handles Vercel Cron job requests.
 */

const { sendReminders } = require('../jobs/taskReminder');
const { updateExpiredTasks } = require('../jobs/taskStatusUpdater');
const logger = require('../lib/logger');

/**
 * Run all daily tasks (combined job)
 * Schedule: 0 4 * * * (04:00 Melbourne time)
 *
 * GET /api/cron/daily-tasks
 */
async function runDailyTasks(req, res) {
  const startTime = Date.now();
  logger.info('[CRON] Running daily tasks...');

  const results = {
    taskReminders: { success: false, error: null },
    taskStatusUpdate: { success: false, error: null, data: null },
  };

  // 1. Send task reminders
  try {
    await sendReminders();
    results.taskReminders.success = true;
    logger.info('[CRON] Task reminders completed');
  } catch (error) {
    results.taskReminders.error = error.message;
    logger.error('[CRON] Task reminders failed', { error: error.message });
  }

  // 2. Update expired task statuses
  try {
    const statusResult = await updateExpiredTasks();
    results.taskStatusUpdate.success = true;
    results.taskStatusUpdate.data = statusResult;
    logger.info('[CRON] Task status update completed');
  } catch (error) {
    results.taskStatusUpdate.error = error.message;
    logger.error('[CRON] Task status update failed', { error: error.message });
  }

  const duration = Date.now() - startTime;
  const allSuccess = results.taskReminders.success && results.taskStatusUpdate.success;

  logger.info(`[CRON] Daily tasks completed in ${duration}ms`, { results });

  res.status(allSuccess ? 200 : 207).json({
    success: allSuccess,
    message: 'Daily tasks executed',
    duration: `${duration}ms`,
    results,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Run task reminders only
 *
 * GET /api/cron/task-reminders
 */
async function runTaskReminders(req, res) {
  const startTime = Date.now();
  logger.info('[CRON] Running task reminders...');

  try {
    await sendReminders();
    const duration = Date.now() - startTime;

    logger.info(`[CRON] Task reminders completed in ${duration}ms`);

    res.json({
      success: true,
      message: 'Task reminders sent',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[CRON] Task reminders failed', { error: error.message });

    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Run task status update only
 *
 * GET /api/cron/task-status-update
 */
async function runTaskStatusUpdate(req, res) {
  const startTime = Date.now();
  logger.info('[CRON] Running task status update...');

  try {
    const result = await updateExpiredTasks();
    const duration = Date.now() - startTime;

    logger.info(`[CRON] Task status update completed in ${duration}ms`);

    res.json({
      success: true,
      message: 'Task statuses updated',
      duration: `${duration}ms`,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[CRON] Task status update failed', { error: error.message });

    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = {
  runDailyTasks,
  runTaskReminders,
  runTaskStatusUpdate,
};
