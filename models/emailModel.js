const pool = require("../config/db");

async function createEmailRecord({
  subject,
  sender,
  email_body,
  html,
  property_id,
  agency_id,
}) {
  try {
    await pool.query("BEGIN");

    const insertEmailSQL = `
        INSERT INTO "EMAIL" (subject, sender, email_body, html, property_id, agency_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
    `;
    const { rows: emailRows } = await pool.query(insertEmailSQL, [
      subject,
      sender,
      email_body,
      html,
      property_id,
      agency_id,
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

/**
 * 根据 subject + sender + property_id 查重
 * (你可以加上其他字段判定是否真算重复，如 email_body 相同)
 */
async function getEmailByUniqueKey({ subject, sender, property_id }) {
  const sql = `
    SELECT *
    FROM "EMAIL"
    WHERE subject = $1
      AND sender = $2
      AND property_id = $3
    LIMIT 1;
  `;
  const { rows } = await pool.query(sql, [subject, sender, property_id]);
  return rows[0] || null;
}

module.exports = { createEmailRecord, listEmails, getEmailByUniqueKey };
