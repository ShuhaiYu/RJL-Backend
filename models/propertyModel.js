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
 * 查询指定房产详情，并返回其关联的任务列表
 * @param {number} propertyId
 * @returns {Object} 房产详情，包含 tasks 数组
 */
async function getPropertyById(propertyId) {
  const querySQL = `
    SELECT
      P.id as property_id,
      P.name as property_name,
      P.address as property_address,
      P.agency_id as property_agency_id,
      T.id as task_id,
      T.task_name,
      T.task_description,
      T.due_date
    FROM "PROPERTY" P
    LEFT JOIN "TASK" T ON P.id = T.property_id
    WHERE P.id = $1;
  `;
  const { rows } = await pool.query(querySQL, [propertyId]);
  if (rows.length === 0) {
    // 未查到任何行，说明没有这个 property
    return null;
  }

  // property的基本信息在每一行都相同，所以我们只从第一行取即可
  const firstRow = rows[0];

  // 组装 property 对象
  const property = {
    id: firstRow.property_id,
    name: firstRow.property_name,
    address: firstRow.property_address,
    agency_id: firstRow.property_agency_id,
    tasks: []
  };

  // 组装 tasks 数组
  // 每一行可能含有一个 task_id（如果没有，则为 null）
  const tasks = rows.map((r) => {
    if (!r.task_id) return null; // 如果没有任务，task_id会为 null
    return {
      id: r.task_id,
      task_name: r.task_name,
      task_description: r.task_description,
      due_date: r.due_date
    };
  }).filter(Boolean); // 过滤掉 null

  property.tasks = tasks;

  return property;
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

async function deleteProperty(propertyId) {
  const deleteSQL = `
    DELETE FROM "PROPERTY" WHERE id = $1;
  `;
  await pool.query(deleteSQL, [propertyId]);
}

async function updateProperty(propertyId, { name, address }) {
  const updateSQL = `
    UPDATE "PROPERTY"
    SET name = $1, address = $2
    WHERE id = $3
    RETURNING *;
  `;
  const { rows } = await pool.query(updateSQL, [name, address, propertyId]);
  return rows[0];
}

module.exports = {
  createProperty,
  getPropertyById,
  getAllProperties,
  getAllPropertiesByAgency,
  getPropertyByAddress,
  deleteProperty,
  updateProperty,
};
