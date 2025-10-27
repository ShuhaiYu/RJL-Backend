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
      INSERT INTO "VEU_PROJECT" (property_id, type, is_completed, price, note)
      VALUES 
        ($1, 'water_heater', false, NULL, NULL),
        ($1, 'air_conditioner', false, NULL, NULL)
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
async function updateVeuProject(id, { is_completed, price, completed_by, type, note } = {}) {
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
  if (note !== undefined) {
    sets.push(`note = $${i++}`);
    values.push(note);
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
      INSERT INTO "VEU_PROJECT" (property_id, type, is_completed, price, note)
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
 * 统一聚合：按“中介 -> 用户”返回可见范围内的 VEU 概览
 * - 权限 / 可见范围：
 *   - user.agency_id 为空（平台/总部，或 admin/superuser 无中介）：看到所有中介及用户
 *   - agency-admin：仅本中介下所有用户
 *   - 其他(agency-user)：仅本人
 *
 * - 指标口径：
 *   1) 顶部 5 个数字（以“物业”为单位）：
 *      total_property_count
 *      completed_property_count  (WH & AC 都完成)
 *      incomplete_total_count    (WH 或 AC 任一未完成)
 *      incomplete_water_heater_count (WH 未完成的物业数)
 *      incomplete_air_conditioner_count (AC 未完成的物业数)
 *
 *   2) 饼图四段（以“项目项/Item”为单位）：
 *      ac_done_count, ac_not_count, wh_done_count, wh_not_count
 *
 * - 完成判定：completed_by NOT NULL AND completed_by <> ''
 */
