// Sources, sentiments, and types routes.
const { PARENT_FB_PHANDONG } = require('../config');
const { sendJson, readJsonBody } = require('../http');

async function handleSourcesRoutes({ req, res, pathname, q, pool }) {
  if (pathname === '/api/sources' && req.method === 'GET') {
    const channel = q.get('channel') || 'all';
    const typeName = q.get('typeName');
    const params = [];
    const conds = ['s.deleted_at IS NULL'];

    if (channel === 'Phản Động' || channel === 'PhanDong') {
      params.push(PARENT_FB_PHANDONG);
      conds.push(`(s.id = $1::uuid OR s.parent_id = $1::uuid OR LOWER(s.name) = 'facebook phản động')`);
    } else if (channel === 'ANTT') {
      params.push(PARENT_FB_PHANDONG);
      conds.push(`NOT (s.id = $1::uuid OR COALESCE(s.parent_id::text, '') = $1::text OR LOWER(s.name) = 'facebook phản động')`);
    }
    if (typeName) {
      params.push(typeName);
      conds.push(`t.name = $${params.length}`);
    }

    const r = await pool.query(
      `SELECT
         s.*,
         CASE WHEN t.id IS NOT NULL THEN to_jsonb(t) ELSE NULL END AS type,
         CASE WHEN ps.id IS NOT NULL THEN to_jsonb(ps) ELSE NULL END AS parent
       FROM sources s
       LEFT JOIN types t ON s.type_id = t.id
       LEFT JOIN sources ps ON s.parent_id = ps.id
       WHERE ${conds.join(' AND ')}
       ORDER BY s.name ASC`,
      params,
    );
    sendJson(res, 200, { data: r.rows });
    return true;
  }

  if (pathname === '/api/sources' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const r = await pool.query(
      `INSERT INTO sources (name, link, metadata, type_id, parent_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        body.name,
        body.link || '',
        body.metadata ? JSON.stringify(body.metadata) : null,
        body.type_id || null,
        body.parent_id || null,
      ],
    );
    sendJson(res, 200, { data: r.rows[0] });
    return true;
  }

  if (pathname.startsWith('/api/sources/') && req.method === 'PATCH') {
    const id = decodeURIComponent(pathname.slice('/api/sources/'.length));
    const body = await readJsonBody(req);
    const sets = ['updated_at = CURRENT_TIMESTAMP'];
    const params = [];
    for (const col of ['name', 'link', 'type_id', 'parent_id', 'deleted_at']) {
      if (col in body) {
        params.push(body[col] === '' ? null : body[col]);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if ('metadata' in body) {
      params.push(body.metadata ? JSON.stringify(body.metadata) : null);
      sets.push(`metadata = $${params.length}::jsonb`);
    }
    params.push(id);
    const r = await pool.query(`UPDATE sources SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    sendJson(res, 200, { data: r.rows[0] || null });
    return true;
  }

  if (pathname.startsWith('/api/sources/') && req.method === 'DELETE') {
    const id = decodeURIComponent(pathname.slice('/api/sources/'.length));
    await pool.query('UPDATE sources SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/sentiments' && req.method === 'GET') {
    const r = await pool.query('SELECT * FROM sentiments WHERE deleted_at IS NULL ORDER BY name ASC');
    sendJson(res, 200, { data: r.rows });
    return true;
  }

  if (pathname === '/api/types' && req.method === 'GET') {
    const r = await pool.query('SELECT * FROM types WHERE deleted_at IS NULL ORDER BY name ASC');
    sendJson(res, 200, { data: r.rows });
    return true;
  }

  return false;
}

module.exports = { handleSourcesRoutes };
