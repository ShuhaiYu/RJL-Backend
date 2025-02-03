// models/agencyModel.js
const pool = require('../config/db');

// 建表
async function createAgencyTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS "AGENCY" (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      agency_name VARCHAR(255) NOT NULL,
      address TEXT,
      phone VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `;
  await pool.query(createTableSQL);
}

// 插入一些初始数据
async function insertDummyAgencies() {
  // 这里随便示例一下
  const dummySQL = `
    INSERT INTO "AGENCY" (user_id, agency_name, address, phone)
    VALUES
      (2, 'Sunshine Agency', '123 Sunshine Road', '400-888-999'),
      (3, 'Moonlight Agency', '78 Moon Street', '400-555-666')
    RETURNING *;
  `;
  // 说明：user_id=2/3 表示在 USER 表里要对应的中介用户
  // 你可根据真实 user_id 来调整
  try {
    const { rows } = await pool.query(dummySQL);
    console.log('Dummy AGENCY data inserted:', rows);
  } catch (err) {
    // 如果重复插入会报错，你可根据需求处理
    console.error('Insert dummy data failed:', err.message);
  }
}

module.exports = {
  createAgencyTable,
  insertDummyAgencies,
};
