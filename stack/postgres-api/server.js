// CAHY CyberWatch — PostgreSQL REST API Server Entrypoint.
const http = require('node:http');
const { PORT, PG_HOST, PG_PORT, PG_DATABASE } = require('./src/config');
const { ensureDatabaseAndSchema, getPool } = require('./src/db');
const { CORS_HEADERS, sendJson } = require('./src/http');
const { handleHealthRoutes } = require('./src/routes/health');
const { handleAuthRoutes } = require('./src/routes/auth');
const { handleNewsRoutes } = require('./src/routes/news');
const { handleSourcesRoutes } = require('./src/routes/sources');
const { handleRebuttalsRoutes } = require('./src/routes/rebuttals');
const { handleOperationsRoutes } = require('./src/routes/operations');

const ROUTE_HANDLERS = [
  handleHealthRoutes,
  handleAuthRoutes,
  handleNewsRoutes,
  handleSourcesRoutes,
  handleRebuttalsRoutes,
  handleOperationsRoutes,
];

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const ctx = { req, res, pathname, q: parsedUrl.searchParams, pool: getPool() };

  try {
    for (const handler of ROUTE_HANDLERS) {
      if (await handler(ctx)) return;
    }
    return sendJson(res, 404, { ok: false, error: `Not found: ${req.method} ${pathname}` });
  } catch (err) {
    console.error(`[CAHY Postgres API] Error on ${req.method} ${pathname}:`, err);
    return sendJson(res, 500, { ok: false, error: err.message || 'Internal PostgreSQL server error' });
  }
});

ensureDatabaseAndSchema()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[CAHY Postgres API] Listening on http://0.0.0.0:${PORT} (DB: ${PG_HOST}:${PG_PORT}/${PG_DATABASE})`);
    });
  })
  .catch((err) => {
    console.error('[CAHY Postgres API] Startup failure:', err);
    process.exit(1);
  });
