const pool = require("../config/db");

// 查找权限id
async function getPermissionId(permValue, scope) {
  const text = `
        SELECT id FROM "PERMISSION"
        WHERE permission_value = $1 AND permission_scope = $2;
    `;
  try {
    const { rows } = await pool.query(text, [permValue, scope]);
    return rows[0]?.id;
  } catch (error) {
    console.error("Error in getPermissionId:", error);
    throw error;
  }
}


module.exports = {
  getPermissionId,
};