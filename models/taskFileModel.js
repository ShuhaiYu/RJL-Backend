// src/models/taskFileModel.js
const pool = require("../config/db");

/**
 * 新增一条任务文件记录
 */
async function insertTaskFile(taskId, fileKey, fileName, fileDesc) {
  const insertSQL = `
    INSERT INTO "TASK_FILES"(task_id, file_s3_key, file_name, file_desc, created_at, updated_at)
    VALUES($1, $2, $3, $4, NOW(), NOW())
    RETURNING *;
  `;
  const values = [taskId, fileKey, fileName, fileDesc || ""];
  const { rows } = await pool.query(insertSQL, values);
  return rows[0];
}

/**
 * 获取指定任务的所有文件
 */
async function getTaskFiles(taskId) {
  const querySQL = `
    SELECT 
      id, 
      task_id, 
      file_s3_key, 
      file_name, 
      file_desc, 
      created_at, 
      updated_at
    FROM "TASK_FILES"
    WHERE task_id = $1
    ORDER BY created_at DESC;
  `;
  const { rows } = await pool.query(querySQL, [taskId]);
  return rows;
}

/**
 * 根据 fileId + taskId 获取单条文件记录
 */
async function getTaskFileById(fileId, taskId) {
  const findSQL = `
    SELECT id, task_id, file_s3_key, file_name, file_desc
    FROM "TASK_FILES"
    WHERE id = $1 AND task_id = $2
  `;
  const { rows } = await pool.query(findSQL, [fileId, taskId]);
  return rows[0];
}

/**
 * 根据 fileId 删除文件记录
 */
async function deleteTaskFile(fileId) {
  const deleteSQL = `
    DELETE FROM "TASK_FILES"
    WHERE id = $1
  `;
  const { rowCount } = await pool.query(deleteSQL, [fileId]);
  return rowCount;
}

module.exports = {
  insertTaskFile,
  getTaskFiles,
  getTaskFileById,
  deleteTaskFile
};
