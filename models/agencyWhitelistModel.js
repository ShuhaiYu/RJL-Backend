// models/agencyWhitelistModel.js
const pool = require("../config/db");

/**
 * 获取某个 Agency 下的所有白名单记录
 * @param {number} agencyId
 * @returns {Promise<Array>}
 */
async function getWhitelistByAgencyId(agencyId) {
  const sql = `
    SELECT id, agency_id, email_address, created_at, updated_at
    FROM "AGENCY_WHITELIST"
    WHERE agency_id = $1
    ORDER BY id ASC
  `;
  const { rows } = await pool.query(sql, [agencyId]);
  return rows;
}

/**
 * 获取单条白名单记录
 * @param {number} whitelistId
 * @returns {Promise<object|null>}
 */
async function getWhitelistEntryById(whitelistId) {
  const sql = `
    SELECT id, agency_id, email_address, created_at, updated_at
    FROM "AGENCY_WHITELIST"
    WHERE id = $1
  `;
  const { rows } = await pool.query(sql, [whitelistId]);
  return rows[0] || null;
}

/**
 * 新增白名单记录
 * @param {number} agencyId
 * @param {string} emailAddress
 * @returns {Promise<object>} 新增的记录
 */
async function createWhitelistEntry(agencyId, emailAddress) {
  const sql = `
    INSERT INTO "AGENCY_WHITELIST" (agency_id, email_address)
    VALUES ($1, $2)
    RETURNING id, agency_id, email_address, created_at, updated_at
  `;
  const { rows } = await pool.query(sql, [agencyId, emailAddress]);
  return rows[0];
}

/**
 * 更新白名单记录
 * @param {number} whitelistId
 * @param {string} emailAddress
 * @returns {Promise<object|null>} 更新后的记录，如果没找到就返回null
 */
async function updateWhitelistEntry(whitelistId, emailAddress) {
  const sql = `
    UPDATE "AGENCY_WHITELIST"
    SET email_address = $2, updated_at = now()
    WHERE id = $1
    RETURNING id, agency_id, email_address, created_at, updated_at
  `;
  const { rows } = await pool.query(sql, [whitelistId, emailAddress]);
  return rows[0] || null;
}

/**
 * 删除白名单记录
 * @param {number} whitelistId
 * @returns {Promise<boolean>} true表示删除成功，否则false
 */
async function deleteWhitelistEntry(whitelistId) {
  const sql = `
    DELETE FROM "AGENCY_WHITELIST"
    WHERE id = $1
    RETURNING id
  `;
  const { rows } = await pool.query(sql, [whitelistId]);
  return rows.length > 0; // 有返回id表示删成功
}

module.exports = {
  getWhitelistByAgencyId,
  getWhitelistEntryById,
  createWhitelistEntry,
  updateWhitelistEntry,
  deleteWhitelistEntry,
};
