/**
 * Task Reminder Job
 *
 * Sends email reminders for tasks:
 * 1. Advance reminder: COMPLETED tasks with due_date ~60 days away (time to book inspection)
 * 2. Expired reminder: EXPIRED tasks with due_date just passed (task has expired)
 */

const dayjs = require('dayjs');
const taskRepository = require('../repositories/taskRepository');
const resendEmailService = require('../services/resendEmailService');
const logger = require('../lib/logger');

/**
 * Build email content for advance reminder (COMPLETED tasks)
 */
function buildAdvanceReminderEmail(task, userName, propertyAddress, taskDetailUrl) {
  const daysUntilDue = task.dueDate ? dayjs(task.dueDate).diff(dayjs(), 'day') : 60;
  const replyInstruction = resendEmailService.getReplyInstruction();

  const subject = `Upcoming Due Date Reminder: ${task.taskName}`;
  const textBody =
    `Hello ${userName},\n\n` +
    `This is a friendly reminder that the following task is due in approximately ${daysUntilDue} days.\n` +
    `Please book an inspection soon to ensure compliance.\n\n` +
    `------------------------------------------------------\n` +
    `Task Name: ${task.taskName}\n` +
    `Task Type: ${task.type || 'N/A'}\n` +
    `Property Address: ${propertyAddress}\n` +
    `Due Date: ${task.dueDate ? dayjs(task.dueDate).format('YYYY-MM-DD') : 'N/A'}\n` +
    `Status: COMPLETED (awaiting next inspection)\n` +
    (task.taskDescription ? `Description: ${task.taskDescription}\n` : '') +
    `------------------------------------------------------\n\n` +
    `To view or update this task, please click the link below:\n` +
    `${taskDetailUrl}\n\n` +
    'Best regards,\n' +
    'RJL System' +
    replyInstruction;

  return { subject, textBody };
}

/**
 * Build email content for expired reminder (EXPIRED tasks)
 */
function buildExpiredReminderEmail(task, userName, propertyAddress, taskDetailUrl) {
  const replyInstruction = resendEmailService.getReplyInstruction();

  const subject = `Task Expired: ${task.taskName}`;
  const textBody =
    `Hello ${userName},\n\n` +
    `This is to inform you that the following task has EXPIRED and requires immediate attention.\n` +
    `Please take action as soon as possible to ensure compliance.\n\n` +
    `------------------------------------------------------\n` +
    `Task Name: ${task.taskName}\n` +
    `Task Type: ${task.type || 'N/A'}\n` +
    `Property Address: ${propertyAddress}\n` +
    `Due Date: ${task.dueDate ? dayjs(task.dueDate).format('YYYY-MM-DD') : 'N/A'}\n` +
    `Status: EXPIRED\n` +
    (task.taskDescription ? `Description: ${task.taskDescription}\n` : '') +
    `------------------------------------------------------\n\n` +
    `To view or update this task, please click the link below:\n` +
    `${taskDetailUrl}\n\n` +
    'Best regards,\n' +
    'RJL System' +
    replyInstruction;

  return { subject, textBody };
}

/**
 * Send a single reminder email
 */
async function sendReminderEmail(task, reminderType) {
  const userEmail = task.property?.user?.email;
  const userName = task.property?.user?.name || 'User';
  const propertyAddress = task.property?.address || 'N/A';
  const agencyId = task.agencyId;
  const propertyId = task.propertyId;

  if (!userEmail) {
    logger.warn(`[REMINDER] Task #${task.id} has no user email, skipping`);
    return false;
  }

  const frontendUrl = process.env.FRONTEND_URL || 'https://yourdomain.com';
  const taskDetailUrl = `${frontendUrl}/property/tasks/${task.id}`;

  // Build email content based on reminder type
  const { subject, textBody } =
    reminderType === 'advance'
      ? buildAdvanceReminderEmail(task, userName, propertyAddress, taskDetailUrl)
      : buildExpiredReminderEmail(task, userName, propertyAddress, taskDetailUrl);

  try {
    await resendEmailService.sendEmail({
      from: 'Task Reminder <noreply@rjlagroup.com.au>',
      to: userEmail,
      subject,
      text: textBody,
      saveToDb: true, // Save to database
      property_id: propertyId,
      agency_id: agencyId,
    });
    logger.info(`[REMINDER] Sent ${reminderType} reminder for task #${task.id} to ${userEmail}`);
    return true;
  } catch (err) {
    logger.error(`[REMINDER] Failed to send ${reminderType} reminder for task #${task.id}`, {
      error: err.message,
    });
    return false;
  }
}

/**
 * Send email reminders for tasks
 */
async function sendReminders() {
  logger.info('[REMINDER] Starting task reminder job...');

  try {
    // Find tasks to remind (returns { advanceReminder, expiredReminder })
    const { advanceReminder, expiredReminder } = await taskRepository.findTasksForReminder();

    const totalTasks = advanceReminder.length + expiredReminder.length;
    if (totalTasks === 0) {
      logger.info('[REMINDER] No tasks to remind right now');
      return { advanceReminder: 0, expiredReminder: 0 };
    }

    logger.info(
      `[REMINDER] Found ${advanceReminder.length} advance reminders and ${expiredReminder.length} expired reminders`
    );

    let advanceSent = 0;
    let expiredSent = 0;

    // Send advance reminders (COMPLETED tasks due in ~60 days)
    for (const task of advanceReminder) {
      const sent = await sendReminderEmail(task, 'advance');
      if (sent) advanceSent++;
    }

    // Send expired reminders (EXPIRED tasks)
    for (const task of expiredReminder) {
      const sent = await sendReminderEmail(task, 'expired');
      if (sent) expiredSent++;
    }

    logger.info(
      `[REMINDER] Completed: ${advanceSent} advance reminders, ${expiredSent} expired reminders sent`
    );

    return { advanceReminder: advanceSent, expiredReminder: expiredSent };
  } catch (error) {
    logger.error('[REMINDER] Error in sendReminders', { error: error.message });
    throw error;
  }
}

module.exports = {
  sendReminders,
};
