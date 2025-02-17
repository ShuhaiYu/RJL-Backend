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


async function listEmails(user) {
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
    LEFT JOIN "TASK" T ON E.id = T.email_id
    LEFT JOIN "PROPERTY" P ON E.property_id = P.id
    LEFT JOIN "USER" U ON P.user_id = U.id
    WHERE 
      -- 如果用户是 admin 或 superuser, 则不限制所属机构
      ($1 IN ('admin', 'superuser'))
      -- 否则，只返回所属机构的任务
      OR (U.agency_id = $2)
    ORDER BY E.created_at DESC;
  `;

  // 传入的参数依次为：用户角色和用户所属机构ID
  const { rows } = await pool.query(querySQL, [user.role, user.agency_id]);
  return rows;
}


module.exports = { createEmailRecord, listEmails };
