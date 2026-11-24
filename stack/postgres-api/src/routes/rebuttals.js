// Rebuttals CRUD routes.
const { sendJson, readJsonBody } = require('../http');

async function handleRebuttalsRoutes({ req, res, pathname, pool }) {
  if (pathname === '/api/rebuttals' && req.method === 'GET') {
    const r = await pool.query('SELECT * FROM rebuttals ORDER BY created_at DESC');
    sendJson(res, 200, { data: r.rows });
    return true;
  }

  if (pathname === '/api/rebuttals' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const r = await pool.query(
      `INSERT INTO rebuttals (title, content, status, post_url, image_base64)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [body.title || null, body.content || '', body.status || 'draft', body.post_url || null, body.image_base64 || null],
    );
    sendJson(res, 200, { data: r.rows[0] });
    return true;
  }

  if (pathname.startsWith('/api/rebuttals/') && req.method === 'GET') {
    const id = decodeURIComponent(pathname.slice('/api/rebuttals/'.length));
    const r = await pool.query('SELECT * FROM rebuttals WHERE id = $1 LIMIT 1', [id]);
    sendJson(res, 200, { data: r.rows[0] || null });
    return true;
  }

  if (pathname.startsWith('/api/rebuttals/') && req.method === 'PATCH') {
    const id = decodeURIComponent(pathname.slice('/api/rebuttals/'.length));
    const body = await readJsonBody(req);
    const sets = ['updated_at = now()'];
    const params = [];
    for (const col of ['title', 'content', 'status', 'post_url', 'image_base64']) {
      if (col in body) {
        params.push(body[col]);
        sets.push(`${col} = $${params.length}`);
      }
    }
    params.push(id);
    const r = await pool.query(`UPDATE rebuttals SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    sendJson(res, 200, { data: r.rows[0] || null });
    return true;
  }

  if (pathname.startsWith('/api/rebuttals/') && req.method === 'DELETE') {
    const id = decodeURIComponent(pathname.slice('/api/rebuttals/'.length));
    await pool.query('DELETE FROM rebuttals WHERE id = $1', [id]);
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}

module.exports = { handleRebuttalsRoutes };
