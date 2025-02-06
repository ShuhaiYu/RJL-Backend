// models/taskModel.js
const pool = require('../config/db');

/**
 * 创建任务（Task）
 * @param {Object} param0
 * @param {number} param0.property_id - 房产 ID
 * @param {string|Date} [param0.due_date] - 截止日期
 * @param {string} param0.task_name - 任务名称
 * @param {string} [param0.task_description] - 任务描述
 * @returns {Object} 新创建的任务记录
 */
async function createTask({ property_id, due_date = null, task_name, task_description = null }) {
  const insertSQL = `
    INSERT INTO "TASK" (property_id, due_date, task_name, task_description)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;
  const values = [property_id, due_date, task_name, task_description];
  const { rows } = await pool.query(insertSQL, values);
  return rows[0];
}

/**
 * 查询指定任务详情，包含所属房产信息，以及所有联系人
 * @param {number} taskId
 * @returns {Object} 任务详情，包含 property_xxx 字段和 contacts 数组和 emails 数组
 */
async function getTaskById(taskId) {
  const querySQL = `
    SELECT
      T.id as task_id,
      T.task_name,
      T.task_description,
      T.due_date,
      T.property_id,

      P.name as property_name,
      P.address as property_address,
      P.agency_id as property_agency_id,

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
    LEFT JOIN "CONTACT" C ON C.task_id = T.id
    LEFT JOIN "EMAIL" E ON E.task_id = T.id
    WHERE T.id = $1;
  `;
  const { rows } = await pool.query(querySQL, [taskId]);
  if (rows.length === 0) {
    // 没有找到这个任务
    return null;
  }

  // 取第一行拿到任务和房产的基本信息
  const first = rows[0];

  const task = {
    id: first.task_id,
    task_name: first.task_name,
    task_description: first.task_description,
    due_date: first.due_date,
    property_id: first.property_id,

    // 房产信息
    property_name: first.property_name,
    property_address: first.property_address,
    property_agency_id: first.property_agency_id,

    // 将在下面的循环中收集到
    contacts: [],
    emails: []
  };

  // 使用Map来去重（key=contact_id / email_id）
  const contactsMap = new Map();
  const emailsMap = new Map();

  for (const row of rows) {
    // 收集联系人
    if (row.contact_id) {
      if (!contactsMap.has(row.contact_id)) {
        contactsMap.set(row.contact_id, {
          id: row.contact_id,
          name: row.contact_name,
          phone: row.contact_phone,
          email: row.contact_email,
        });
      }
    }

    // 收集邮件
    if (row.email_id) {
      if (!emailsMap.has(row.email_id)) {
        emailsMap.set(row.email_id, {
          id: row.email_id,
          subject: row.email_subject,
          sender: row.email_sender,
          email_body: row.email_body,
          html: row.html
        });
      }
    }
  }

  // 转化为数组
  task.contacts = Array.from(contactsMap.values());
  task.emails = Array.from(emailsMap.values());

  return task;
}



/**
 * 查询所有任务（供 admin 使用），同时返回房产信息
 * @returns {Array} 任务数组，每条任务包含所属房产部分信息
 */
async function getAllTasks() {
  const querySQL = `
    SELECT T.*, P.name as property_name, P.address as property_address, P.agency_id as property_agency_id
    FROM "TASK" T
    LEFT JOIN "PROPERTY" P ON T.property_id = P.id
    ORDER BY T.id DESC;
  `;
  const { rows } = await pool.query(querySQL);
  return rows;
}

/**
 * 根据机构 ID 查询所有任务（供 agency 使用），返回任务记录同时附带房产信息
 * @param {number} agency_id 
 * @returns {Array} 任务数组
 */
async function getAllTasksByAgency(agency_id) {
  const querySQL = `
    SELECT T.*, P.name as property_name, P.address as property_address, P.agency_id as property_agency_id
    FROM "TASK" T
    JOIN "PROPERTY" P ON T.property_id = P.id
    WHERE P.agency_id = $1
    ORDER BY T.id DESC;
  `;
  const { rows } = await pool.query(querySQL, [agency_id]);
  return rows;
}

async function deleteTask(taskId) {
  const deleteSQL = `
    DELETE FROM "TASK" WHERE id = $1;
  `;
  await pool.query(deleteSQL, [taskId]);
}

async function updateTask(taskId, { due_date, task_name, task_description }) {
  const updateSQL = `
    UPDATE "TASK"
    SET due_date = $1, task_name = $2, task_description = $3
    WHERE id = $4
    RETURNING *;
  `;
  const { rows } = await pool.query(updateSQL, [due_date, task_name, task_description, taskId]);
  return rows[0];
}

module.exports = {
  createTask,
  getTaskById,
  getAllTasks,
  getAllTasksByAgency,
  deleteTask,
  updateTask,
};
