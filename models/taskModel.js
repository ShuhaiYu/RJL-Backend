// models/taskModel.js
const pool = require("../config/db");
const dayjs = require("dayjs");
const userModel = require("./userModel");

/**
 * 创建任务（Task）
 * 插入时将 is_active 设置为 true
 * @param {Object} param0
 * @param {number} param0.property_id - 房产 ID
 * @param {string|Date} [param0.due_date] - 截止日期
 * @param {string} param0.task_name - 任务名称
 * @param {string} [param0.task_description] - 任务描述
 * @param {string|null} [param0.repeat_frequency] - 重复频率（可选）
 * @returns {Promise<Object>} 新创建的任务记录
 */
async function createTask({
  property_id,
  due_date = null,
  task_name,
  task_description = null,
  repeat_frequency = null,
  type = null,
  status = null,
  email_id = null,
  agency_id = null,
}) {
  const insertSQL = `
    INSERT INTO "TASK" 
      (property_id, due_date, task_name, task_description, repeat_frequency, type, status, email_id, agency_id, is_active)
    VALUES 
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
    RETURNING *;
  `;
  const values = [
    property_id,
    due_date,
    task_name,
    task_description,
    repeat_frequency,
    type,
    status,
    email_id,
    agency_id,
  ];
  const { rows } = await pool.query(insertSQL, values);
  return rows[0];
}

/**
 * 查询指定任务详情，包含所属房产信息，以及所有联系人和邮件（仅返回激活的任务）
 * @param {number} taskId
 * @returns {Promise<Object|null>} 任务详情，包含 property_xxx 字段、contacts 数组和 emails 数组
 */
async function getTaskById(taskId) {
  const querySQL = `
    SELECT
      T.id as task_id,
      T.task_name,
      T.task_description,
      T.due_date,
      T.inspection_date,
      T.repeat_frequency,
      T.property_id,
      T.status,
      T.type,
      T.email_id,
      T.agency_id,

      A.agency_name,
      
      P.address as property_address,
      
      C.id as contact_id,
      C.name as contact_name,
      C.phone as contact_phone,
      C.email as contact_email,
      
      E.id as email_id,
      E.subject as email_subject,
      E.sender as email_sender,
      E.email_body,
      E.html
    FROM "TASK" T
    LEFT JOIN "PROPERTY" P ON T.property_id = P.id
    LEFT JOIN "CONTACT" C ON C.property_id = P.id AND C.is_active = true
    LEFT JOIN "EMAIL" E ON E.id = T.email_id
    Left JOIN "AGENCY" A ON T.agency_id = A.id
    WHERE T.id = $1 AND T.is_active = true;
  `;
  const { rows } = await pool.query(querySQL, [taskId]);
  if (rows.length === 0) {
    return null;
  }

  // 任务及房产基本信息在每一行均相同
  const first = rows[0];
  const task = {
    id: first.task_id,
    task_name: first.task_name,
    task_description: first.task_description,
    due_date: first.due_date,
    inspection_date: first.inspection_date,
    repeat_frequency: first.repeat_frequency,
    status: first.status,
    type: first.type,
    property_id: first.property_id,
    property_address: first.property_address,
    contacts: [],
    email: [],
    email_id: first.email_id,
    agency_id: first.agency_id,
    agency_name: first.agency_name,
  };

  // 使用 Map 去重
  const contactsMap = new Map();
  const emailsMap = new Map();

  for (const row of rows) {
    // 收集联系人（仅激活联系人）
    if (row.contact_id && !contactsMap.has(row.contact_id)) {
      contactsMap.set(row.contact_id, {
        id: row.contact_id,
        name: row.contact_name,
        phone: row.contact_phone,
        email: row.contact_email,
      });
    }
    // 收集邮件
    if (row.email_id && !emailsMap.has(row.email_id)) {
      emailsMap.set(row.email_id, {
        id: row.email_id,
        subject: row.email_subject,
        sender: row.email_sender,
        email_body: row.email_body,
        html: row.html,
      });
    }
  }

  task.contacts = Array.from(contactsMap.values());
  task.emails = Array.from(emailsMap.values());

  return task;
}

