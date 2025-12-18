/**
 * Task Reminder Job
 *
 * Sends email reminders for tasks that are due today or 60 days ago.
 */

const nodemailer = require('nodemailer');
const dayjs = require('dayjs');
const taskRepository = require('../repositories/taskRepository');
const systemSettingsRepository = require('../repositories/systemSettingsRepository');
const logger = require('../lib/logger');

/**
 * Send email reminders for tasks
 */
async function sendReminders() {
  logger.info('[REMINDER] Starting task reminder job...');

  try {
    // Get system settings for email configuration
    const settings = await systemSettingsRepository.get();
    if (!settings) {
      logger.warn('[REMINDER] No system settings found, cannot send reminders');
      return;
    }

    const { emailUser, emailPassword, emailHost } = settings;
    if (!emailUser || !emailPassword) {
      logger.warn('[REMINDER] Email config not found, skipping reminders');
      return;
    }

    // Create nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: emailHost,
      port: 465,
      secure: true,
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
    });

    // Find tasks to remind
    const tasks = await taskRepository.findTasksForReminder();
    if (tasks.length === 0) {
      logger.info('[REMINDER] No tasks to remind right now');
      return;
    }

    logger.info(`[REMINDER] Found ${tasks.length} tasks to remind`);

    // Get frontend URL from environment
    const frontendUrl = process.env.FRONTEND_URL || 'https://yourdomain.com';

    // Send email for each task
    for (const task of tasks) {
      const userEmail = task.property?.user?.email;
      const userName = task.property?.user?.name || 'User';
      const propertyAddress = task.property?.address || 'N/A';

      if (!userEmail) {
        logger.warn(`[REMINDER] Task #${task.id} has no user email, skipping`);
        continue;
      }

      const taskDetailUrl = `${frontendUrl}/property/tasks/${task.id}`;
      const subject = `Task Reminder: ${task.taskName}`;
      const textBody =
        `Hello ${userName},\n\n` +
        `You have an INCOMPLETE task that needs attention:\n` +
        `------------------------------------------------------\n` +
        `Task Name: ${task.taskName}\n` +
        `Task Type: ${task.type || 'N/A'}\n` +
        `Property Address: ${propertyAddress}\n` +
        `Due Date: ${task.dueDate ? dayjs(task.dueDate).format('YYYY-MM-DD HH:mm') : 'N/A'}\n` +
        (task.taskDescription ? `Description: ${task.taskDescription}\n` : '') +
        `------------------------------------------------------\n\n` +
        `To view or update this task, please click the link below:\n` +
        `${taskDetailUrl}\n\n` +
        'Best regards,\nRJL System';

      try {
        await transporter.sendMail({
          from: `"Task Reminder" <${emailUser}>`,
          to: userEmail,
          subject,
          text: textBody,
        });
        logger.info(`[REMINDER] Sent reminder for task #${task.id} to ${userEmail}`);
      } catch (err) {
        logger.error(`[REMINDER] Failed to send email for task #${task.id}`, { error: err.message });
      }
    }
  } catch (error) {
    logger.error('[REMINDER] Error in sendReminders', { error: error.message });
    throw error;
  }
}

module.exports = {
  sendReminders,
};
