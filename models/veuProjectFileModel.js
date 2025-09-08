// models/veuProjectFileModel.js
const pool = require("../config/db");

/**
 * 新增一条VEU项目文件记录
 */
async function insertVeuProjectFile(veuProjectId, fileKey, fileName, fileDesc) {
  const insertSQL = `
    INSERT INTO "VEU_PROJECT_FILES"(veu_project_id, file_s3_key, file_name, file_desc, created_at, updated_at)
    VALUES($1, $2, $3, $4, NOW(), NOW())
    RETURNING *;
  `;
  const values = [veuProjectId, fileKey, fileName, fileDesc || ""];
  const { rows } = await pool.query(insertSQL, values);
  return rows[0];
}

/**
 * 获取指定VEU项目的所有文件
 */
async function getVeuProjectFiles(veuProjectId) {
  const querySQL = `
    SELECT 
      id, 
      veu_project_id, 
      file_s3_key, 
      file_name, 
      file_desc, 
      created_at, 
      updated_at
    FROM "VEU_PROJECT_FILES"
    WHERE veu_project_id = $1
    ORDER BY created_at DESC;
  `;
  const { rows } = await pool.query(querySQL, [veuProjectId]);
  return rows;
}

/**
 * 根据 fileId + veuProjectId 获取单条文件记录
 */
async function getVeuProjectFileById(fileId, veuProjectId) {
  const findSQL = `
    SELECT id, veu_project_id, file_s3_key, file_name, file_desc
    FROM "VEU_PROJECT_FILES"
    WHERE id = $1 AND veu_project_id = $2
  `;
  const { rows } = await pool.query(findSQL, [fileId, veuProjectId]);
  return rows[0];
}

/**
 * 根据 fileId 删除文件记录
 */
async function deleteVeuProjectFile(fileId) {
  const deleteSQL = `
    DELETE FROM "VEU_PROJECT_FILES"
    WHERE id = $1
  `;
  const { rowCount } = await pool.query(deleteSQL, [fileId]);
  return rowCount;
}

module.exports = {
  insertVeuProjectFile,
  getVeuProjectFiles,
  getVeuProjectFileById,
  deleteVeuProjectFile
};