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
 *   1. 任务的 due_date 是 “今天” 或 “三天前”
 *   2. 如果有 repeat_frequency，需要再判断 next_reminder 等（示例中简化处理）
 */
async function findTasksToRemind() {
  // 注意: dayjs().format('YYYY-MM-DD') 仅比较日期部分
  const today = dayjs().format("YYYY-MM-DD");
  console.log(today);

  const threeDaysEarly = dayjs().subtract(3, "day").format("YYYY-MM-DD");
    console.log(threeDaysEarly);

  // 在这里，我们假设“到期前3天”和“到期当天”都需要提醒
  // 你可以改成更复杂的sql: 例如 (due_date::date = today or due_date::date = threeDaysLater)
  const sql = `
  SELECT
    t.id,
    t.task_name,
    t.task_description,
    t.due_date,
    t.repeat_frequency,
    t.next_reminder,

    c.name AS contact_name,
    c.email AS contact_email,

    p.address AS property_address

  FROM "TASK" t
  LEFT JOIN "USER" c ON c.email = "edgar@veiam.net"
  LEFT JOIN "PROPERTY" p ON t.property_id = p.id
  WHERE to_char(t.due_date, 'YYYY-MM-DD') IN ($1, $2)
`;

  const { rows } = await pool.query(sql, [today, threeDaysEarly]);
  return rows;
}

/**
 * 更新 Task 下次提醒时间
 * 如果 repeat_frequency = 'monthly' => 下次 = 当前 + 1个月
 * 如果 'quarterly' => +3个月
 * 如果 'yearly' => +12个月
 * 如果 'none' => 不再提醒（设为null）
 */
async function updateTaskNextReminder(taskId, repeatFrequency) {
  let newNextReminder = null;
  if (repeatFrequency && repeatFrequency !== "none") {
    let monthsToAdd = 0;
    if (repeatFrequency === "monthly") monthsToAdd = 1;
    if (repeatFrequency === "quarterly") monthsToAdd = 3;
    if (repeatFrequency === "yearly") monthsToAdd = 12;
    newNextReminder = dayjs().add(monthsToAdd, "month").toDate();
  }
  const sql = `UPDATE "TASK" SET next_reminder = $1 WHERE id = $2`;
  await pool.query(sql, [newNextReminder, taskId]);
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
    const toEmail ='edgar@veiam.net' // 测试的邮箱

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

    // 3) 如果有 repeat_frequency, 计算并更新 next_reminder
    //    如果 'none', 就不再提醒
    await updateTaskNextReminder(t.id, t.repeat_frequency);
  }
}

module.exports = {
  sendReminders,
};