/**
 * 列出任务
 * 根据请求用户的角色返回不同范围的任务：
 * - 若请求用户为 admin 或 superuser，返回所有激活的任务；
 * - 否则，仅返回其所属机构下的任务（即房产所属机构与请求用户的 agency_id 匹配）
 *
 * 同时支持通过 status 和 type 过滤任务，例如：tasks?status=UNKNOWN
 *
 * @param {Object} requestingUser - 请求用户对象，需包含 role 和（对于非 admin/superuser）agency_id
 * @param {Object} filters - 查询过滤器，可包含 status 和 type
 * @returns {Promise<Array>} 返回任务记录数组
 */
async function listTasks(requestingUser, filters = {}) {
  const { status, type } = filters;
  let querySQL = "";
  let values = [];

  if (requestingUser.role === "admin" || requestingUser.role === "superuser") {
    querySQL = `
      SELECT T.*, P.address as property_address, A.agency_name
      FROM "TASK" T
      LEFT JOIN "PROPERTY" P ON T.property_id = P.id
      LEFT JOIN "AGENCY" A ON T.agency_id = A.id
      WHERE T.is_active = true AND T.status <> 'COMPLETED' AND T.status <> 'HISTORY'
    `;
    // 如果提供了 status，则追加过滤条件
    if (status) {
      const normalizedStatus = status.replace(/_/g, " ");
      querySQL += ` AND T.status = $${values.length + 1}`;
      values.push(normalizedStatus);
    }
    // 如果提供了 type，则追加过滤条件
    if (type) {
      const normalizedType = type.replace(/_/g, " ");
      querySQL += ` AND T.type = $${values.length + 1}`;
      values.push(normalizedType);
    }
    querySQL += ` ORDER BY T.updated_at DESC;`;
  } else if (requestingUser.role === "agency-admin") {
    if (!requestingUser.agency_id) {
      throw new Error("Agency user must have an agency_id");
    }
    querySQL = `
      SELECT T.*, P.address as property_address, A.agency_name
      FROM "TASK" T
      JOIN "PROPERTY" P ON T.property_id = P.id
      JOIN "USER" U ON P.user_id = U.id
      JOIN "AGENCY" A ON T.agency_id = A.id
      WHERE T.is_active = true
        AND U.agency_id = $1
    `;
    values.push(requestingUser.agency_id);
    // 如果 query 参数中指定了 status，则使用该条件；否则使用默认过滤条件
    if (status) {
      const normalizedStatus = status.replace(/_/g, " ");

      querySQL += ` AND T.status = $${values.length + 1}`;
      values.push(normalizedStatus);
    } else {
      querySQL += ` AND T.status <> 'UNKNOWN'`;
    }
    if (type) {
      const normalizedType = type.replace(/_/g, " ");

      querySQL += ` AND T.type = $${values.length + 1}`;
      values.push(normalizedType);
    }
    querySQL += ` ORDER BY T.updated_at DESC;`;
  } else {
    if (!requestingUser.agency_id) {
      throw new Error("Non-admin user must have an agency_id");
    }
    querySQL = `
      SELECT T.*, P.user_id, P.address as property_address, A.agency_name
      FROM "TASK" T
      JOIN "PROPERTY" P ON T.property_id = P.id
      JOIN "AGENCY" A ON T.agency_id = A.id
      WHERE T.is_active = true 
        AND P.user_id = $1
    `;
    values.push(requestingUser.id);
    if (status) {
      const normalizedStatus = status.replace(/_/g, " ");

      querySQL += ` AND T.status = $${values.length + 1}`;
      values.push(normalizedStatus);
    } else {
      querySQL += ` AND T.status <> 'UNKNOWN'`;
    }
    if (type) {
      const normalizedType = type.replace(/_/g, " ");

      querySQL += ` AND T.type = $${values.length + 1}`;
      values.push(normalizedType);
    }
    querySQL += ` ORDER BY T.updated_at DESC;`;
  }
  const { rows } = await pool.query(querySQL, values);
  return rows;
}

