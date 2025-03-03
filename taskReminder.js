// taskReminder.js
const pool = require("./config/db");
const dayjs = require("dayjs");
const nodemailer = require("nodemailer");
require("dotenv").config(); // 从 .env 文件中读取环境变量

/**
 * 创建 nodemailer transporter（根据你的邮箱服务设置）
 * 若你用 Gmail，可以 host = 'smtp.gmail.com', tls = true, user/password为专用密码
 */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER, // 你的邮箱地址
    pass: process.env.GMAIL_PASSWORD, // 你的应用专用密码
  },
});

/**
 * 示例： 查找需要提醒的任务
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
      
      -- 房产信息
      p.address AS property_address,

      -- 用户（房产拥有者/关联者）的邮箱
      u.email AS user_email,
      u.name AS user_name  -- 如果在user表有名字字段，可以取出来当收件人名字

    FROM "TASK" t
    JOIN "PROPERTY" p ON t.property_id = p.id
    JOIN "USER" u ON p.user_id = u.id

    WHERE t.status = 'INCOMPLETE'
       AND to_char(t.due_date, 'YYYY-MM-DD') IN ($1, $2)
  `;

  const { rows } = await pool.query(sql, [today, sixtyDaysEarly]);
  return rows; // 这里返回的每一行就包含 user_email, property_address 等
}

/**
 * 主函数: 查找所有需要提醒的任务, 对每个联系人发送邮件
 */
async function sendReminders() {
  const tasks = await findTasksToRemind();
  if (tasks.length === 0) {
    console.log("[REMINDER] No tasks to remind right now.");
    return;
  }

  for (const t of tasks) {
    const toEmail = t.user_email || process.env.TEST_EMAIL; // 真实环境用 t.user_email；测试环境可以强制用 TEST_EMAIL
    
    // 这里假设你的前端访问链接是 /property/tasks/:taskId
    // 如果你有线上域名，举例可写成：`https://yourdomain.com/property/tasks/${t.id}`
    // 或者使用一个 .env 配置项如 process.env.APP_BASE_URL
    const taskDetailURL = `${process.env.FRONTEND_URL}/property/tasks/${t.id}`;

    // 拼接邮件内容
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
      (t.task_description
        ? `Description: ${t.task_description}\n`
        : "") +
      `------------------------------------------------------\n\n` +
      `To view or update this task, please click the link below:\n` +
      `${taskDetailURL}\n\n` +
      "Best regards,\nRJL System";

    try {
      await transporter.sendMail({
        from: '"Task Reminder" <no-reply@example.com>',
        to: toEmail,
        subject,
        text: textBody,
      });
      console.log(`[REMINDER] Sent reminder for task #${t.id} to ${toEmail}`);
    } catch (err) {
      console.error(`[REMINDER] Failed to send email for task #${t.id}`, err);
    }
  }
}

module.exports = {
  sendReminders,
};
