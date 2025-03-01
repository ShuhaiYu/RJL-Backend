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
 *   2. 如果有 repeat_frequency，需要再判断 next_reminder 等（示例中简化处理）
 */
async function findTasksToRemind() {
  const today = dayjs().format("YYYY-MM-DD");
  const sixtyDaysEarly = dayjs().subtract(60, "day").format("YYYY-MM-DD");

  const sql = `
    SELECT
      t.id,
      t.task_name,
      t.task_description,
      t.due_date,
      t.repeat_frequency,
      t.next_reminder,
      
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
    // 1) 确定收件人
    // 在开发环境写死
    // const toEmail = t.contact_email // 联系人邮箱
    const toEmail = t.user_email || process.env.TEST_EMAIL; // 测试的邮箱

    // 2) 发送邮件
    const subject = `Task Reminder: ${t.task_name}`;
    const textBody =
      `Hello ${t.contact_name || "User"},\n\n` +
      `This is a reminder for your task: ${t.task_name}.\n` +
      `Due date: ${dayjs(t.due_date).format("YYYY-MM-DD HH:mm")}\n` +
      (t.property_name
        ? `Property: ${t.property_name}${
            t.property_address ? ", " + t.property_address : ""
          }\n`
        : "") +
      (t.task_description ? `Details: ${t.task_description}\n` : "") +
      "\nBest regards,\nRJL System";

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
