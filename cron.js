// cron.js
const cron = require("node-cron");
const { sendReminders } = require("./taskReminder"); // 引用后面会写的逻辑文件

/**
 * setupCronJobs
 * 初始化所有定时任务（只需在 app.js 启动时调用一次）
 */
function setupCronJobs() {
  // 每天 9:00 执行一次
  cron.schedule("0 9 * * *", async () => {
    console.log("[CRON] Running daily tasks at 09:00...");
    try {
      await sendReminders();
    } catch (err) {
      console.error("[CRON] sendReminders error:", err);
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
    "[CRON] Scheduled job: everyday 09:00 for sending task reminders."
  );
}

module.exports = { setupCronJobs };
