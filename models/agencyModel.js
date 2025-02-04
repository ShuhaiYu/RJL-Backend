// models/agencyModel.js
const pool = require('../config/db');

// create agency
async function createAgency({ agency_name, email, password, address = null, phone = null, logo = null }) {
  try {
    // 开启事务
    await pool.query('BEGIN');

    // 对密码进行加密（注册用户时保证密码隐藏）
    const hashedPassword = await bcrypt.hash(password, 10);

    // 1. 在 USER 表中插入一条记录
    // 这里使用 insertUser，但注意 insertUser 不做加密，因此需要传入加密后的密码，
    // 并强制 role 为 'agency'，同时将 agency_name 作为用户姓名
    const newUser = await insertUser({
      email,
      name: agency_name,
      password: hashedPassword,
      role: 'agency',
    });
    const userId = newUser.id;

    // 2. 在 AGENCY 表中插入记录，并关联刚刚创建的 user_id
    const insertAgencySQL = `
      INSERT INTO "AGENCY" (user_id, agency_name, address, phone, logo)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const { rows: agencyRows } = await pool.query(insertAgencySQL, [
      userId,
      agency_name,
      address,
      phone,
      logo,
    ]);

    // 提交事务
    await pool.query('COMMIT');
    return agencyRows[0];
  } catch (error) {
    // 回滚事务
    await pool.query('ROLLBACK');
    throw error;
  }
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
};
