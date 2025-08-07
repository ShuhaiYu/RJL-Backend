// taskStatusUpdater.js
const pool = require("./config/db.js");

/**
 * updateExpiredTasks
 * 1.将所有“due_date 小于60天且状态为 COMPLETED”的任务更新为 'DUE SOON
 * 2.将所有“过了 due_date 且状态为 DUE SOON”的任务更新为 EXPIRED
 */
async function updateExpiredTasks() {
  console.log("[TASK STATUS] updateExpiredTasks start...");

  // 1) COMPLETED 且 60 天内到期（未过期） -> DUE SOO
  const toDueSoonSQL = `
    UPDATE "TASK"
    SET status = 'DUE SOON'
    WHERE status = 'COMPLETED'
      AND is_active = true
      AND due_date IS NOT NULL
      AND due_date <= (NOW() + INTERVAL '60 days')
      AND due_date >= NOW()
    RETURNING id, task_name, status, due_date;
  `;
  const toDueSoonRes = await pool.query(toDueSoonSQL);
  if (toDueSoonRes.rows.length) {
    console.log("[TASK STATUS] COMPLETED -> DUE SOON:", toDueSoonRes.rows);
  } else {
    console.log("[TASK STATUS] No COMPLETED -> DUE SOON updates.");
  }

  // 2) DUE SOON 且已过期 -> EXPIRED
  const toExpiredSQL = `
    UPDATE "TASK"
    SET status = 'EXPIRED'
    WHERE status = 'DUE SOON'
      AND is_active = true
      AND due_date < NOW()
    RETURNING id, task_name, status, due_date;
  `;
  const toExpiredRes = await pool.query(toExpiredSQL);
  if (toExpiredRes.rows.length) {
    console.log("[TASK STATUS] DUE SOON -> EXPIRED:", toExpiredRes.rows);
  } else {
    console.log("[TASK STATUS] No DUE SOON -> EXPIRED updates.");
  }
}


module.exports = {
  updateExpiredTasks,
};
