// models/veuProjectModel.js
const pool = require("../config/db");

/**
 * Create two VEU projects for a given property:
 * - water_heater (is_completed=false, price=NULL)
 * - air_conditioner (is_completed=false, price=NULL)
 * Returns inserted rows.
 *
 * @param {number} propertyId
 * @returns {Promise<Array>}
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

/**
 * Update a VEU project.
 * Allowed fields: is_completed, price, completed_by, type (optional).
 * Returns updated row.
 *
 * @param {number} id
 * @param {Object} fields
 * @param {boolean} [fields.is_completed]
 * @param {number|null} [fields.price]
 * @param {string|null} [fields.completed_by]
 * @param {"water_heater"|"air_conditioner"} [fields.type]
 * @returns {Promise<Object>}
 */
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

  if (sets.length === 0) {
    throw new Error("No fields provided to update");
  }

  // always bump updated_at
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

// models/veuProjectModel.js

/**
 * Activate VEU for an agency:
 * - For every property under the agency, insert missing VEU projects
 *   ('water_heater' and 'air_conditioner') with is_completed=false and price=NULL.
 * - Mark the agency as veu_activated = true.
 * - All in a single transaction.
 *
 * @param {number} agencyId
 * @returns {Promise<Array<{id:number, property_id:number, type:string}>>}
 */
async function activateVeuForAgency(agencyId) {
  if (!agencyId || Number.isNaN(Number(agencyId))) {
    throw new Error("Invalid agencyId");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the agency row to avoid concurrent double-activation.
    await client.query(`SELECT id FROM "AGENCY" WHERE id = $1 FOR UPDATE;`, [agencyId]);

    // Insert missing VEU rows for each property in the agency.
    const insertSQL = `
      WITH targets AS (
        SELECT p.id AS property_id, v.type
        FROM "PROPERTY" p
        JOIN "USER" u ON u.id = p.user_id
        CROSS JOIN (VALUES ('water_heater'::VARCHAR(50)), ('air_conditioner'::VARCHAR(50))) AS v(type)
        WHERE u.agency_id = $1
      )
      INSERT INTO "VEU_PROJECT" (property_id, type, is_completed, price)
      SELECT t.property_id, t.type, false, NULL
      FROM targets t
      WHERE NOT EXISTS (
        SELECT 1
        FROM "VEU_PROJECT" vp
        WHERE vp.property_id = t.property_id
          AND vp.type = t.type
      )
      RETURNING id, property_id, type;
    `;
    const { rows: inserted } = await client.query(insertSQL, [agencyId]);

    // Mark agency as activated.
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

module.exports = {
  createVeuProjectsForProperty,
  updateVeuProject,
  activateVeuForAgency,
  getVeuProjectsByPropertyId,
};
