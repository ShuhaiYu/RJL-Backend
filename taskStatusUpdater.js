// taskStatusUpdater.js
const pool = require("./config/db.js");

/**
 * updateExpiredTasks
 * 将所有“过了 due_date 且状态为 DUE SOON”的任务更新为 EXPIRED
 */
async function updateExpiredTasks() {
  console.log("[TASK STATUS] updateExpiredTasks start...");

  const sql = `
    UPDATE "TASK"
    SET status = 'EXPIRED'
    WHERE status = 'DUE SOON'
      AND due_date < NOW()
      AND is_active = true
      RETURNING id, task_name, status;
  `;
  const { rows } = await pool.query(sql);

  if (rows.length) {
    console.log("[TASK STATUS] Updated to EXPIRED:", rows);
  } else {
    console.log("[TASK STATUS] No tasks to update.");
  }
}

module.exports = {
  updateExpiredTasks,
};
