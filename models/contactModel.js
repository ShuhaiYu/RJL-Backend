const pool = require("../config/db");

async function createContact({ name, phone, email, task_id }) {
  try {
    await pool.query("BEGIN");

    const insertContactSQL = `
        INSERT INTO "CONTACT" (name, phone, email, task_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
        `;
    const { rows: contactRows } = await pool.query(insertContactSQL, [
      name,
      phone,
      email,
      task_id,
    ]);
    const contact = contactRows[0];

    await pool.query("COMMIT");
    return contact;
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function getAllContacts() {
  const querySQL = `
    SELECT * FROM "CONTACT";
  `;
  const { rows } = await pool.query(querySQL);
  return rows;
}

async function getContactById(contactId) {
  const querySQL = `
    SELECT * FROM "CONTACT" WHERE id = $1;
  `;
  const { rows } = await pool.query(querySQL, [contactId]);
  return rows[0];
}

async function updateContactDetail(contactId, { name, phone, email }) {
  const updateSQL = `
    UPDATE "CONTACT"
    SET name = $1, phone = $2, email = $3
    WHERE id = $4
    RETURNING *;
  `;
  const { rows } = await pool.query(updateSQL, [name, phone, email, contactId]);
  return rows[0];
}

async function deleteContact(contactId) {
  const deleteSQL = `
    DELETE FROM "CONTACT" WHERE id = $1;
  `;
  await pool.query(deleteSQL, [contactId]);
}

module.exports = {
  createContact,
  getAllContacts,
  getContactById,
  updateContactDetail,
  deleteContact,
};
