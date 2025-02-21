const pool = require('../config/db');

/**
 * Create a user permission record.
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
    console.error("Error in createUserPermission:", error);
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
    return rows.reduce((acc, { permission_scope, permission_value }) => {
      if (!acc[permission_scope]) {
        acc[permission_scope] = [];
      }
      acc[permission_scope].push(permission_value);
      return acc;
    }, {});
  } catch (error) {
    console.error("Error in getUserPermissions:", error);
    throw error;
  }
}

/**
 * Delete a specific user permission association.
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

/**
 * Delete all permission associations for a given user.
 * @param {number} user_id - 用户 ID
 * @returns {Promise<void>}
 */
async function deleteAllUserPermissions(user_id) {
  const text = `DELETE FROM "USER_PERMISSION" WHERE user_id = $1;`;
  try {
    await pool.query(text, [user_id]);
  } catch (error) {
    console.error("Error in deleteAllUserPermissions:", error);
    throw error;
  }
}

/**
 * Retrieve the permission ID from the PERMISSION table given a permission value and scope.
 * @param {string} permission_value - 操作权限，例如 "create", "read"
 * @param {string} permission_scope - 权限作用域，例如 "user", "agency"
 * @returns {Promise<number|null>} 返回权限ID或 null
 */
async function getPermissionId(permission_value, permission_scope) {
  const text = `
    SELECT id FROM "PERMISSION"
    WHERE permission_value = $1 AND permission_scope = $2
    LIMIT 1;
  `;
  try {
    const { rows } = await pool.query(text, [permission_value, permission_scope]);
    return rows.length ? rows[0].id : null;
  } catch (error) {
    console.error("Error in getPermissionId:", error);
    throw error;
  }
}

module.exports = {
  createUserPermission,
  getUserPermissions,
  deleteUserPermission,
  deleteAllUserPermissions,
  getPermissionId,
};