async function getVeuOverviewTree(user) {
  const role = String(user?.role || "").toLowerCase();
  const userId = user?.id || user?.user_id; // 兼容不同载入方式
  const agencyId = user?.agency_id ?? null;

  // 作用域：agencyFilterId / userIdsFilter (int[])
  let agencyFilterId = null;
  let userIdsFilter = null;

  if (agencyId && (role === "agency-admin" || role === "agency-user")) {
    agencyFilterId = agencyId;
    if (role !== "agency-admin") {
      // 普通中介用户：只看自己
      userIdsFilter = [Number(userId)];
    }
  }
  // 平台/总部 或 admin/superuser（通常无 agency_id）=> 不限

  const sql = `
    WITH scoped_props AS (
      SELECT p.id AS property_id,
             u.id AS user_id,
             u.agency_id
      FROM "PROPERTY" p
      JOIN "USER" u ON u.id = p.user_id
      WHERE p.is_active = true
        AND ($1::int IS NULL OR u.agency_id = $1)
        AND ($2::int[] IS NULL OR u.id = ANY($2))
    ),
    latest AS (
      SELECT DISTINCT ON (vp.property_id, vp.type)
             vp.property_id,
             vp.type,
             vp.completed_by,
             vp.updated_at
      FROM "VEU_PROJECT" vp
      JOIN scoped_props sp ON sp.property_id = vp.property_id
      ORDER BY vp.property_id, vp.type, vp.updated_at DESC, vp.id DESC
    ),
    base AS (
      SELECT
        sp.user_id,
        sp.agency_id,
        l.property_id,
        MAX(CASE WHEN l.type = 'water_heater'    AND NULLIF(l.completed_by,'') IS NOT NULL THEN 1 ELSE 0 END) AS wh_done,
        MAX(CASE WHEN l.type = 'air_conditioner' AND NULLIF(l.completed_by,'') IS NOT NULL THEN 1 ELSE 0 END) AS ac_done,
        MAX(CASE WHEN l.type = 'water_heater'    AND NULLIF(l.completed_by,'') IS NULL     THEN 1 ELSE 0 END) AS wh_incomplete,
        MAX(CASE WHEN l.type = 'air_conditioner' AND NULLIF(l.completed_by,'') IS NULL     THEN 1 ELSE 0 END) AS ac_incomplete
      FROM latest l
      JOIN scoped_props sp ON sp.property_id = l.property_id
      GROUP BY sp.user_id, sp.agency_id, l.property_id
    ),
    user_prop_metrics AS (
      SELECT
        b.user_id,
        COUNT(*)::int AS total_property_count,
        COUNT(*) FILTER (WHERE b.wh_done = 1 AND b.ac_done = 1)::int AS completed_property_count,
        COUNT(*) FILTER (WHERE b.wh_incomplete = 1 OR b.ac_incomplete = 1)::int AS incomplete_total_count,
        COUNT(*) FILTER (WHERE b.wh_incomplete = 1)::int AS incomplete_water_heater_count,
        COUNT(*) FILTER (WHERE b.ac_incomplete = 1)::int AS incomplete_air_conditioner_count
      FROM base b
      GROUP BY b.user_id
    ),
    user_item_metrics AS (
      SELECT
        sp.user_id,
        SUM(CASE WHEN l.type = 'air_conditioner' AND NULLIF(l.completed_by,'') IS NOT NULL THEN 1 ELSE 0 END)::int AS ac_done_count,
        SUM(CASE WHEN l.type = 'air_conditioner' AND NULLIF(l.completed_by,'') IS NULL     THEN 1 ELSE 0 END)::int AS ac_not_count,
        SUM(CASE WHEN l.type = 'water_heater'    AND NULLIF(l.completed_by,'') IS NOT NULL THEN 1 ELSE 0 END)::int AS wh_done_count,
        SUM(CASE WHEN l.type = 'water_heater'    AND NULLIF(l.completed_by,'') IS NULL     THEN 1 ELSE 0 END)::int AS wh_not_count
      FROM latest l
      JOIN scoped_props sp ON sp.property_id = l.property_id
      GROUP BY sp.user_id
    ),
    scoped_users AS (
      -- 有房产的可见用户集合
      SELECT DISTINCT sp.user_id
      FROM scoped_props sp
    )
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.email AS user_email,
      u.agency_id,
      a.agency_name,

      COALESCE(pm.total_property_count, 0)                 AS total_property_count,
      COALESCE(pm.completed_property_count, 0)             AS completed_property_count,
      COALESCE(pm.incomplete_total_count, 0)               AS incomplete_total_count,
      COALESCE(pm.incomplete_water_heater_count, 0)        AS incomplete_water_heater_count,
      COALESCE(pm.incomplete_air_conditioner_count, 0)     AS incomplete_air_conditioner_count,

      COALESCE(im.ac_done_count, 0)                        AS ac_done_count,
      COALESCE(im.ac_not_count, 0)                         AS ac_not_count,
      COALESCE(im.wh_done_count, 0)                        AS wh_done_count,
      COALESCE(im.wh_not_count, 0)                         AS wh_not_count
    FROM scoped_users su
    JOIN "USER" u ON u.id = su.user_id
    LEFT JOIN "AGENCY" a ON a.id = u.agency_id
    LEFT JOIN user_prop_metrics pm ON pm.user_id = u.id
    LEFT JOIN user_item_metrics im ON im.user_id = u.id
    ORDER BY a.agency_name NULLS LAST, u.name NULLS LAST, u.id;
  `;

  const { rows } = await pool.query(sql, [agencyFilterId, userIdsFilter]);

  // 将“按用户行”的结果组装成“中介 -> 用户”的嵌套结构，并汇总中介层的 total / pie
  const agenciesMap = new Map();

  for (const r of rows) {
    const aid = r.agency_id || 0;
    if (!agenciesMap.has(aid)) {
      agenciesMap.set(aid, {
        agency_id: r.agency_id,
        agency_name: r.agency_name || "Unknown Agency",
        metrics: {
          total_property_count: 0,
          completed_property_count: 0,
          incomplete_total_count: 0,
          incomplete_water_heater_count: 0,
          incomplete_air_conditioner_count: 0,
        },
        pie: {
          ac_done_count: 0,
          ac_not_count: 0,
          wh_done_count: 0,
          wh_not_count: 0,
        },
        users: [],
      });
    }
    const ag = agenciesMap.get(aid);

    // 用户节点
    const userNode = {
      user_id: r.user_id,
      user_name: r.user_name,
      user_email: r.user_email,
      metrics: {
        total_property_count: r.total_property_count,
        completed_property_count: r.completed_property_count,
        incomplete_total_count: r.incomplete_total_count,
        incomplete_water_heater_count: r.incomplete_water_heater_count,
        incomplete_air_conditioner_count: r.incomplete_air_conditioner_count,
      },
      pie: {
        ac_done_count: r.ac_done_count,
        ac_not_count: r.ac_not_count,
        wh_done_count: r.wh_done_count,
        wh_not_count: r.wh_not_count,
      },
    };
    ag.users.push(userNode);

    // 中介层累加
    ag.metrics.total_property_count += r.total_property_count;
    ag.metrics.completed_property_count += r.completed_property_count;
    ag.metrics.incomplete_total_count += r.incomplete_total_count;
    ag.metrics.incomplete_water_heater_count += r.incomplete_water_heater_count;
    ag.metrics.incomplete_air_conditioner_count += r.incomplete_air_conditioner_count;

    ag.pie.ac_done_count += r.ac_done_count;
    ag.pie.ac_not_count += r.ac_not_count;
    ag.pie.wh_done_count += r.wh_done_count;
    ag.pie.wh_not_count += r.wh_not_count;
  }

  // scope 描述
  const scope =
    agencyFilterId == null
      ? { visible: "all", agency_id: null, role }
      : userIdsFilter
      ? { visible: "self", agency_id: agencyFilterId, role }
      : { visible: "agency", agency_id: agencyFilterId, role };

  return {
    scope,
    agencies: Array.from(agenciesMap.values()).sort((a, b) =>
      String(a.agency_name).localeCompare(String(b.agency_name))
    ),
  };
}

module.exports = {
  createVeuProjectsForProperty,
  updateVeuProject,
  activateVeuForAgency,
  getVeuProjectsByPropertyId,
  listIncompleteVeuProjects,
  listIncompleteVeuProjectsByType,
  getVeuOverviewTree,
};