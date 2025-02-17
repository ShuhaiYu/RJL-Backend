const pool = require("../config/db");

async function createEmailRecord({ subject, sender, email_body, task_id, html, property_id }) {
  try {
    await pool.query("BEGIN");

    const insertEmailSQL = `
        INSERT INTO "EMAIL" (subject, sender, email_body, task_id, html, property_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, timezone('Australia/Melbourne', CURRENT_TIMESTAMP))
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


async function listEmails() {
  const querySQL = `
    SELECT
      E.id as email_id,
      E.subject,
      E.sender,
      E.email_body,
      E.html,
      E.created_at,
      T.id as task_id,
      T.task_name,
      P.id as property_id,
      P.address as property_address
    FROM "EMAIL" E
    LEFT JOIN "TASK" T ON E.task_id = T.id
    LEFT JOIN "PROPERTY" P ON E.property_id = P.id
    ORDER BY E.created_at DESC;
  `;
  const { rows } = await pool.query(querySQL);
  return rows;
}

module.exports = { createEmailRecord, listEmails };
