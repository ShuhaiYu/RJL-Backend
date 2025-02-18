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
}) {
  const insertSQL = `
    INSERT INTO "TASK" (property_id, due_date, task_name, task_description, repeat_frequency, type, status, email_id, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
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
      T.repeat_frequency,
      T.property_id,
      T.status,
      T.type,
      T.email_id,
      
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
    repeat_frequency: first.repeat_frequency,
    status: first.status,
    type: first.type,
    property_id: first.property_id,
    property_address: first.property_address,
    contacts: [],
    email: [],
    email_id: first.email_id,
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
 * @param {Object} requestingUser - 请求用户对象，需包含 role 和（对于非 admin/superuser）agency_id
 * @returns {Promise<Array>} 返回任务记录数组
 */
async function listTasks(requestingUser) {
  let querySQL = "";
  let values = [];
  if (requestingUser.role === "admin" || requestingUser.role === "superuser") {
    querySQL = `
      SELECT T.*, P.address as property_address
      FROM "TASK" T
      LEFT JOIN "PROPERTY" P ON T.property_id = P.id
      WHERE T.is_active = true
      ORDER BY T.id DESC;
    `;
  } else if (requestingUser.role === "agency-admin") {
    if (!requestingUser.agency_id) {
      throw new Error("Agency user must have an agency_id");
    }
    querySQL = `
      SELECT T.*, P.address as property_address
      FROM "TASK" T
      JOIN "PROPERTY" P ON T.property_id = P.id
      JOIN "USER" U ON P.user_id = U.id
      WHERE T.is_active = true
        AND U.agency_id = $1
      ORDER BY T.id DESC;
    `;
    values.push(requestingUser.agency_id);
  } else {
    if (!requestingUser) {
      throw new Error("Non-admin user must have an agency_id");
    }
    querySQL = `
      SELECT T.*, P.address as property_address
      FROM "TASK" T
      LEFT JOIN "PROPERTY" P ON T.property_id = P.id
      WHERE T.is_active = true AND P.user_id = $1
      ORDER BY T.id DESC;
    `;
    values.push(requestingUser.id);
  }
  const { rows } = await pool.query(querySQL, values);
  return rows;
}

async function listTodayTasks(requestingUser) {
  // 2) 计算 today (只比较到日期级别)
  //    你可以用 dayjs().format('YYYY-MM-DD') 或 new Date() + cast::date
  const todayString = dayjs().format("YYYY-MM-DD");

  let tasks = [];

  if (requestingUser.role === "admin" || requestingUser.role === "superuser") {
    // ----- (A) admin / superuser => 返回所有今日到期的任务 -----
    const sqlAdmin = `
        SELECT t.*, p.address as property_address
        FROM "TASK" t
        JOIN "PROPERTY" p ON t.property_id = p.id
        WHERE t.is_active = true
          AND to_char(t.due_date, 'YYYY-MM-DD') = $1
        ORDER BY t.id DESC
      `;
    const { rows } = await pool.query(sqlAdmin, [todayString]);
    tasks = rows;
  } else if (requestingUser.role === "agency-admin") {
    // ----- (B) agency-admin => 返回同机构下所有用户的今日任务 -----

    // 1. 找到该 agency 下所有用户
    const agencyUsers = await userModel.getUsersByAgencyId(
      requestingUser.agency_id
    );
    if (!agencyUsers || agencyUsers.length === 0) {
      return res.status(200).json([]);
    }
    // 2. 收集这些用户的 id
    const userIds = agencyUsers.map((u) => u.id); // e.g [2,5,10,...]
    // 3. 查 TASK where property_id in (select p.id from PROPERTY p where p.user_id in userIds)
    const sqlAgencyAdmin = `
        SELECT t.*, p.address as property_address
        FROM "TASK" t
        JOIN "PROPERTY" p ON t.property_id = p.id
        WHERE t.is_active = true
          AND to_char(t.due_date, 'YYYY-MM-DD') = $1
          AND p.user_id = ANY($2::int[])
        ORDER BY t.id DESC
      `;
    const { rows } = await pool.query(sqlAgencyAdmin, [todayString, userIds]);
    tasks = rows;
  } else {
    // ----- (C) agency-user => 只返回自己 user_id 创建的 property 的今日任务 -----

    const sqlAgencyUser = `
        SELECT t.*
        FROM "TASK" t
        JOIN "PROPERTY" p ON t.property_id = p.id
        WHERE t.is_active = true
          AND to_char(t.due_date, 'YYYY-MM-DD') = $1
          AND p.user_id = $2
        ORDER BY t.id DESC
      `;
    const { rows } = await pool.query(sqlAgencyUser, [
      todayString,
      requestingUser.id,
    ]);
    tasks = rows;
  }

  // 3) 返回结果
  return tasks;
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
 * 可更新字段包括：due_date, task_name, task_description, repeat_frequency
 * @param {number} taskId - 任务 ID
 * @param {Object} param1 - 包含要更新的字段
 * @returns {Promise<Object>} 返回更新后的任务记录
 */
async function updateTask(taskId, fields) {
  // 1) 先获取数据库里旧记录
  const existing = await getTaskById(taskId);
  if (!existing) throw new Error("Task not found");

  // 2) 合并：若 fields.xxx 不存在，就用 existing.xxx
  const finalDueDate = fields.due_date ?? existing.due_date;
  const finalTaskName = fields.task_name ?? existing.task_name;
  const finalDescription = fields.task_description ?? existing.task_description;
  const finalRepeat = fields.repeat_frequency ?? existing.repeat_frequency;
  const finalType = fields.type ?? existing.type;
  const finalStatus = fields.status ?? existing.status;

  // 3) 构造 SQL
  const updateSQL = `
    UPDATE "TASK"
    SET 
      due_date = $1,
      task_name = $2,
      task_description = $3,
      repeat_frequency = $4,
      type = $5,
      status = $6
    WHERE id = $7
    RETURNING *;
  `;

  // 4) 执行更新
  const { rows } = await pool.query(updateSQL, [
    finalDueDate,
    finalTaskName,
    finalDescription,
    finalRepeat,
    finalType,
    finalStatus,
    taskId,
  ]);
  return rows[0];
}

module.exports = {
  createTask,
  getTaskById,
  listTasks,
  deleteTask,
  updateTask,
  listTodayTasks,
};
