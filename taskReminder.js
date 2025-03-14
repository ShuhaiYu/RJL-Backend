// taskReminder.js
const pool = require("./config/db");
const dayjs = require("dayjs");
const nodemailer = require("nodemailer");

// 引入 systemSettingsModel，用于获取数据库存储的 Gmail/SMTP 配置
const systemSettingsModel = require("./models/systemSettingsModel");

/**
 * 查找需要提醒的任务
 * 逻辑：
 *   1. 任务的 due_date 是 “今天” 或 “60天前”
 */
async function findTasksToRemind() {
  const today = dayjs().format("YYYY-MM-DD");
  const sixtyDaysEarly = dayjs().subtract(2, "month").format("YYYY-MM-DD");

  const sql = `
    SELECT
      t.id,
      t.task_name,
      t.task_description,
      t.due_date,
      t.repeat_frequency,
      t.type,

      p.address AS property_address,

      u.email AS user_email,
      u.name AS user_name

    FROM "TASK" t
    JOIN "PROPERTY" p ON t.property_id = p.id
    JOIN "USER" u ON p.user_id = u.id

    WHERE t.status = 'INCOMPLETE'
      AND to_char(t.due_date, 'YYYY-MM-DD') IN ($1, $2)
  `;
  const { rows } = await pool.query(sql, [today, sixtyDaysEarly]);
  return rows;
}

/**
 * 主函数: 查找所有需要提醒的任务, 并发送邮件提醒
 */
async function sendReminders() {
  try {
    // 1) 获取系统设置信息（含 Gmail 凭据、前端URL等）
    const settings = await systemSettingsModel.getSystemSettings();
    if (!settings) {
      console.log("[REMINDER] No system settings found, cannot send reminders.");
      return;
    }

    // 2) 从 settings 中拿到 email_user, email_password (或其他 SMTP 配置)
    const { email_user, email_password, email_host, frontend_url } = settings;

    if (!email_user || !email_password) {
      console.log("[REMINDER] Gmail config not found, skip sending reminders.");
      return;
    }

    // 3) 创建 nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: email_host,
      port: 465,
      secure: true,
      auth: {
        user: email_user,
        pass: email_password,
      },
    });

    // 4) 查找要提醒的任务
    const tasks = await findTasksToRemind();
    if (tasks.length === 0) {
      console.log("[REMINDER] No tasks to remind right now.");
      return;
    }

    // 5) 给每个 task 发送邮件
    for (const t of tasks) {
      const toEmail = t.user_email;
      // 如果没有 user_email，可以考虑跳过或改为你的测试邮箱
      if (!toEmail) {
        console.log(`[REMINDER] Task #${t.id} has no user_email, skip`);
        continue;
      }

      // 拼接详情链接:
      // 如果你在数据库里存了 'frontend_url'，这里拼接
      // 若你依然想用 .env，可写 process.env.FRONTEND_URL
      const taskDetailURL = frontend_url
        ? `${frontend_url}/property/tasks/${t.id}`
        : `https://yourdomain.com/property/tasks/${t.id}`;

      const subject = `Task Reminder: ${t.task_name}`;
      const textBody =
        `Hello ${t.user_name || "User"},\n\n` +
        `You have an INCOMPLETE task that needs attention:\n` +
        `------------------------------------------------------\n` +
        `Task Name: ${t.task_name}\n` +
        `Task Type: ${t.type || "N/A"}\n` +
        `Property Address: ${t.property_address || "N/A"}\n` +
        `Due Date: ${
          t.due_date ? dayjs(t.due_date).format("YYYY-MM-DD HH:mm") : "N/A"
        }\n` +
        (t.task_description ? `Description: ${t.task_description}\n` : "") +
        `------------------------------------------------------\n\n` +
        `To view or update this task, please click the link below:\n` +
        `${taskDetailURL}\n\n` +
        "Best regards,\nRJL System";

      try {
        await transporter.sendMail({
          from: `"Task Reminder" <${email_user}>`, // 发件人
          to: toEmail,
          subject,
          text: textBody,
        });
        console.log(`[REMINDER] Sent reminder for task #${t.id} to ${toEmail}`);
      } catch (err) {
        console.error(`[REMINDER] Failed to send email for task #${t.id}`, err);
      }
    }
  } catch (error) {
    console.error("[REMINDER] sendReminders error:", error);
  }
}

module.exports = {
  sendReminders,
};
