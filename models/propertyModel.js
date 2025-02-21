// models/propertyModel.js

const pool = require("../config/db");
const userModel = require("./userModel");

/**
 * 创建房产（Property）
 * 插入时同时设置 is_active 为 true
 * 
 * @param {Object} param0
 * @param {string} param0.name - 房产名称
 * @param {string} [param0.address] - 房产地址
 * @param {number} param0.agency_id - 所属机构的 ID
 * @returns {Promise<Object>} 返回新创建的房产记录
 */
async function createProperty({  address, user_id}) {
  const insertSQL = `
    INSERT INTO "PROPERTY" (address, user_id, is_active)
    VALUES ($1, $2, true)
    RETURNING *;
  `;
  const values = [ address, user_id ];
  const { rows } = await pool.query(insertSQL, values);
  return rows[0];
}

/**
 * 查询指定房产详情，并返回其关联的任务、邮件、机构以及联系人信息
 * 关联逻辑：
 *  - 从 "PROPERTY" 表中获取基本信息（仅返回激活记录）
 *  - 关联 "AGENCY" 表：根据 property.agency_id 获取机构信息
 *  - 查询 "TASK" 表：根据 property.id 获取该房产下的任务列表
 *  - 查询 "EMAIL" 表：根据 property.id 获取所有关联邮件
 *  - 查询 "CONTACT" 表：通过 "TASK" 与 "CONTACT" 关联，获取该房产下所有任务的激活联系人
 * 
 * @param {number} propertyId - 房产 ID
 * @returns {Promise<Object|null>} 返回包含关联数据的房产对象；如果没有查询到，返回 null
 */
async function getPropertyById(propertyId) {
  // 查询房产基本信息，同时关联 USER 和 AGENCY 表获取机构信息
  const propertySQL = `
    SELECT 
      P.id,
      P.address,
      P.user_id,
      P.is_active,
      A.agency_name,
      A.address AS agency_address,
      A.phone AS agency_phone,
      A.logo AS agency_logo,
      A.is_active AS agency_active
    FROM "PROPERTY" P
    LEFT JOIN "USER" U ON P.user_id = U.id
    LEFT JOIN "AGENCY" A ON U.agency_id = A.id
    WHERE P.id = $1 AND P.is_active = true;
  `;
  const { rows: propRows } = await pool.query(propertySQL, [propertyId]);
  if (propRows.length === 0) {
    return null;
  }
  const property = propRows[0];

  // 查询该房产下的任务列表
  const tasksSQL = `
    SELECT * FROM "TASK" 
    WHERE property_id = $1;
  `;
  const { rows: tasks } = await pool.query(tasksSQL, [propertyId]);
  property.tasks = tasks;

  // 查询该房产关联的邮件（EMAIL 表中 property_id 关联）
  const emailsSQL = `
    SELECT * FROM "EMAIL"
    WHERE property_id = $1;
  `;
  const { rows: emails } = await pool.query(emailsSQL, [propertyId]);
  property.emails = emails;

  // 查询联系人：通过 TASK 与 CONTACT 关联，且仅返回激活的联系人
  const contactsSQL = `
    SELECT * FROM "CONTACT" 
    WHERE property_id = $1 AND is_active = true;
  `;
  const { rows: contacts } = await pool.query(contactsSQL, [propertyId]);
  property.contacts = contacts;

  return property;
}


/**
 * 列出房产记录
 * 根据请求用户的角色返回不同范围的房产：
 *  - admin 或 superuser 返回所有激活的房产
 *  - 其他角色（例如 agency 用户）只返回其所属机构的房产
 * 
 * @param {Object} requestingUser - 请求用户对象，需包含 role 和 agency_id（非 admin/superuser）
 * @returns {Promise<Array>} 返回房产记录数组
 */
async function listProperties(requestingUser) {
  let querySQL;
  let values = [];
  if (requestingUser.role === 'admin' || requestingUser.role === 'superuser') {
    querySQL = `
      SELECT * FROM "PROPERTY"
      WHERE is_active = true
      ORDER BY id DESC;
    `;
  } else if (requestingUser.role === 'agency-admin') {
    const agencyUsers = await userModel.getUsersByAgencyId(requestingUser.agency_id);
    const userIds = agencyUsers.map((u) => u.id);
    querySQL = `
      SELECT *
      FROM "PROPERTY"
      WHERE is_active = true
        AND user_id = ANY($1::int[])
      ORDER BY id DESC
    `;
    values.push(userIds);
  } else {
    // 非 admin/superuser用户：返回所属机构的房产
    querySQL = `
    SELECT * FROM "PROPERTY"
    WHERE is_active = true AND user_id = $1
    ORDER BY id DESC;
    `;
    values.push(requestingUser.id);
  }
  const { rows } = await pool.query(querySQL, values);
  return rows;
}

/**
 * 根据地址查询房产
 * 仅返回激活状态的房产记录
 * 
 * @param {string} address - 房产地址
 * @returns {Promise<Array>} 返回匹配的房产数组
 */
async function getPropertyByAddress(address) {
  const querySQL = `
    SELECT * FROM "PROPERTY"
    WHERE address = $1 AND is_active = true
    ORDER BY id DESC;
  `;
  const { rows } = await pool.query(querySQL, [address]);
  return rows;
}

/**
 * 软删除房产
 * 将指定房产的 is_active 字段设置为 false
 * 
 * @param {number} propertyId - 房产 ID
 * @returns {Promise<Object>} 返回更新后的房产记录
 */
async function deleteProperty(propertyId) {
  const updateSQL = `
    UPDATE "PROPERTY"
    SET is_active = false
    WHERE id = $1
    RETURNING *;
  `;
  const { rows } = await pool.query(updateSQL, [propertyId]);
  return rows[0];
}

/**
 * 更新房产信息
 * 可更新字段包括：name 和 address（根据实际情况可扩展）
 * 
 * @param {number} propertyId - 房产 ID
 * @param {Object} param1 - 包含要更新的字段，例如 { name, address }
 * @returns {Promise<Object>} 返回更新后的房产记录
 */
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
  listProperties,
  getPropertyByAddress,
  deleteProperty,
  updateProperty,
};