async function listTodayTasks(requestingUser) {
  let tasks = [];

  if (requestingUser.role === "admin" || requestingUser.role === "superuser") {
    // (A) admin / superuser：返回所有需要提醒的任务
    const sqlAdmin = `
      SELECT t.*, p.address as property_address, A.agency_name
      FROM "TASK" t
      JOIN "PROPERTY" p ON t.property_id = p.id
      JOIN "AGENCY" A ON T.agency_id = A.id
      WHERE t.is_active = true
        AND t.due_date <= (NOW() + INTERVAL '3 months')
        AND t.status <> 'COMPLETED'
      ORDER BY T.updated_at DESC
    `;
    const { rows } = await pool.query(sqlAdmin);
    tasks = rows;
  } else if (requestingUser.role === "agency-admin") {
    // (B) agency-admin：返回同机构下所有用户的需要提醒任务

    // 1. 获取该机构下所有用户
    const agencyUsers = await userModel.getUsersByAgencyId(
      requestingUser.agency_id
    );
    if (!agencyUsers || agencyUsers.length === 0) {
      return [];
    }
    // 2. 收集用户的 id
    const userIds = agencyUsers.map((u) => u.id); // e.g. [2, 5, 10, ...]

    // 3. 查询任务：物业的创建者在这些用户之中
    const sqlAgencyAdmin = `
      SELECT t.*, p.address as property_address, A.agency_name
      FROM "TASK" t
      JOIN "PROPERTY" p ON t.property_id = p.id
      JOIN "AGENCY" A ON T.agency_id = A.id
      WHERE t.is_active = true
        AND t.due_date <= (NOW() + INTERVAL '3 months')
        AND t.status <> 'COMPLETED'
        AND p.user_id = ANY($1::int[])
      ORDER BY T.updated_at DESC
    `;
    const { rows } = await pool.query(sqlAgencyAdmin, [userIds]);
    tasks = rows;
  } else {
    // (C) agency-user：只返回自己创建的物业对应的需要提醒任务
    const sqlAgencyUser = `
      SELECT t.*, p.address as property_address, A.agency_name
      FROM "TASK" t
      JOIN "PROPERTY" p ON t.property_id = p.id
      JOIN "AGENCY" A ON T.agency_id = A.id
      WHERE t.is_active = true
        AND t.due_date <= (NOW() + INTERVAL '3 months')
        AND t.status <> 'COMPLETED'
        AND p.user_id = $1
      ORDER BY T.updated_at DESC
    `;
    const { rows } = await pool.query(sqlAgencyUser, [requestingUser.id]);
    tasks = rows;
  }

  return tasks;
}

async function listDueSoonTasks(user) {
  const twoMonthsLater = dayjs().add(2, "month").toISOString();

  const sql = `
      SELECT t.* , p.address as property_address, A.agency_name
      FROM "TASK" t
      JOIN "PROPERTY" p ON p.id = t.property_id
      JOIN "AGENCY" A ON T.agency_id = A.id
      WHERE t.status = 'INCOMPLETE'
        AND t.is_active = true
        AND t.due_date IS NOT NULL
        AND t.due_date <= $1
        AND p.user_id = $2
      ORDER BY t.due_date ASC
    `;

  const { rows } = await pool.query(sql, [twoMonthsLater, user.id]);
  return rows;
}

async function listProcessingTasks(user) {
  const sql = `
      SELECT t.* , p.address as property_address, A.agency_name
      FROM "TASK" t
      JOIN "PROPERTY" p ON p.id = t.property_id
      JOIN "AGENCY" A ON T.agency_id = A.id
      WHERE t.status = 'PROCESSING'
        AND t.is_active = true
        AND p.user_id = $1
      ORDER BY t.due_date ASC
    `;

  const { rows } = await pool.query(sql, [user.id]);
  return rows;
}

