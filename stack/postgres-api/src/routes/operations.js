// Settings, trend reports, and news queue routes.
const { sendJson, readJsonBody, mapChannel } = require('../http');

async function handleOperationsRoutes({ req, res, pathname, q, pool }) {
  // Settings
  if (pathname === '/api/settings' && req.method === 'GET') {
    const r = await pool.query('SELECT * FROM settings ORDER BY key_name ASC');
    sendJson(res, 200, { data: r.rows });
    return true;
  }

  if (pathname.startsWith('/api/settings/') && req.method === 'PATCH') {
    const keyName = decodeURIComponent(pathname.slice('/api/settings/'.length));
    const body = await readJsonBody(req);
    const r = await pool.query(
      `INSERT INTO settings (key_name, setting_value, description, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (key_name) DO UPDATE SET
         setting_value = EXCLUDED.setting_value,
         updated_at = now()
       RETURNING *`,
      [keyName, String(body.setting_value ?? ''), body.description || null],
    );
    sendJson(res, 200, { data: r.rows[0] });
    return true;
  }

  // Trend Reports
  if (pathname === '/api/trend-reports' && req.method === 'GET') {
    const period = q.get('period');
    const periodStart = q.get('periodStart');
    const channel = mapChannel(q.get('channel'));
    const limit = Math.min(Math.max(Number(q.get('limit') || 50), 1), 500);
    const params = [];
    const conds = ['1=1'];
    if (period) {
      params.push(period);
      conds.push(`period = $${params.length}`);
    }
    if (periodStart) {
      params.push(periodStart);
      conds.push(`period_start = $${params.length}::timestamp`);
    }
    if (channel) {
      params.push(channel);
      conds.push(`channel = $${params.length}`);
    }
    params.push(limit);
    const r = await pool.query(
      `SELECT * FROM trend_reports WHERE ${conds.join(' AND ')} ORDER BY period_start DESC LIMIT $${params.length}`,
      params,
    );
    sendJson(res, 200, { data: r.rows });
    return true;
  }

  if (pathname === '/api/trend-reports/periods' && req.method === 'GET') {
    const period = q.get('period');
    const channel = mapChannel(q.get('channel'));
    const params = [];
    const conds = ['1=1'];
    if (period) {
      params.push(period);
      conds.push(`period = $${params.length}`);
    }
    if (channel) {
      params.push(channel);
      conds.push(`channel = $${params.length}`);
    }
    const r = await pool.query(
      `SELECT DISTINCT ON (period_start) period_start, period_end
       FROM trend_reports
       WHERE ${conds.join(' AND ')}
       ORDER BY period_start DESC`,
      params,
    );
    sendJson(res, 200, { data: r.rows });
    return true;
  }

  if (pathname === '/api/trend-reports' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const r = await pool.query(
      `INSERT INTO trend_reports (period, period_start, period_end, source, channel, title, content, stats)
       VALUES ($1, $2::timestamp, $3::timestamp, $4, $5, $6, $7, $8::jsonb)
       RETURNING *`,
      [
        body.period || 'day',
        body.period_start,
        body.period_end,
        body.source || null,
        mapChannel(body.channel) || 'ANTT',
        body.title || null,
        body.content || '',
        JSON.stringify(body.stats || {}),
      ],
    );
    sendJson(res, 200, { data: r.rows[0] });
    return true;
  }

  // News Queue
  if (pathname === '/api/news-queue' && req.method === 'GET') {
    const status = q.get('status') || 'pending';
    const r = await pool.query('SELECT * FROM news_queue WHERE status = $1 ORDER BY created_at DESC LIMIT 200', [status]);
    sendJson(res, 200, { data: r.rows, count: r.rowCount });
    return true;
  }

  if (pathname === '/api/news-queue' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const url = String(body.url || body.link || '').trim();
    if (!url) {
      sendJson(res, 400, { ok: false, error: 'Thiếu URL.' });
      return true;
    }
    const r = await pool.query("INSERT INTO news_queue (url, status) VALUES ($1, 'pending') RETURNING *", [url]);
    sendJson(res, 200, { ok: true, data: r.rows[0] });
    return true;
  }

  return false;
}

module.exports = { handleOperationsRoutes };
