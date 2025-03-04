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
 * @param {number} agencyId
 * @param {object} [options]
 * @param {boolean} [options.withProperties] 是否需要返回 properties 数组
 * @param {boolean} [options.withTasks] 是否需要返回 tasks 数组
 */
async function getAgencyByAgencyId(agencyId, options = {}) {
  const { withProperties = false, withTasks = false } = options;

  // 1) 先定义基础 SELECT 只查 AGENCY 表
  let selectFields = ['A.*'];
  
  // 2) 如果需要 properties，就增加一个子查询
  if (withProperties) {
    selectFields.push(`
      (
        SELECT COALESCE(json_agg(row_to_json(p)), '[]')
        FROM "USER" u
        JOIN "PROPERTY" p ON p.user_id = u.id
        WHERE u.agency_id = A.id
      ) AS properties
    `);
  }

  // 3) 如果需要 tasks，就增加另一个子查询
  if (withTasks) {
    selectFields.push(`
      (
        SELECT COALESCE(json_agg(
          jsonb_build_object(
            'id', t.id,
            'property_id', t.property_id,
            'due_date', t.due_date,
            'task_name', t.task_name,
            'task_description', t.task_description,
            'repeat_frequency', t.repeat_frequency,
            'type', t.type,
            'status', t.status,
            'is_active', t.is_active,
            'email_id', t.email_id,
            'agency_id', t.agency_id,
            'created_at', t.created_at,
            'updated_at', t.updated_at
          )
        ), '[]')
        FROM "TASK" t
        WHERE t.agency_id = A.id
      ) AS tasks
    `);
  }

  // 4) 组合最终查询 SQL
  const querySQL = `
    SELECT 
      ${selectFields.join(',\n')}
    FROM "AGENCY" A
    WHERE A.id = $1
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
 * 列出所有机构记录及相关指标：
 * - total_users: 机构下的用户数量
 * - total_properties: 机构下的房产数量（通过 property.user_id 与 user.agency_id 关联）
 * - total_unknown_job_orders: 同一房产中状态为 UNKNOWN 的任务（只计一次）
 * - total_incomplete_job_orders: 状态为 INCOMPLETE 的任务数量
 * - total_processing_job_orders: 状态为 PROCESSING 的任务数量
 * - total_due_soon_job_orders: 状态为 DUE SOON 的任务数量
 * - total_expired_job_orders: 状态为 EXPIRED 的任务数量
 *
 * @param {string} search - 搜索关键字，用于机构名称模糊匹配
 * @returns {Promise<Array>} 返回机构记录数组
 */
async function listAgencies(search = "") {
  let querySQL = `
    SELECT 
      a.*,
      (SELECT COUNT(*) FROM "USER" u WHERE u.agency_id = a.id) AS total_users,
      (SELECT COUNT(*) 
         FROM "PROPERTY" p 
         JOIN "USER" u ON p.user_id = u.id
         WHERE u.agency_id = a.id) AS total_properties,
      (SELECT COUNT(DISTINCT p.id)
         FROM "TASK" t
         JOIN "PROPERTY" p ON t.property_id = p.id
         JOIN "USER" u ON p.user_id = u.id
         WHERE t.status = 'UNKNOWN'
           AND u.agency_id = a.id
           AND t.is_active = true
      ) AS total_unknown_job_orders,
      (SELECT COUNT(*) 
         FROM "TASK" t
         JOIN "PROPERTY" p ON t.property_id = p.id
         JOIN "USER" u ON p.user_id = u.id
         WHERE t.status = 'INCOMPLETE'
           AND u.agency_id = a.id
           AND t.is_active = true
      ) AS total_incomplete_job_orders,
      (SELECT COUNT(*) 
         FROM "TASK" t
         JOIN "PROPERTY" p ON t.property_id = p.id
         JOIN "USER" u ON p.user_id = u.id
         WHERE t.status = 'PROCESSING'
           AND u.agency_id = a.id
           AND t.is_active = true
      ) AS total_processing_job_orders,
      (SELECT COUNT(*) 
         FROM "TASK" t
         JOIN "PROPERTY" p ON t.property_id = p.id
         JOIN "USER" u ON p.user_id = u.id
         WHERE t.status = 'DUE SOON'
           AND u.agency_id = a.id
           AND t.is_active = true
      ) AS total_due_soon_job_orders,
      (SELECT COUNT(*) 
         FROM "TASK" t
         JOIN "PROPERTY" p ON t.property_id = p.id
         JOIN "USER" u ON p.user_id = u.id
         WHERE t.status = 'EXPIRED'
           AND u.agency_id = a.id
           AND t.is_active = true
      ) AS total_expired_job_orders
    FROM "AGENCY" a
    WHERE a.is_active = true
  `;
  let values = [];
  if (search && search.trim() !== "") {
    querySQL += " AND a.agency_name ILIKE $1";
    values.push(`%${search}%`);
  }
  querySQL += " ORDER BY a.id;";
  
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
  // 先看 AGENCY_WHITELIST
  const sql = `
    SELECT A.*
    FROM "AGENCY_WHITELIST" W
    JOIN "AGENCY" A ON W.agency_id = A.id
    WHERE W.email_address = $1
      AND A.is_active = true
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
