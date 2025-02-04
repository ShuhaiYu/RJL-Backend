// models/agencyModel.js
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const { insertUser } = require('./userModel');

/**
 * 创建机构，并创建对应的 agency 用户（角色固定为 'agency'）
 * 逻辑：先在 AGENCY 表中插入机构记录，获取新机构 id；再在 USER 表中插入用户记录，将 agency_id 写入用户记录
 * @param {Object} param0
 * @param {string} param0.agency_name - 机构名称
 * @param {string} param0.email - 用户邮箱
 * @param {string} param0.password - 明文密码
 * @param {string} [param0.address] - 机构地址
 * @param {string} [param0.phone] - 机构电话
 * @param {string} [param0.logo] - 机构 logo URL
 * @returns {Object} 包含新机构和新用户数据
 */
async function createAgency({ agency_name, email, password, address = null, phone = null, logo = null }) {
  try {
    await pool.query('BEGIN');

    // 1. 在 AGENCY 表中插入机构记录
    const insertAgencySQL = `
      INSERT INTO "AGENCY" (agency_name, address, phone, logo)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const { rows: agencyRows } = await pool.query(insertAgencySQL, [agency_name, address, phone, logo]);
    const agency = agencyRows[0];

    // 2. 对密码进行加密
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. 在 USER 表中插入机构用户记录，同时写入 agency_id
    const newUser = await insertUser({
      email,
      name: agency_name, // 可将机构名称作为用户名
      password: hashedPassword,
      role: 'agency',
      agency_id: agency.id,
    });

    await pool.query('COMMIT');
    // 返回新机构和新用户记录
    return { agency, user: newUser };
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

/**
 * 根据 user_id 获取机构记录（假设机构记录中存储了 user_id 字段）
 * @param {number} user_id 
 * @returns {Object} 机构记录，如果不存在则返回 undefined
 */
async function getAgencyByAgencyId(user_id) {
  const querySQL = `SELECT * FROM "AGENCY" WHERE id = $1;`;
  const { rows } = await pool.query(querySQL, [user_id]);
  return rows[0];
}


async function updateAgencyActiveStatus(agencyId, isActive) {
  const updateSQL = `
    UPDATE "AGENCY"
    SET is_actived = $1
    WHERE id = $2;
  `;
  await pool.query(updateSQL, [isActive, agencyId]);
}

module.exports = {
  createAgency,
  updateAgencyActiveStatus,
  getAgencyByAgencyId,
};
