const pool = require("../config/db");
const csv = require("csv-parser");
const iconv = require("iconv-lite");
const { Readable } = require("stream");

async function getSystemSettings() {
  const query = `SELECT * FROM "SYSTEM_SETTINGS" LIMIT 1;`;
  const { rows } = await pool.query(query);
  return rows[0] || null;
}

async function updateSystemSettings(fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) {
    throw new Error("No fields provided for update");
  }
  const setClause = keys
    .map((key, index) => `"${key}" = $${index + 1}`)
    .join(", ");
  const values = keys.map((key) => fields[key]);
  // 假设只有一行，全局设置 id 为1
  const query = `
    UPDATE "SYSTEM_SETTINGS"
    SET ${setClause}
    WHERE id = 1
    RETURNING *;
  `;
  const { rows } = await pool.query(query, values);
  return rows[0];
}

async function importData(file) {
  return new Promise((resolve, reject) => {
    const results = [];

    // decode GBK buffer to UTF-8 string
    const utf8Stream = iconv.decodeStream("gbk");

    Readable.from(file.buffer)
      .pipe(utf8Stream)
      .pipe(csv())
      .on("data", (row) => {
        for (const key in row) {
          if (typeof row[key] === "string") {
            // 替换 Excel 常见的软换行符为 \n
            row[key] = row[key].replace(/\r\n|\r|\n/g, "\n");
          }
        }
        results.push(row);
      })
      .on("end", () => {
        resolve(results);
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

module.exports = {
  getSystemSettings,
  updateSystemSettings,
  importData
};
