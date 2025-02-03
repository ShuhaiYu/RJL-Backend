const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_r9AsjKaZltm3@ep-wandering-term-a74zsh4a-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require',
  // 或者自行根据需要传入 {user, password, database, ...} 等参数
});

module.exports = pool;
