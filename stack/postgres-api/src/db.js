// PostgreSQL connection pool and schema bootstrap.
const fs = require('node:fs');
const { Pool, Client, types } = require('pg');
const { PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE, INIT_SQL_PATH } = require('./config');

// Return TIMESTAMP WITHOUT TIME ZONE (OID 1114) as raw wall-clock string "YYYY-MM-DDTHH:mm:ss"
// so Vietnam local timestamps in news.publish_date & trend_reports.period_start are never shifted by UTC conversion.
types.setTypeParser(1114, (val) => (val ? String(val).replace(' ', 'T') : null));

let pool = null;

async function ensureDatabaseAndSchema() {
  const adminClient = new Client({
    host: PG_HOST,
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: 'postgres',
  });
  await adminClient.connect();
  try {
    const check = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [PG_DATABASE]);
    if (check.rowCount === 0) {
      console.log(`[CAHY Postgres API] Creating database "${PG_DATABASE}"...`);
      await adminClient.query(`CREATE DATABASE "${PG_DATABASE}"`);
    }
  } finally {
    await adminClient.end();
  }

  pool = new Pool({
    host: PG_HOST,
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: PG_DATABASE,
    max: 20,
  });

  if (fs.existsSync(INIT_SQL_PATH)) {
    const sql = fs.readFileSync(INIT_SQL_PATH, 'utf8');
    await pool.query(sql);
    console.log(`[CAHY Postgres API] Schema verified from ${INIT_SQL_PATH}`);
  }
  return pool;
}

function getPool() {
  return pool;
}

module.exports = { ensureDatabaseAndSchema, getPool };
