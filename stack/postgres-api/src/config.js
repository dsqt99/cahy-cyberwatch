// Environment configuration for CAHY Postgres API.
const path = require('node:path');

module.exports = {
  PORT: Number(process.env.PG_API_PORT || 5434),
  PG_HOST: process.env.PG_HOST || 'n8n_postgres',
  PG_PORT: Number(process.env.PG_PORT || 5432),
  PG_USER: process.env.PG_USER || 'postgres',
  PG_PASSWORD: process.env.PG_PASSWORD || 'postgres',
  PG_DATABASE: process.env.PG_DATABASE || 'cahy_cyberwatch',
  PG_EXTERNAL_PORT: process.env.PG_EXTERNAL_PORT || 5435,
  TOKEN_SECRET: process.env.AUTH_TOKEN_SECRET || 'cahy-cyberwatch-pg-hmac-secret-2026',
  INIT_SQL_PATH: process.env.INIT_SQL_PATH || path.join(__dirname, '..', 'init-cahy-db.sql'),
  PARENT_FB_PHANDONG: 'e9731f2c-b7a8-4696-ab0e-f3263044aed8',
};
