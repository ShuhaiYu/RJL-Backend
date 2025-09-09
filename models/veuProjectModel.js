// models/veuProjectModel.js
const pool = require("../config/db");

/**
 * Create two VEU projects for a given property:
 * - water_heater, air_conditioner
 */
async function createVeuProjectsForProperty(propertyId) {
  if (!propertyId || Number.isNaN(Number(propertyId))) {
    throw new Error("Invalid propertyId");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const insertSQL = `
      INSERT INTO "VEU_PROJECT" (property_id, type, is_completed, price)
      VALUES 
        ($1, 'water_heater', false, NULL),
        ($1, 'air_conditioner', false, NULL)
      RETURNING *;
    `;
    const { rows } = await client.query(insertSQL, [propertyId]);
    await client.query("COMMIT");
    return rows;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Update a VEU project */
async function updateVeuProject(id, { is_completed, price, completed_by, type } = {}) {
  if (!id || Number.isNaN(Number(id))) {
    throw new Error("Invalid id");
  }
  const sets = [];
  const values = [];
  let i = 1;

  if (typeof is_completed === "boolean") {
    sets.push(`is_completed = $${i++}`);
    values.push(is_completed);
  }
  if (price !== undefined) {
    sets.push(`price = $${i++}`);
    values.push(price);
  }
  if (completed_by !== undefined) {
    sets.push(`completed_by = $${i++}`);
    values.push(completed_by);
  }
  if (type !== undefined) {
    sets.push(`type = $${i++}`);
    values.push(type);
  }
  if (sets.length === 0) throw new Error("No fields provided to update");

  sets.push(`updated_at = NOW()`);
  const sql = `
    UPDATE "VEU_PROJECT"
    SET ${sets.join(", ")}
    WHERE id = $${i}
    RETURNING *;
  `;
  values.push(id);
  const { rows } = await pool.query(sql, values);
  return rows[0] || null;
}

/** Activate VEU for an agency (idempotent) */
async function activateVeuForAgency(agencyId) {
  if (!agencyId || Number.isNaN(Number(agencyId))) {
    throw new Error("Invalid agencyId");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`SELECT id FROM "AGENCY" WHERE id = $1 FOR UPDATE;`, [agencyId]);

    const insertSQL = `
      WITH targets AS (
        SELECT p.id AS property_id, v.type
        FROM "PROPERTY" p
        JOIN "USER" u ON u.id = p.user_id
        CROSS JOIN (VALUES ('water_heater'::varchar(50)), ('air_conditioner'::varchar(50))) AS v(type)
        WHERE u.agency_id = $1
      )
      INSERT INTO "VEU_PROJECT" (property_id, type, is_completed, price)
      SELECT t.property_id, t.type, false, NULL
      FROM targets t
      WHERE NOT EXISTS (
        SELECT 1
        FROM "VEU_PROJECT" vp
        WHERE vp.property_id = t.property_id AND vp.type = t.type
      )
      RETURNING id, property_id, type;
    `;
    const { rows: inserted } = await client.query(insertSQL, [agencyId]);

    await client.query(
      `UPDATE "AGENCY" SET veu_activated = TRUE, updated_at = NOW() WHERE id = $1;`,
      [agencyId]
    );

    await client.query("COMMIT");
    return inserted;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Raw by property id */
async function getVeuProjectsByPropertyId(propertyId) {
  if (!propertyId || Number.isNaN(Number(propertyId))) {
    throw new Error("Invalid propertyId");
  }
  const sql = `
    SELECT *
    FROM "VEU_PROJECT"
    WHERE property_id = $1
    ORDER BY id ASC;
  `;
  const { rows } = await pool.query(sql, [propertyId]);
  return rows;
}

/**
 * Incomplete = completed_by IS NULL or '' (agency scoped).
 * Return agency info with each row.
 */
async function listIncompleteVeuProjects(user) {
  const agencyId = user?.agency_id ?? null;
  const sql = `
    WITH scoped_properties AS (
      SELECT p.id
      FROM "PROPERTY" p
      JOIN "USER" u ON u.id = p.user_id
      WHERE p.is_active = true
        AND ($1::int IS NULL OR u.agency_id = $1)
    ),
    latest AS (
      SELECT DISTINCT ON (vp.property_id, vp.type)
        vp.*
      FROM "VEU_PROJECT" vp
      JOIN scoped_properties sp ON sp.id = vp.property_id
      ORDER BY vp.property_id, vp.type, vp.updated_at DESC, vp.id DESC
    )
    SELECT 
      l.*,
      p.address AS property_address,
      u.agency_id AS agency_id,
      a.agency_name AS agency_name
    FROM latest l
    JOIN "PROPERTY" p ON p.id = l.property_id
    JOIN "USER" u ON u.id = p.user_id
    LEFT JOIN "AGENCY" a ON a.id = u.agency_id
    WHERE NULLIF(l.completed_by, '') IS NULL
    ORDER BY l.updated_at DESC, l.id DESC;
  `;
  const { rows } = await pool.query(sql, [agencyId]);
  return rows;
}

/**
 * Incomplete by type (water_heater / air_conditioner) (agency scoped).
 * Return agency info with each row.
 */
async function listIncompleteVeuProjectsByType(user, type) {
  const agencyId = user?.agency_id ?? null;
  const sql = `
    WITH scoped_properties AS (
      SELECT p.id
      FROM "PROPERTY" p
      JOIN "USER" u ON u.id = p.user_id
      WHERE p.is_active = true
        AND ($2::int IS NULL OR u.agency_id = $2)
    ),
    latest AS (
      SELECT DISTINCT ON (vp.property_id, vp.type)
        vp.*
      FROM "VEU_PROJECT" vp
      JOIN scoped_properties sp ON sp.id = vp.property_id
      ORDER BY vp.property_id, vp.type, vp.updated_at DESC, vp.id DESC
    )
    SELECT 
      l.*,
      p.address AS property_address,
      u.agency_id AS agency_id,
      a.agency_name AS agency_name
    FROM latest l
    JOIN "PROPERTY" p ON p.id = l.property_id
    JOIN "USER" u ON u.id = p.user_id
    LEFT JOIN "AGENCY" a ON a.id = u.agency_id
    WHERE l.type = $1
      AND NULLIF(l.completed_by, '') IS NULL
    ORDER BY l.updated_at DESC, l.id DESC;
  `;
  const { rows } = await pool.query(sql, [type, agencyId]);
  return rows;
}

/**
 * Dashboard stats — ALL derived from the same `latest` set to avoid inconsistencies.
 * Completion rule: completed_by NOT NULL AND NOT ''.
 * Scope: if user.agency_id is NULL => all agencies; else only that agency.
 */
async function getVeuDashboardStats(user) {
  const agencyId = user?.agency_id ?? null;

  const sql = `
    WITH scoped_properties AS (
      SELECT p.id
      FROM "PROPERTY" p
      JOIN "USER" u ON u.id = p.user_id
      WHERE p.is_active = true
        AND ($1::int IS NULL OR u.agency_id = $1)
    ),
    latest AS (
      SELECT DISTINCT ON (vp.property_id, vp.type)
        vp.property_id,
        vp.type,
        vp.completed_by,
        vp.updated_at,
        vp.id
      FROM "VEU_PROJECT" vp
      JOIN scoped_properties sp ON sp.id = vp.property_id
      ORDER BY vp.property_id, vp.type, vp.updated_at DESC, vp.id DESC
    ),
    base AS (
      SELECT
        property_id,
        MAX(CASE WHEN type = 'water_heater'    AND NULLIF(completed_by,'') IS NOT NULL THEN 1 ELSE 0 END) AS wh_done,
        MAX(CASE WHEN type = 'air_conditioner' AND NULLIF(completed_by,'') IS NOT NULL THEN 1 ELSE 0 END) AS ac_done,
        MAX(CASE WHEN type = 'water_heater'    AND NULLIF(completed_by,'') IS NULL     THEN 1 ELSE 0 END) AS wh_incomplete,
        MAX(CASE WHEN type = 'air_conditioner' AND NULLIF(completed_by,'') IS NULL     THEN 1 ELSE 0 END) AS ac_incomplete
      FROM latest
      GROUP BY property_id
    )
    SELECT
      (SELECT COUNT(*) FROM base)::int                                                AS total_property_count,
      (SELECT COUNT(*) FROM base WHERE wh_done = 1 AND ac_done = 1)::int              AS completed_property_count,
      (SELECT COUNT(*) FROM base WHERE wh_incomplete = 1 OR ac_incomplete = 1)::int   AS incomplete_total_count,
      (SELECT COUNT(*) FROM base WHERE wh_incomplete = 1)::int                         AS incomplete_water_heater_count,
      (SELECT COUNT(*) FROM base WHERE ac_incomplete = 1)::int                         AS incomplete_air_conditioner_count
  `;
  const { rows } = await pool.query(sql, [agencyId]);
  return rows[0] || {
    total_property_count: 0,
    completed_property_count: 0,
    incomplete_total_count: 0,
    incomplete_water_heater_count: 0,
    incomplete_air_conditioner_count: 0,
  };
}

module.exports = {
  createVeuProjectsForProperty,
  updateVeuProject,
  activateVeuForAgency,
  getVeuProjectsByPropertyId,
  listIncompleteVeuProjects,
  listIncompleteVeuProjectsByType,
  getVeuDashboardStats,
};
