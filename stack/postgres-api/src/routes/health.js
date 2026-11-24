// Health & diagnostics route handler.
const { PG_DATABASE, PG_EXTERNAL_PORT } = require('../config');
const { sendJson } = require('../http');

async function handleHealthRoutes({ req, res, pathname, pool }) {
  if (req.method === 'GET' && (pathname === '/api/health' || pathname === '/healthz')) {
    const r = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM news WHERE deleted_at IS NULL) AS news,
        (SELECT COUNT(*)::int FROM sources WHERE deleted_at IS NULL) AS sources,
        (SELECT COUNT(*)::int FROM rebuttals) AS rebuttals,
        (SELECT COUNT(*)::int FROM trend_reports) AS trend_reports,
        (SELECT COUNT(*)::int FROM app_users WHERE is_active = TRUE) AS users
    `);
    sendJson(res, 200, {
      ok: true,
      engine: 'postgresql',
      database: PG_DATABASE,
      host: `localhost:${PG_EXTERNAL_PORT}`,
      counts: r.rows[0],
    });
    return true;
  }
  return false;
}

module.exports = { handleHealthRoutes };