/**
 * 软删除任务
 * 将指定任务的 is_active 字段设置为 false
 * @param {number} taskId - 任务 ID
 * @returns {Promise<Object>} 返回更新后的任务记录
 */
async function deleteTask(taskId) {
  const updateSQL = `
    UPDATE "TASK"
    SET is_active = false
    WHERE id = $1
    RETURNING *;
  `;
  const { rows } = await pool.query(updateSQL, [taskId]);
  return rows[0];
}

/**
 * 更新任务信息
 * @param {number} taskId - 任务 ID
 * @param {Object} fields - 包含要更新的字段
 * @returns {Promise<Object>} 返回更新后的任务记录
 */
async function updateTask(taskId, fields) {
  // 1) 先获取数据库里旧记录
  const existing = await getTaskById(taskId);
  if (!existing) throw new Error("Task not found");

  // 2) 合并字段
  const finalDueDate =
    fields.due_date === "" ? null : fields.due_date ?? existing.due_date;
  const finalInspectionDate =
    fields.inspection_date === ""
      ? null
      : fields.inspection_date ?? existing.inspection_date;
  const finalTaskName = fields.task_name ?? existing.task_name;
  const finalDescription = fields.task_description ?? existing.task_description;
  const finalRepeat = fields.repeat_frequency ?? existing.repeat_frequency;
  // 注意：若更新了 type，就用新的；否则用旧的
  const finalType = fields.type ?? existing.type;
  // 同理 status
  const finalStatus = fields.status ?? existing.status;
  // 若没有指定 agency_id，使用原有 agency_id
  const finalAgency = fields.agency_id ?? existing.agency_id;

  // 3) 在更新之前判断：是否从 UNKNOWN -> INCOMPLETE 并且 archive_conflicts=true
  const goingFromUnknownToIncomplete =
    existing.status === "UNKNOWN" && finalStatus === "INCOMPLETE";
  const archiveConflicts = fields.archive_conflicts === true; // 前端可能传 Boolean

  if (goingFromUnknownToIncomplete && archiveConflicts) {
    // 执行批量归档
    await archiveConflictingTasks(existing.property_id, finalType);
  }

  // 4) 构造 SQL
  const updateSQL = `
    UPDATE "TASK"
    SET 
      due_date = $1,
      task_name = $2,
      task_description = $3,
      repeat_frequency = $4,
      inspection_date = $5,
      type = $6,
      status = $7,
      agency_id = $8
    WHERE id = $9
    RETURNING *;
  `;

  // 5) 执行更新
  const { rows } = await pool.query(updateSQL, [
    finalDueDate,
    finalTaskName,
    finalDescription,
    finalRepeat,
    finalInspectionDate,
    finalType,
    finalStatus,
    finalAgency,
    taskId,
  ]);
  return rows[0];
}

/**
 * 根据 property_id + task_name 查找是否已存在同名任务
 * 可根据需要再加 type/status 等条件
 */
async function getTaskByNameAndProperty(task_name, property_id) {
  const sql = `
    SELECT *
    FROM "TASK"
    WHERE task_name = $1
      AND property_id = $2
      AND is_active = true
    LIMIT 1;
  `;
  const { rows } = await pool.query(sql, [task_name, property_id]);
  return rows[0] || null;
}

/**
 * 更新 TASK.email_id
 */
async function updateTaskEmailId(taskId, emailId) {
  const sql = `
    UPDATE "TASK"
    SET email_id = $1
    WHERE id = $2
    RETURNING *;
  `;
  const { rows } = await pool.query(sql, [emailId, taskId]);
  return rows[0];
}

/**
 * 将同一房产、同一类型、状态为 "DUE SOON" 或 "EXPIRED" 的任务归档 (status = 'HISTORY')
 * @param {number} propertyId
 * @param {string} taskType
 * @returns {Promise<number>} 返回受影响行数
 */
