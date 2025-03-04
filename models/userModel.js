// models/user.model.js

const pool = require('../config/db');

/**
 * 插入新用户
 * @param {Object} param0 - 用户数据对象
 * @param {string} param0.email - 用户邮箱
 * @param {string} param0.name - 用户名称
 * @param {string} param0.password - 用户密码（应先加密后存储）
 * @param {string} param0.role - 用户角色，例如 "superuser"、"admin"、"agency" 等
 * @param {number|null} [param0.agency_id=null] - 可选的机构ID（如果有）
 * @returns {Promise<Object>} - 返回插入后的用户记录
 */
async function createUser({ email, name, password, role, agency_id = null }) {
  const text = `
    INSERT INTO "USER" (email, name, password, role, agency_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
  const values = [email, name, password, role, agency_id];
  try {
    const { rows } = await pool.query(text, values);
    return rows[0];
  } catch (error) {
    console.error('Error in insertUser:', error);
    throw error;
  }
}

/**
 * 根据用户 ID 获取用户信息，同时附带关联的 Agency（若存在）、Property 与 Task 信息
 * 
 * 数据关联说明：
 * 1. 若 "USER".agency_id 不为空，则通过 "Agency" 表获取对应机构信息
 * 2. "Property" 表中通过 user_id 与 "USER" 表关联，获取该用户所有的房产信息
 * 3. "Task" 表中通过 property_id 与 "Property" 表关联，获取该用户所有房产下的任务信息
 * 
 * @param {number} user_id - 用户的 ID
 * @returns {Promise<Object|null>} - 返回包含关联信息的用户对象；若未找到该用户，则返回 null
 */
async function getUserById(user_id) {
  try {
    // 1. 查询用户基本信息
    const userQuery = `SELECT * FROM "USER" WHERE id = $1;`;
    const { rows: userRows } = await pool.query(userQuery, [user_id]);
    if (userRows.length === 0) {
      // 用户不存在
      return null;
    }
    const user = userRows[0];

    // 2. 若 agency_id 不为空，则查询 Agency 表获取机构信息
    if (user.agency_id) {
      const agencyQuery = `SELECT * FROM "AGENCY" WHERE id = $1;`;
      const { rows: agencyRows } = await pool.query(agencyQuery, [user.agency_id]);
      user.agency = agencyRows.length > 0 ? agencyRows[0] : null;
    } else {
      user.agency = null;
    }

    // 3. 查询用户的房产信息（Property 表与 "USER" 表通过 user_id 关联）
    const propertyQuery = `SELECT * FROM "PROPERTY" WHERE user_id = $1;`;
    const { rows: properties } = await pool.query(propertyQuery, [user_id]);
    user.properties = properties; // 可能存在多条房产记录

    // 4. 根据房产信息查询任务信息（Task 表通过 property_id 与 Property 关联）
    if (properties.length > 0) {
      // 提取所有房产的 id
      const propertyIds = properties.map(property => property.id);
      // 使用 PostgreSQL 的 ANY() 语法进行数组匹配
      const tasksQuery = `SELECT * FROM "TASK" WHERE property_id = ANY($1::int[]);`;
      const { rows: tasks } = await pool.query(tasksQuery, [propertyIds]);
      user.tasks = tasks; // 可能存在多条任务记录
    } else {
      user.tasks = [];
    }

    // 返回包含所有关联信息的用户对象
    return user;
  } catch (error) {
    console.error('Error in getUserById:', error);
    throw error;
  }
}

/**
 * 更新用户信息
 * 
 * 该函数根据传入的 fields 对象动态构建更新语句，允许更新多个字段，例如：
 *   { email, name, password, role, agency_id, is_active, refresh_token }
 * 
 * @param {number} user_id - 要更新的用户 ID
 * @param {Object} fields - 包含需要更新字段及其新值的对象
 * @returns {Promise<Object>} - 返回更新后的用户记录
 */
async function updateUser(user_id, fields) {
  try {
    const keys = Object.keys(fields);
    if (keys.length === 0) {
      throw new Error('No fields provided for update');
    }
    // 动态构造 SET 子句，例如： "email" = $1, "name" = $2, ...
    const setClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(', ');
    const values = keys.map(key => fields[key]);
    // 将 user_id 作为最后一个参数，构造完整更新语句
    const query = `UPDATE "USER" SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *;`;
    const { rows } = await pool.query(query, [...values, user_id]);
    if (rows.length === 0) {
      throw new Error(`User with id ${user_id} not found`);
    }
    return rows[0];
  } catch (error) {
    console.error('Error in updateUser:', error);
    throw error;
  }
}

/**
 * 软删除用户
 * 将指定用户的 is_active 字段设置为 false
 * @param {number} user_id - 要删除的用户 ID
 * @returns {Promise<Object>} - 返回更新后的用户记录
 */
async function deleteUser(user_id) {
  try {
    const query = `UPDATE "USER" SET is_active = false WHERE id = $1 RETURNING *;`;
    const { rows } = await pool.query(query, [user_id]);
    if (rows.length === 0) {
      throw new Error(`User with id ${user_id} not found`);
    }
    return rows[0];
  } catch (error) {
    console.error('Error in deleteUser:', error);
    throw error;
  }
}

/**
 * 列出用户记录
 * 
 * 根据请求用户的角色返回不同范围的用户列表：
 * - 如果请求用户是 superuser 或 admin，返回所有用户；
 * - 如果请求用户是 agency-admin，则只返回同一机构（agency_id）的用户；
 * - 其他角色（或未明确授权）的用户，默认只返回自身信息。
 * 
 * 同时通过 LEFT JOIN "AGENCY" 表返回 agency_name，
 * 注意部分用户可能没有 agency_id。
 * 
 * @param {Object} requestingUser - 请求用户对象，需包含 id、role 及 agency_id（如适用）
 * @returns {Promise<Array>} 返回用户列表数组
 */
async function listUsers(requestingUser, search = "") {
  try {
    let query = "";
    let values = [];
    if (requestingUser.role === 'superuser' || requestingUser.role === 'admin') {
      query = `
        SELECT u.*, a.agency_name 
        FROM "USER" u 
        LEFT JOIN "AGENCY" a ON u.agency_id = a.id
        WHERE u.is_active = true
      `;
      if (search && search.trim() !== "") {
        query += " AND (u.name ILIKE $1 OR u.email ILIKE $1)";
        values.push(`%${search}%`);
      }
      query += " ORDER BY u.id;";
    } else if (requestingUser.role === 'agency-admin') {
      if (!requestingUser.agency_id) {
        throw new Error('Agency user must have an agency_id');
      }
      query = `
        SELECT u.*, a.agency_name 
        FROM "USER" u 
        LEFT JOIN "AGENCY" a ON u.agency_id = a.id
        WHERE u.agency_id = $1 AND u.is_active = true
      `;
      values.push(requestingUser.agency_id);
      if (search && search.trim() !== "") {
        query += " AND (u.name ILIKE $2 OR u.email ILIKE $2)";
        values.push(`%${search}%`);
      }
      query += " ORDER BY u.id;";
    } else {
      query = `
        SELECT u.*, a.agency_name 
        FROM "USER" u 
        LEFT JOIN "AGENCY" a ON u.agency_id = a.id
        WHERE u.id = $1 AND u.is_active = true
      `;
      values.push(requestingUser.id);
      if (search && search.trim() !== "") {
        query += " AND (u.name ILIKE $2 OR u.email ILIKE $2)";
        values.push(`%${search}%`);
      }
    }
    const { rows } = await pool.query(query, values);
    return rows;
  } catch (error) {
    console.error('Error in listUsers:', error);
    throw error;
  }
}



/**
 * Get user by email.
 * @param {string} email - User's email address.
 * @returns {Promise<Object|null>} - Returns user object if found, otherwise null.
 */
async function getUserByEmail(email) {
  const query = `SELECT * FROM "USER" WHERE email = $1;`;
  try {
    const { rows } = await pool.query(query, [email]);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('Error in getUserByEmail:', error);
    throw error;
  }
}

async function getUsersByAgencyId(agencyId) {
  const query = `SELECT * FROM "USER" WHERE agency_id = $1;`;
  try {
    const { rows } = await pool.query(query, [agencyId]);
    return rows;
  } catch (error) {
    console.error('Error in getUsersByAgencyId:', error);
    throw error;
  }
}

/**
 * 获取指定 agency 下、指定角色的用户列表
 * @param {number} agencyId
 * @param {string} role
 * @returns {Promise<Array>} 返回符合条件的用户数组
 */
async function getUsersByAgencyIdAndRole(agencyId, role) {
  const sql = `
    SELECT *
    FROM "USER"
    WHERE agency_id = $1
      AND role = $2
      AND is_active = true -- 如果需要只查“活跃用户”，可加上这行
  `;
  try {
    const { rows } = await pool.query(sql, [agencyId, role]);
    return rows;
  } catch (error) {
    console.error("Error in getUsersByAgencyIdAndRole:", error);
    throw error;
  }
}


module.exports = {
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  listUsers,
  getUserByEmail,
  getUsersByAgencyId,
  getUsersByAgencyIdAndRole,
};
