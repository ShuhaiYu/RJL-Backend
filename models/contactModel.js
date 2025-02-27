// models/contact.model.js

const pool = require("../config/db");

/**
 * 创建新的联系人记录
 * 插入时默认将 is_active 设置为 true
 * 
 * @param {Object} param0 - 联系人数据对象
 * @param {string} param0.name - 联系人姓名
 * @param {string} param0.phone - 联系人电话
 * @param {string} param0.email - 联系人邮箱
 * @param {number} param0.property_id - 关联的房产 ID
 * @returns {Promise<Object>} 返回新创建的联系人记录
 */
async function createContact({ name, phone, email, property_id }) {
  try {
    await pool.query("BEGIN");

    const insertContactSQL = `
      INSERT INTO "CONTACT" (name, phone, email, property_id, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING *;
    `;
    const { rows: contactRows } = await pool.query(insertContactSQL, [
      name,
      phone,
      email,
      property_id,
    ]);
    const contact = contactRows[0];

    await pool.query("COMMIT");
    return contact;
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

/**
 * 列出当前用户所在机构下的所有处于激活状态的联系人记录
 * 通过将 CONTACT 与 PROPERTY 以及 PROPERTY 所属的 USER 进行 JOIN，
 * 只返回那些所属用户 (即房产的 owner) 的 agency_id 与当前用户相同的联系人记录，
 * 同时附带房产的 address 信息（命名为 property_address）。
 *
 * @param {Object} currentUser 当前登录用户对象，必须包含 agency_id
 * @returns {Promise<Array>} 返回联系人记录数组
 */
async function listContacts(currentUser) {
  const querySQL = `
    SELECT C.*, P.address as property_address
    FROM "CONTACT" C
    JOIN "PROPERTY" P ON C.property_id = P.id
    JOIN "USER" U ON P.user_id = U.id
    WHERE C.is_active = true
      AND U.agency_id = $1;
  `;
  try {
    const { rows } = await pool.query(querySQL, [currentUser.agency_id]);
    return rows;
  } catch (error) {
    throw error;
  }
}

/**
 * 根据联系人 ID 获取联系人详细信息
 * 
 * @param {number} contactId - 联系人 ID
 * @returns {Promise<Object|null>} 返回联系人记录，未找到返回 null
 */
async function getContactById(contactId) {
  const querySQL = `
    SELECT * FROM "CONTACT" WHERE id = $1;
  `;
  try {
    const { rows } = await pool.query(querySQL, [contactId]);
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
}

/**
 * 更新联系人信息
 * 可更新的字段包括：name, phone, email
 * 
 * @param {number} contactId - 联系人 ID
 * @param {Object} param1 - 要更新的字段
 * @param {string} param1.name - 联系人姓名
 * @param {string} param1.phone - 联系人电话
 * @param {string} param1.email - 联系人邮箱
 * @returns {Promise<Object>} 返回更新后的联系人记录
 */
async function updateContact(contactId, { name, phone, email }) {
  const updateSQL = `
    UPDATE "CONTACT"
    SET name = $1, phone = $2, email = $3
    WHERE id = $4
    RETURNING *;
  `;
  try {
    const { rows } = await pool.query(updateSQL, [name, phone, email, contactId]);
    return rows[0];
  } catch (error) {
    throw error;
  }
}

/**
 * 软删除联系人
 * 将 is_active 字段设置为 false，而不是物理删除记录
 * 
 * @param {number} contactId - 联系人 ID
 * @returns {Promise<Object>} 返回更新后的联系人记录（软删除后的记录）
 */
async function deleteContact(contactId) {
  const updateSQL = `
    UPDATE "CONTACT"
    SET is_active = false
    WHERE id = $1
    RETURNING *;
  `;
  try {
    const { rows } = await pool.query(updateSQL, [contactId]);
    return rows[0];
  } catch (error) {
    throw error;
  }
}

async function getContactByPhoneAndProperty(phone, property_id) {
  const sql = `
    SELECT * FROM "CONTACT"
    WHERE phone = $1
      AND property_id = $2
      AND is_active = true
    LIMIT 1
  `;
  const { rows } = await pool.query(sql, [phone, property_id]);
  return rows.length > 0 ? rows[0] : null;
}


module.exports = {
  createContact,
  listContacts,
  getContactById,
  updateContact,
  deleteContact,
  getContactByPhoneAndProperty,
};
