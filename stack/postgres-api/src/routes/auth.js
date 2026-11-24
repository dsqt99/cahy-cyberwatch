// Authentication, profiles, and user management routes.
const { signToken, verifyToken } = require('../auth');
const { sendJson, readJsonBody } = require('../http');

async function handleAuthRoutes({ req, res, pathname, pool }) {
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) {
      sendJson(res, 400, { ok: false, error: 'Vui lòng nhập đầy đủ Email và Mật khẩu.' });
      return true;
    }
    const r = await pool.query(
      `SELECT id, email, full_name, avatar_url, role
       FROM app_users
       WHERE LOWER(email) = $1 AND is_active = TRUE AND password_hash = crypt($2, password_hash)
       LIMIT 1`,
      [email, password],
    );
    if (r.rowCount === 0) {
      sendJson(res, 401, { ok: false, error: 'Email hoặc mật khẩu không chính xác.' });
      return true;
    }
    const user = r.rows[0];
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    sendJson(res, 200, {
      ok: true,
      provider: 'postgresql',
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name || user.email,
        avatar_url: user.avatar_url || null,
        role: user.role === 'admin' ? 'admin' : 'guest',
      },
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const claims = verifyToken(token);
    if (!claims?.sub) {
      sendJson(res, 401, { ok: false, error: 'Phiên đăng nhập không hợp lệ.' });
      return true;
    }
    const r = await pool.query(
      'SELECT id, email, full_name, avatar_url, role FROM app_users WHERE id = $1 AND is_active = TRUE LIMIT 1',
      [claims.sub],
    );
    if (r.rowCount === 0) {
      sendJson(res, 401, { ok: false, error: 'Tài khoản không tồn tại hoặc đã khóa.' });
      return true;
    }
    sendJson(res, 200, { ok: true, user: r.rows[0] });
    return true;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/profiles/')) {
    const userId = decodeURIComponent(pathname.slice('/api/profiles/'.length));
    const r = await pool.query(
      'SELECT id, email, full_name, avatar_url, role FROM app_users WHERE id::text = $1 AND is_active = TRUE LIMIT 1',
      [userId],
    );
    if (r.rowCount === 0) {
      sendJson(res, 404, { ok: false, data: null });
      return true;
    }
    sendJson(res, 200, { ok: true, data: r.rows[0] });
    return true;
  }

  if (pathname === '/api/users' && req.method === 'GET') {
    const r = await pool.query(
      'SELECT id, email, full_name, avatar_url, role, is_active, created_at FROM app_users ORDER BY created_at ASC',
    );
    sendJson(res, 200, { data: r.rows });
    return true;
  }

  if (pathname === '/api/users' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || 'CAHY@2026');
    const fullName = String(body.full_name || email);
    const role = body.role === 'admin' ? 'admin' : 'guest';
    if (!email) {
      sendJson(res, 400, { error: 'Thiếu email.' });
      return true;
    }
    const r = await pool.query(
      `INSERT INTO app_users (email, password_hash, full_name, role, is_active)
       VALUES ($1, crypt($2, gen_salt('bf')), $3, $4, TRUE)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = crypt($2, gen_salt('bf')),
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         is_active = TRUE,
         updated_at = now()
       RETURNING id, email, full_name, role, is_active, created_at`,
      [email, password, fullName, role],
    );
    sendJson(res, 200, { data: r.rows[0] });
    return true;
  }

  return false;
}

module.exports = { handleAuthRoutes };
