const pool = require("../config/db");

async function getSystemSettings() {
  const query = `SELECT * FROM "SYSTEM_SETTINGS" LIMIT 1;`;
  const { rows } = await pool.query(query);
  return rows[0] || null;
}

async function updateSystemSettings(fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) {
    throw new Error("No fields provided for update");
  }
  const setClause = keys
    .map((key, index) => `"${key}" = $${index + 1}`)
    .join(", ");
  const values = keys.map((key) => fields[key]);
  // 假设只有一行，全局设置 id 为1
  const query = `
    UPDATE "SYSTEM_SETTINGS"
    SET ${setClause}
    WHERE id = 1
    RETURNING *;
  `;
  const { rows } = await pool.query(query, values);
  return rows[0];
}

module.exports = {
  getSystemSettings,
  updateSystemSettings,
};
