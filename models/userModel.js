const pool = require('../config/db');

async function createUserTable() {
  const queryText = `
    CREATE TABLE IF NOT EXISTS "USER" (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      is_actived BOOLEAN NOT NULL DEFAULT true
    );
  `;
  await pool.query(queryText);
}

async function insertUser({ email, name, password, role, agency_id = null }) {
  const text = `
    INSERT INTO "USER" (email, name, password, role, agency_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
  const values = [email, name, password, role, agency_id];
  const { rows } = await pool.query(text, values);
  return rows[0];
}

async function getUserByEmail(email) {
  const text = `SELECT * FROM "USER" WHERE email = $1;`;
  const { rows } = await pool.query(text, [email]);
  return rows[0];
}

async function updateUserPassword(userId, newPassword) {
  const text = `UPDATE "USER" SET password = $1 WHERE id = $2;`;
  await pool.query(text, [newPassword, userId]);
}

async function updateUserStatus(userId, isActived) {
  const text = `UPDATE "USER" SET is_actived = $1 WHERE id = $2;`;
  await pool.query(text, [isActived, userId]);
}

async function updateUserRefreshToken(userId, refreshToken) {
    const text = `UPDATE "USER" SET refresh_token = $1 WHERE id = $2;`;
    await pool.query(text, [refreshToken, userId]);
  }
  
async function getUserByRefreshToken(refreshToken) {
const text = `SELECT * FROM "USER" WHERE refresh_token = $1;`;
const { rows } = await pool.query(text, [refreshToken]);
return rows[0];
}

/**
 * 新增：根据用户ID获取用户记录（包含 agency_id）
 * @param {number} userId 
 * @returns {Object} 用户记录
 */
async function getUserById(userId) {
  const text = `SELECT * FROM "USER" WHERE id = $1;`;
  const { rows } = await pool.query(text, [userId]);
  return rows[0];
}

module.exports = {
  createUserTable,
  insertUser,
  getUserByEmail,
  updateUserPassword,
  updateUserStatus,
  updateUserRefreshToken,
  getUserByRefreshToken,
  getUserById,
};
