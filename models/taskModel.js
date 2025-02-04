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
 * 查询指定任务详情（同时返回所属房产信息）
 * @param {number} taskId
 * @returns {Object} 任务详情及所属房产信息
 */
async function getTaskById(taskId) {
  const querySQL = `
    SELECT T.*, P.name as property_name, P.address as property_address, P.agency_id as property_agency_id
    FROM "TASK" T
    LEFT JOIN "PROPERTY" P ON T.property_id = P.id
    WHERE T.id = $1;
  `;
  const { rows } = await pool.query(querySQL, [taskId]);
  return rows[0];
};

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

module.exports = {
  createTask,
  getTaskById,
  getAllTasks,
  getAllTasksByAgency,
};
