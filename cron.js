// cron.js
const cron = require("node-cron");
const { sendReminders } = require("./taskReminder"); // 引用后面会写的逻辑文件
const { updateExpiredTasks } = require("./taskStatusUpdater"); // 引用更新状态的逻辑


/**
 * setupCronJobs
 * 初始化所有定时任务（只需在 app.js 启动时调用一次）
 */
function setupCronJobs() {
  // 每天 04:00 执行一次
  cron.schedule("0 4 * * *", async () => {
    console.log("[CRON] Running daily tasks at 04:00...");
    try {
      // 1) 发送任务提醒
      await sendReminders();

      // 2) 更新过了 due_date 并且状态为 "DUE SOON" 的任务为 "EXPIRED"
      await updateExpiredTasks();
    } catch (err) {
      console.error("[CRON] daily cron job error:", err);
    }
  },
  {
    scheduled: true,
    timezone: 'Australia/Melbourne',
  }
);

  // 每分钟执行一次
  // cron.schedule('* * * * *', async () => {
  //     console.log('[CRON] Running tasks every minute...');
  //     try {
  //         await sendReminders();
  //     } catch (err) {
  //         console.error('[CRON] sendReminders error:', err);
  //     }
  // });

  console.log(
    "[CRON] Scheduled job: everyday 04:00 for sending task reminders."
  );
}

module.exports = { setupCronJobs };
