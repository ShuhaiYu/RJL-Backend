const pool = require('../config/db');

async function createRolePermissionTable() {
  const queryText = `
    CREATE TABLE IF NOT EXISTS "ROLE_PERMISSION" (
      role VARCHAR(50) PRIMARY KEY,
      read_agency BOOLEAN DEFAULT false,
      create_agency BOOLEAN DEFAULT false,
      delete_agency BOOLEAN DEFAULT false,
      update_agency BOOLEAN DEFAULT false,
      read_property BOOLEAN DEFAULT false,
      create_property BOOLEAN DEFAULT false,
      delete_property BOOLEAN DEFAULT false,
      update_property BOOLEAN DEFAULT false
    );
  `;
  await pool.query(queryText);
}

async function getPermissionsByRole(role) {
  const text = `SELECT * FROM "ROLE_PERMISSION" WHERE role = $1;`;
  const { rows } = await pool.query(text, [role]);
  return rows[0];
}

module.exports = {
  createRolePermissionTable,
  getPermissionsByRole,
};
