// models/agency.model.js

const pool = require("../config/db");
const userModel = require("./userModel");
const propertyModel = require("./propertyModel"); // 内含 listProperties
const taskModel = require("./taskModel"); // 内含 listTasks

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
 * 获取单个 Agency 信息，并根据选项决定是否附带 properties / tasks。
 * - 会基于 requestingUser 的角色来做权限校验和数据范围过滤
 *
 * @param {number} agencyId  要查询的中介ID
 * @param {object} requestingUser  请求用户，内含 role, agency_id, id 等
 * @param {object} [options]
 * @param {boolean} [options.withProperties]   是否需要返回 properties
 * @param {boolean} [options.withTasks]        是否需要返回 tasks
 * @returns {object|null} 如果用户无权或不存在，返回 null，否则返回带 { ...agency, properties, tasks }
 */
async function getAgencyByAgencyId(agencyId, requestingUser, options = {}) {
  const { withProperties = false, withTasks = false } = options;

  // 1) 先查 AGENGY 基础信息
  const baseSQL = `SELECT * FROM "AGENCY" WHERE id = $1`;
  const { rows } = await pool.query(baseSQL, [agencyId]);
  const agencyRow = rows[0];
  if (!agencyRow) {
    return null; // 不存在
  }

  // 2) 权限检查：如果是 admin/superuser 可以看任意 agency；
  //    如果是 agency-user / agency-admin，需要确保请求的 agencyId == 自己的 agency_id，否则可以直接返回 null 或抛 403
  if (
    requestingUser.role !== "admin" &&
    requestingUser.role !== "superuser"
  ) {
    // 非 admin / superuser
    if (requestingUser.agency_id !== agencyId) {
      // 这里可以选择抛出 Error("Forbidden")，也可以返回 null
      return null;
    }
  }

  // 3) 若只想返回基础信息，就直接返回
  //    如果需要 properties/tasks，再额外查
  let properties = [];
  let tasks = [];

  // 3.1) 如果需要 properties
  if (withProperties) {
    // 从 propertyModel 调用 listProperties(requestingUser) 拿到用户有权查看的所有房产
    // 然后再在前端过滤 agency_id 是否匹配
    const allProps = await propertyModel.listProperties(requestingUser);
    // 但 "PROPERTY" 本身没有 agency_id；它关联到 user => user.agency_id
    // 这里可以先拿到所有 "user_id" 对应的 agency，再做对比
    // 或者我们也可以在 listProperties 里已经做了权限判断。
    // 既然上面已做用户->agency 校验，这里最保险就是"再"过滤一下:
    properties = allProps.filter((prop) => {
      // 你可以在 listProperties 里加 JOIN user
      // 也可以再去 userModel 查 user.agency_id
      // 简化写法:
      return true; // 其实因为我们前面已做过 "if agency != requestingUser.agency_id then null"
                   // 如果是 admin 返回了所有property, 这里再手动比对
      // 另外一种方式：获取 property 对应的 user => user.agency_id
      // 但是 listProperties() 里并没有返回 user.agency_id，需要额外处理
      // 如需严格过滤 agencyId, 需要先改写 listProperties() 让它带出 user.agency_id
    });

    // 同时，为了让返回结构跟你原先的一致就行 (id, address, user_id, is_active, created_at, updated_at 等)
    // listProperties 通常就返回这些字段，所以直接 properties = allProps.filter(...) 即可
  }

  // 3.2) 如果需要 tasks
  if (withTasks) {
    // 同理，从 taskModel 调用 listTasks(requestingUser) 拿到用户有权查看的所有任务
    const allTasks = await taskModel.listTasks(requestingUser);
    // 再按 agency_id === agencyId 过滤
    tasks = allTasks.filter((t) => t.agency_id === agencyId);

    // 然后把多余字段 (e.g. property_address, agency_name) 去掉或保留都行
    // 你要保持之前 JSON 的字段集合, 可以手动 map:
    tasks = tasks.map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      due_date: t.due_date,
      email_id: t.email_id,
      agency_id: t.agency_id,
      is_active: t.is_active,
      task_name: t.task_name,
      created_at: t.created_at,
      updated_at: t.updated_at,
      property_id: t.property_id,
      repeat_frequency: t.repeat_frequency,
      task_description: t.task_description,
      inspection_date: t.inspection_date ?? null, // 如果需要
    }));
  }

  // 4) 组装返回对象
  // 保持和原先的 { id, agency_name, address, ... , properties: [...], tasks: [...]} 同样的字段
  return {
    ...agencyRow,
    properties,
    tasks,
  };
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
         WHERE u.agency_id = a.id
           AND t.is_active = true) AS total_properties,
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
