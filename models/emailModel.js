const pool = require("../config/db");

async function createEmailRecord({ subject, sender, email_body, task_id, html, property_id }) {
  try {
    await pool.query("BEGIN");

    const insertEmailSQL = `
        INSERT INTO "EMAIL" (subject, sender, email_body, task_id, html, property_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
        `;
    const { rows: emailRows } = await pool.query(insertEmailSQL, [
      subject,
      sender,
      email_body,
      task_id,
      html,
      property_id,
    ]);
    const email = emailRows[0];

    await pool.query("COMMIT");
    return email;
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

module.exports = { createEmailRecord };
