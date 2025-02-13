const pool = require('../config/db');

/**
 * 为指定用户添加一个权限关联
 * @param {number} user_id - 用户 ID
 * @param {number} permission_id - 权限 ID
 * @returns {Promise<Object>} 返回插入后的关联记录
 */
async function createUserPermission(user_id, permission_id) {
  const text = `
    INSERT INTO "USER_PERMISSION" (user_id, permission_id)
    VALUES ($1, $2)
    RETURNING *;
  `;
  try {
    const { rows } = await pool.query(text, [user_id, permission_id]);
    return rows[0];
  } catch (error) {
    console.error("Error in addUserPermission:", error);
    throw error;
  }
}

/**
 * Get all permission records for a given user ID by joining USER_PERMISSION and PERMISSION tables.
 * @param {number} user_id - User ID
 * @returns {Promise<Array>} Returns an array of permission objects, e.g. [{ permission_value, permission_scope }, ...]
 */
async function getUserPermissions(user_id) {
    const text = `
      SELECT P.permission_value, P.permission_scope
      FROM "USER_PERMISSION" UP
      JOIN "PERMISSION" P ON UP.permission_id = P.id
      WHERE UP.user_id = $1;
    `;
    try {
      const { rows } = await pool.query(text, [user_id]);
      return rows;
    } catch (error) {
      console.error("Error in getUserPermissions:", error);
      throw error;
    }
  }

/**
 * 删除指定的用户权限关联记录
 * @param {number} user_id - 用户 ID
 * @param {number} permission_id - 权限 ID
 * @returns {Promise<Object>} 返回被删除的记录
 */
async function deleteUserPermission(user_id, permission_id) {
  const text = `
    DELETE FROM "USER_PERMISSION"
    WHERE user_id = $1 AND permission_id = $2
    RETURNING *;
  `;
  try {
    const { rows } = await pool.query(text, [user_id, permission_id]);
    return rows[0];
  } catch (error) {
    console.error("Error in deleteUserPermission:", error);
    throw error;
  }
}

module.exports = {
  createUserPermission,
  getUserPermissions,
  deleteUserPermission,
};
