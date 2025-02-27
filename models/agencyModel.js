// models/agency.model.js

const pool = require("../config/db");

/**
 * 创建新机构记录
 * 注意：该方法仅负责在 AGENCY 表中插入机构信息，不再创建对应用户，
 * 用户的创建逻辑请放在 Controller 层处理。
 *
 * @param {Object} param0 - 机构数据对象
 * @param {string} param0.agency_name - 机构名称
 * @param {string|null} [param0.address=null] - 机构地址
 * @param {string|null} [param0.phone=null] - 机构电话
 * @param {string|null} [param0.logo=null] - 机构 Logo
 * @returns {Promise<Object>} 返回新创建的机构记录
 */
async function createAgency({
  agency_name,
  address = null,
  phone = null,
  logo = null,
}) {
  const insertAgencySQL = `
    INSERT INTO "AGENCY" (agency_name, address, phone, logo)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;
  try {
    const { rows } = await pool.query(insertAgencySQL, [
      agency_name,
      address,
      phone,
      logo,
    ]);
    return rows[0];
  } catch (error) {
    console.error("Error in createAgency:", error);
    throw error;
  }
}

/**
 * 根据机构 ID 获取机构信息及其房产信息
 *
 * @param {number} agencyId - 机构 ID
 * @returns {Promise<Object|null>} 返回机构记录，包含 properties 字段，如不存在则返回 null
 */
async function getAgencyByAgencyId(agencyId) {
  const querySQL = `
      SELECT 
        A.*, 
        COALESCE(json_agg(DISTINCT P) FILTER (WHERE P.id IS NOT NULL), '[]') AS properties,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', T.id,
              'property_id', T.property_id,
              'due_date', T.due_date,
              'task_name', T.task_name,
              'task_description', T.task_description,
              'repeat_frequency', T.repeat_frequency,
              'next_reminder', T.next_reminder,
              'type', T.type,
              'status', T.status,
              'is_active', T.is_active,
              'email_id', T.email_id,
              'agency_id', T.agency_id,
              'created_at', T.created_at,
              'updated_at', T.updated_at,
              'property_address', P.address  
            )
          ) FILTER (WHERE T.id IS NOT NULL),
          '[]'
        ) AS tasks
      FROM "AGENCY" A
      JOIN "USER" U ON A.id = U.agency_id
      LEFT JOIN "PROPERTY" P ON U.id = P.user_id
      LEFT JOIN "TASK" T ON P.id = T.property_id AND T.agency_id = A.id
      WHERE A.id = $1
      GROUP BY A.id;




  `;
  try {
    const { rows } = await pool.query(querySQL, [agencyId]);
    return rows[0] || null;
  } catch (error) {
    console.error("Error in getAgencyByAgencyId:", error);
    throw error;
  }
}

/**
 * 更新机构信息
 * 动态构造更新语句，允许更新多个字段，例如 { agency_name, address, phone, logo, is_active }
 *
 * @param {number} agencyId - 机构 ID
 * @param {Object} fields - 要更新的字段及新值的对象
 * @returns {Promise<Object>} 返回更新后的机构记录
 */
async function updateAgency(agencyId, fields) {
  try {
    const keys = Object.keys(fields);
    if (keys.length === 0) {
      throw new Error("No fields provided for update");
    }
    // 动态构造 SET 子句，例如："agency_name" = $1, "address" = $2, ...
    const setClause = keys
      .map((key, index) => `"${key}" = $${index + 1}`)
      .join(", ");
    const values = keys.map((key) => fields[key]);
    const querySQL = `UPDATE "AGENCY" SET ${setClause} WHERE id = $${
      keys.length + 1
    } RETURNING *;`;
    const { rows } = await pool.query(querySQL, [...values, agencyId]);
    return rows[0];
  } catch (error) {
    console.error("Error in updateAgency:", error);
    throw error;
  }
}

/**
 * 列出所有机构记录
 *
 * @returns {Promise<Array>} 返回机构记录数组
 */
async function listAgencies(search = "") {
  let querySQL = `SELECT * FROM "AGENCY" WHERE is_active = true`;
  let values = [];
  if (search && search.trim() !== "") {
    querySQL += " AND agency_name ILIKE $1";
    values.push(`%${search}%`);
  }
  querySQL += " ORDER BY id;";
  try {
    const { rows } = await pool.query(querySQL, values);
    return rows;
  } catch (error) {
    console.error("Error in listAgencies:", error);
    throw error;
  }
}


/**
 * 删除指定机构记录（软删除）
 *
 * @param {number} agencyId - 机构 ID
 * @returns {Promise<Object>} 返回被删除的机构记录
 */
async function deleteAgency(agencyId) {
  const deleteSQL = `UPDATE "AGENCY" SET is_active = false WHERE id = $1 RETURNING *;`;
  try {
    const { rows } = await pool.query(deleteSQL, [agencyId]);
    return rows[0];
  } catch (error) {
    console.error("Error in deleteAgency:", error);
    throw error;
  }
}

async function getAgencyByUserId(userId) {
  // 假设 USER 表上有 agency_id 字段
  const sql = `
    SELECT A.*
    FROM "AGENCY" A
    JOIN "USER" U ON U.agency_id = A.id
    WHERE U.id = $1
      AND A.is_active=true
  `;
  const { rows } = await pool.query(sql, [userId]);
  return rows[0] || null;
}

/**
 * 根据传入的 email，判断是否在任何 agency 的白名单
 * 如果是，返回对应 agency; 否则返回 null
 */
async function getAgencyByWhiteListEmail(email) {
  // 例如：email = "pm5@eighthquarter.com.au"
  // 也可能只对比 domain => "eighthquarter.com.au"

  // 先看 AGENCY_WHITELIST
  const sql = `
    SELECT A.*
    FROM "AGENCY_WHITELIST" W
    JOIN "AGENCY" A ON W.agency_id = A.id
    WHERE $1 LIKE '%' || W.email_pattern
      AND A.is_active=true
      -- 这里简单做 "endsWith()" 的效果
      -- 也可以更严格: W.email_pattern = RIGHT($1, LENGTH(W.email_pattern))
    LIMIT 1
  `;
  const { rows } = await pool.query(sql, [email]);
  return rows[0] || null;
}

module.exports = {
  createAgency,
  getAgencyByAgencyId,
  updateAgency,
  listAgencies,
  deleteAgency,
  getAgencyByUserId,
  getAgencyByWhiteListEmail,
};
