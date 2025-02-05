// models/propertyModel.js
const pool = require("../config/db");

/**
 * 创建房产（Property）
 * @param {Object} param0
 * @param {string} param0.name - 房产名称
 * @param {string} [param0.address] - 房产地址
 * @param {number} param0.agency_id - 所属机构的 ID
 * @returns {Object} 新创建的房产记录
 */
async function createProperty({ name, address = null, agency_id }) {
  const insertSQL = `
    INSERT INTO "PROPERTY" (name, address, agency_id)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
  const values = [name, address, agency_id];
  const { rows } = await pool.query(insertSQL, values);
  return rows[0];
}

/**
 * 查询指定房产详情
 * @param {number} propertyId
 * @returns {Object} 房产详情
 */
async function getPropertyById(propertyId) {
  const querySQL = `
    SELECT * FROM "PROPERTY" WHERE id = $1;
  `;
  const { rows } = await pool.query(querySQL, [propertyId]);
  return rows[0];
}

/**
 * 查询所有房产（供 admin 使用）
 * @returns {Array} 房产数组
 */
async function getAllProperties() {
  const querySQL = `
    SELECT * FROM "PROPERTY" ORDER BY id DESC;
  `;
  const { rows } = await pool.query(querySQL);
  return rows;
}

/**
 * 根据机构 ID 查询房产（供 agency 使用）
 * @param {number} agency_id
 * @returns {Array} 房产数组
 */
async function getAllPropertiesByAgency(agency_id) {
  const querySQL = `
    SELECT * FROM "PROPERTY" 
    WHERE agency_id = $1
    ORDER BY id DESC;
  `;
  const { rows } = await pool.query(querySQL, [agency_id]);
  return rows;
}

async function getPropertyByAddress(address) {
  const querySQL = `
    SELECT * FROM "PROPERTY" 
    WHERE address = $1
    ORDER BY id DESC;
  `;
  const { rows } = await pool.query(querySQL, [address]);
  return rows;
}

module.exports = {
  createProperty,
  getPropertyById,
  getAllProperties,
  getAllPropertiesByAgency,
  getPropertyByAddress,
};