async function archiveConflictingTasks(propertyId, taskType) {
  const sql = `
    UPDATE "TASK"
    SET status = 'HISTORY'
    WHERE property_id = $1
      AND type = $2
      AND status IN ('DUE SOON', 'EXPIRED')
      AND is_active = true
  `;
  const { rowCount } = await pool.query(sql, [propertyId, taskType]);
  return rowCount;
}

/**
 * 获取 Dashboard 统计数据
 * - 如果 user.agency_id 不存在 => admin/superuser，统计所有任务（包含 UNKNOWN），并统计机构数量与房产数量
 * - 如果 user.agency_id 存在 => agency 用户，不统计 UNKNOWN，并只统计该 agency 下的任务；
 *   同时返回 completed_count，并统计该机构下的房产数量
 *
 * 返回字段：
 *  对 admin/superuser:
 *    unknown_count, incomplete_count, processing_count, due_soon_count, expired_count, agency_count, property_count
 *  对 agency 用户:
 *    unknown_count (0), incomplete_count, processing_count, completed_count, due_soon_count, expired_count, property_count
 */
async function getDashboardStats(user) {
  const hasAgency = !!user.agency_id;

  if (!hasAgency) {
    // admin/superuser
    const sqlAdmin = `
      SELECT
        (SELECT COUNT(*) FROM "TASK" t WHERE t.is_active = true AND t.status = 'UNKNOWN') AS unknown_count,
        (SELECT COUNT(*) FROM "TASK" t WHERE t.is_active = true AND t.status = 'INCOMPLETE') AS incomplete_count,
        (SELECT COUNT(*) FROM "TASK" t WHERE t.is_active = true AND t.status = 'PROCESSING') AS processing_count,
        (SELECT COUNT(*) FROM "TASK" t WHERE t.is_active = true AND t.status = 'DUE SOON') AS due_soon_count,
        (SELECT COUNT(*) FROM "TASK" t WHERE t.is_active = true AND t.status = 'EXPIRED') AS expired_count,
        (SELECT COUNT(*) FROM "AGENCY" a WHERE a.is_active = true) AS agency_count,
        (SELECT COUNT(*) FROM "PROPERTY" p WHERE p.is_active = true) AS property_count
      ;
    `;
    const { rows } = await pool.query(sqlAdmin);
    return rows[0];
  } else {
    // agency 用户
    const sqlAgency = `
      SELECT
        0 AS unknown_count,
        (SELECT COUNT(*) FROM "TASK" t WHERE t.is_active = true AND t.status = 'INCOMPLETE' AND t.agency_id = $1) AS incomplete_count,
        (SELECT COUNT(*) FROM "TASK" t WHERE t.is_active = true AND t.status = 'PROCESSING' AND t.agency_id = $1) AS processing_count,
        (SELECT COUNT(*) FROM "TASK" t WHERE t.is_active = true AND t.status = 'COMPLETED' AND t.agency_id = $1) AS completed_count,
        (SELECT COUNT(*) FROM "TASK" t WHERE t.is_active = true AND t.status = 'DUE SOON' AND t.agency_id = $1) AS due_soon_count,
        (SELECT COUNT(*) FROM "TASK" t WHERE t.is_active = true AND t.status = 'EXPIRED' AND t.agency_id = $1) AS expired_count,
        (SELECT COUNT(*) 
                        FROM "PROPERTY" p 
                        JOIN "USER" u ON p.user_id = u.id 
                        WHERE p.is_active = true AND u.agency_id = $1) AS property_count

      ;
    `;
    const { rows } = await pool.query(sqlAgency, [user.agency_id]);
    return rows[0];
  }
}

module.exports = {
  createTask,
  getTaskById,
  listTasks,
  deleteTask,
  updateTask,
  listTodayTasks,
  listDueSoonTasks,
  listProcessingTasks,
  getTaskByNameAndProperty,
  updateTaskEmailId,
  archiveConflictingTasks,
  getDashboardStats,
};
