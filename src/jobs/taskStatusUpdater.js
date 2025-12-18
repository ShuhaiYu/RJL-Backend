/**
 * Task Status Updater Job
 *
 * Updates task statuses based on due dates:
 * 1. COMPLETED -> DUE SOON (due within 60 days)
 * 2. DUE SOON -> EXPIRED (past due date)
 */

const taskRepository = require('../repositories/taskRepository');
const logger = require('../lib/logger');

/**
 * Update task statuses for expiring tasks
 */
async function updateExpiredTasks() {
  logger.info('[TASK STATUS] Starting task status update...');

  try {
    const result = await taskRepository.updateExpiredStatuses();

    if (result.dueSoon > 0) {
      logger.info(`[TASK STATUS] Updated ${result.dueSoon} tasks: COMPLETED -> DUE SOON`);
    } else {
      logger.info('[TASK STATUS] No COMPLETED -> DUE SOON updates');
    }

    if (result.expired > 0) {
      logger.info(`[TASK STATUS] Updated ${result.expired} tasks: DUE SOON -> EXPIRED`);
    } else {
      logger.info('[TASK STATUS] No DUE SOON -> EXPIRED updates');
    }

    return result;
  } catch (error) {
    logger.error('[TASK STATUS] Error updating task statuses', { error: error.message });
    throw error;
  }
}

module.exports = {
  updateExpiredTasks,
};
