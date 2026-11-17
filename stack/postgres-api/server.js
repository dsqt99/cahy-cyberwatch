const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool, Client, types } = require('pg');

// Return TIMESTAMP WITHOUT TIME ZONE (OID 1114) as raw wall-clock string "YYYY-MM-DDTHH:mm:ss"
// so Vietnam local timestamps in news.publish_date & trend_reports.period_start are never shifted by UTC conversion.
types.setTypeParser(1114, (val) => (val ? String(val).replace(' ', 'T') : null));

const PORT = Number(process.env.PG_API_PORT || 5434);
const PG_HOST = process.env.PG_HOST || 'n8n_postgres';
const PG_PORT = Number(process.env.PG_PORT || 5432);
const PG_USER = process.env.PG_USER || 'postgres';
const PG_PASSWORD = process.env.PG_PASSWORD || 'postgres';
const PG_DATABASE = process.env.PG_DATABASE || 'cahy_cyberwatch';
const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'cahy-cyberwatch-pg-hmac-secret-2026';
const PARENT_FB_PHANDONG = 'e9731f2c-b7a8-4696-ab0e-f3263044aed8';

let pool;

function signToken(payload) {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 86400000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

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

  const initSqlPath = process.env.INIT_SQL_PATH || path.join(__dirname, 'init-cahy-db.sql');
  if (fs.existsSync(initSqlPath)) {
    const sql = fs.readFileSync(initSqlPath, 'utf8');
    await pool.query(sql);
    console.log(`[CAHY Postgres API] Schema verified from ${initSqlPath}`);
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CAHY-User, X-CAHY-Role, X-CAHY-Client',
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const NEWS_JOIN_SELECT = `
  SELECT
    n.id, n.source_id, n.content, n.link, n.publish_date, n.sentiment_id,
    n.summary, n.keywords, n.screenshot, n.metadata, n.comment_status,
    n.channel, n.tag, n.status, n.created_at, n.updated_at, n.deleted_at,
    CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
      'id', s.id, 'name', s.name, 'link', s.link, 'metadata', s.metadata,
      'type_id', s.type_id, 'parent_id', s.parent_id,
      'created_at', s.created_at, 'updated_at', s.updated_at, 'deleted_at', s.deleted_at,
      'type', CASE WHEN t.id IS NOT NULL THEN jsonb_build_object('id', t.id, 'name', t.name, 'created_at', t.created_at, 'updated_at', t.updated_at) ELSE NULL END,
      'parent', CASE WHEN ps.id IS NOT NULL THEN jsonb_build_object('id', ps.id, 'name', ps.name, 'link', ps.link, 'type_id', ps.type_id, 'parent_id', ps.parent_id) ELSE NULL END
    ) ELSE NULL END AS source,
    CASE WHEN st.id IS NOT NULL THEN jsonb_build_object(
      'id', st.id, 'name', st.name, 'created_at', st.created_at, 'updated_at', st.updated_at
    ) ELSE NULL END AS sentiment
  FROM news n
  LEFT JOIN sources s ON n.source_id = s.id
  LEFT JOIN types t ON s.type_id = t.id
  LEFT JOIN sources ps ON s.parent_id = ps.id
  LEFT JOIN sentiments st ON n.sentiment_id = st.id
`;

function mapChannel(ch) {
  if (!ch || ch === 'all') return null;
  if (ch === 'ANTT') return 'ANTT';
  if (ch === 'Phản Động' || ch === 'PhanDong') return 'PhanDong';
  return ch;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CAHY-User, X-CAHY-Role, X-CAHY-Client',
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const q = parsedUrl.searchParams;

  try {
    // 1. Health & Diagnostics
    if (req.method === 'GET' && (pathname === '/api/health' || pathname === '/healthz')) {
      const r = await pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM news WHERE deleted_at IS NULL) AS news,
          (SELECT COUNT(*)::int FROM sources WHERE deleted_at IS NULL) AS sources,
          (SELECT COUNT(*)::int FROM rebuttals) AS rebuttals,
          (SELECT COUNT(*)::int FROM trend_reports) AS trend_reports,
          (SELECT COUNT(*)::int FROM app_users WHERE is_active = TRUE) AS users
      `);
      return sendJson(res, 200, {
        ok: true,
        engine: 'postgresql',
        database: PG_DATABASE,
        host: `localhost:${process.env.PG_EXTERNAL_PORT || 5435}`,
        counts: r.rows[0],
      });
    }

    // 2. Authentication (Pure PostgreSQL app_users + pgcrypto bcrypt)
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!email || !password) {
        return sendJson(res, 400, { ok: false, error: 'Vui lòng nhập đầy đủ Email và Mật khẩu.' });
      }
      const r = await pool.query(
        `SELECT id, email, full_name, avatar_url, role
         FROM app_users
         WHERE LOWER(email) = $1 AND is_active = TRUE AND password_hash = crypt($2, password_hash)
         LIMIT 1`,
        [email, password]
      );
      if (r.rowCount === 0) {
        return sendJson(res, 401, { ok: false, error: 'Email hoặc mật khẩu không chính xác.' });
      }
      const user = r.rows[0];
      const token = signToken({ sub: user.id, email: user.email, role: user.role });
      return sendJson(res, 200, {
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
    }

    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const auth = String(req.headers.authorization || '');
      const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      const claims = verifyToken(token);
      if (!claims?.sub) return sendJson(res, 401, { ok: false, error: 'Phiên đăng nhập không hợp lệ.' });
      const r = await pool.query(
        'SELECT id, email, full_name, avatar_url, role FROM app_users WHERE id = $1 AND is_active = TRUE LIMIT 1',
        [claims.sub]
      );
      if (r.rowCount === 0) return sendJson(res, 401, { ok: false, error: 'Tài khoản không tồn tại hoặc đã khóa.' });
      return sendJson(res, 200, { ok: true, user: r.rows[0] });
    }

    if (req.method === 'GET' && pathname.startsWith('/api/profiles/')) {
      const userId = decodeURIComponent(pathname.slice('/api/profiles/'.length));
      const r = await pool.query(
        'SELECT id, email, full_name, avatar_url, role FROM app_users WHERE id::text = $1 AND is_active = TRUE LIMIT 1',
        [userId]
      );
      if (r.rowCount === 0) return sendJson(res, 404, { ok: false, data: null });
      return sendJson(res, 200, { ok: true, data: r.rows[0] });
    }

    // User Management (PostgreSQL app_users)
    if (pathname === '/api/users' && req.method === 'GET') {
      const r = await pool.query(
        'SELECT id, email, full_name, avatar_url, role, is_active, created_at FROM app_users ORDER BY created_at ASC'
      );
      return sendJson(res, 200, { data: r.rows });
    }

    if (pathname === '/api/users' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || 'CAHY@2026');
      const fullName = String(body.full_name || email);
      const role = body.role === 'admin' ? 'admin' : 'guest';
      if (!email) return sendJson(res, 400, { error: 'Thiếu email.' });
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
        [email, password, fullName, role]
      );
      return sendJson(res, 200, { data: r.rows[0] });
    }

    // 3. News Intelligence Endpoints
    if (req.method === 'GET' && pathname === '/api/news') {
      const ch = mapChannel(q.get('channel'));
      const limit = Math.min(Math.max(Number(q.get('limit') || 200), 1), 5000);
      const params = [];
      let where = 'WHERE n.deleted_at IS NULL';
      if (ch) {
        params.push(ch);
        where += ` AND n.channel = $${params.length}`;
      }
      params.push(limit);
      const r = await pool.query(`${NEWS_JOIN_SELECT} ${where} ORDER BY n.created_at DESC LIMIT $${params.length}`, params);
      return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'GET' && pathname === '/api/news/paginated') {
      const page = Math.max(Number(q.get('page') || 1), 1);
      const limit = Math.min(Math.max(Number(q.get('limit') || 20), 1), 500);
      const offset = (page - 1) * limit;
      const ch = mapChannel(q.get('channel'));
      const search = (q.get('search') || '').trim();
      const sentiment = (q.get('sentiment') || '').trim();
      const source = (q.get('source') || '').trim();
      const startDate = (q.get('startDate') || '').trim();
      const endDate = (q.get('endDate') || '').trim();
      const topicKeywordsRaw = (q.get('topicKeywords') || '').trim();

      const params = [];
      const conds = ['n.deleted_at IS NULL'];

      if (ch) {
        params.push(ch);
        conds.push(`n.channel = $${params.length}`);
      }
      if (startDate) {
        params.push(startDate);
        conds.push(`n.publish_date >= $${params.length}::timestamp`);
      }
      if (endDate) {
        params.push(endDate);
        conds.push(`n.publish_date <= $${params.length}::timestamp`);
      }
      if (search) {
        params.push(`%${search}%`);
        const p = `$${params.length}`;
        conds.push(`(n.content ILIKE ${p} OR n.summary ILIKE ${p} OR n.keywords ILIKE ${p})`);
      }
      if (sentiment && sentiment !== 'all') {
        params.push(sentiment);
        conds.push(`st.name = $${params.length}`);
      }
      if (source && source !== 'all') {
        params.push(source);
        conds.push(`s.name = $${params.length}`);
      }
      if (topicKeywordsRaw) {
        const kws = topicKeywordsRaw.split('|').map((k) => k.trim()).filter(Boolean);
        if (kws.length > 0) {
          const kwParts = kws.map((kw) => {
            params.push(`%${kw}%`);
            return `n.keywords ILIKE $${params.length}`;
          });
          conds.push(`(${kwParts.join(' OR ')})`);
        }
      }

      const whereSql = `WHERE ${conds.join(' AND ')}`;
      const countSql = `
        SELECT COUNT(*)::int AS total
        FROM news n
        LEFT JOIN sources s ON n.source_id = s.id
        LEFT JOIN sentiments st ON n.sentiment_id = st.id
        ${whereSql}
      `;
      const dataParams = [...params, limit, offset];
      const dataSql = `${NEWS_JOIN_SELECT} ${whereSql} ORDER BY n.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;

      const [countRes, dataRes] = await Promise.all([
        pool.query(countSql, params),
        pool.query(dataSql, dataParams),
      ]);

      return sendJson(res, 200, {
        data: dataRes.rows,
        count: countRes.rows[0]?.total || 0,
      });
    }

    if (req.method === 'GET' && pathname === '/api/news/dashboard-stats') {
      const ch = mapChannel(q.get('channel'));
      const today = q.get('today') || new Date().toISOString().slice(0, 10) + 'T00:00:00';
      const params = [today];
      let chCond = '';
      if (ch) {
        params.push(ch);
        chCond = `AND channel = $${params.length}`;
      }
      const r = await pool.query(
        `SELECT
           COUNT(*)::int AS "totalNews",
           COUNT(*) FILTER (WHERE publish_date >= $1::timestamp)::int AS "todayNews",
           COUNT(*) FILTER (WHERE summary IS NOT NULL AND summary <> '')::int AS "processed",
           COUNT(*) FILTER (WHERE content ILIKE '%thái bình%' OR summary ILIKE '%thái bình%')::int AS "thaibinh",
           COUNT(*) FILTER (WHERE content ILIKE '%hưng yên%' OR summary ILIKE '%hưng yên%')::int AS "hungyen"
         FROM news
         WHERE deleted_at IS NULL ${chCond}`,
        params
      );
      return sendJson(res, 200, r.rows[0]);
    }

    if (req.method === 'GET' && pathname === '/api/news/by-sentiment') {
      const sentiment = q.get('sentiment') || '';
      const ch = mapChannel(q.get('channel'));
      const params = [sentiment];
      let chCond = '';
      if (ch) {
        params.push(ch);
        chCond = `AND n.channel = $${params.length}`;
      }
      const r = await pool.query(
        `${NEWS_JOIN_SELECT} WHERE n.deleted_at IS NULL AND st.name = $1 ${chCond} ORDER BY n.created_at DESC LIMIT 500`,
        params
      );
      return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'GET' && pathname === '/api/news/by-source') {
      const source = q.get('source') || '';
      const r = await pool.query(
        `${NEWS_JOIN_SELECT} WHERE n.deleted_at IS NULL AND s.name = $1 ORDER BY n.created_at DESC LIMIT 500`,
        [source]
      );
      return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'GET' && pathname === '/api/news/sentiment-stats') {
      const ch = mapChannel(q.get('channel'));
      const startDate = q.get('startDate');
      const params = [];
      const conds = ['n.deleted_at IS NULL'];
      if (ch) {
        params.push(ch);
        conds.push(`n.channel = $${params.length}`);
      }
      if (startDate) {
        params.push(startDate);
        conds.push(`n.publish_date >= $${params.length}::timestamp`);
      }
      const r = await pool.query(
        `SELECT COALESCE(st.name, 'Unknown') AS sentiment, COUNT(*)::int AS count
         FROM news n
         LEFT JOIN sentiments st ON n.sentiment_id = st.id
         WHERE ${conds.join(' AND ')}
         GROUP BY COALESCE(st.name, 'Unknown')`,
        params
      );
      return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'GET' && pathname === '/api/news/source-stats') {
      const r = await pool.query(
        `SELECT COALESCE(s.name, 'Unknown') AS source, COUNT(*)::int AS count
         FROM news n
         LEFT JOIN sources s ON n.source_id = s.id
         WHERE n.deleted_at IS NULL
         GROUP BY COALESCE(s.name, 'Unknown')
         ORDER BY count DESC`
      );
      return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'GET' && pathname === '/api/news/keyword-stats') {
      const ch = mapChannel(q.get('channel'));
      const startDate = q.get('startDate');
      const params = [];
      const conds = ["deleted_at IS NULL", "keywords IS NOT NULL", "keywords <> ''"];
      if (ch) {
        params.push(ch);
        conds.push(`channel = $${params.length}`);
      }
      if (startDate) {
        params.push(startDate);
        conds.push(`publish_date >= $${params.length}::timestamp`);
      }
      const r = await pool.query(
        `SELECT kw AS keyword, COUNT(*)::int AS count
         FROM (
           SELECT TRIM(unnest(string_to_array(keywords, ','))) AS kw
           FROM news
           WHERE ${conds.join(' AND ')}
         ) sub
         WHERE kw <> ''
         GROUP BY kw
         ORDER BY count DESC
         LIMIT 20`,
        params
      );
      return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'GET' && pathname === '/api/news/daily-trends') {
      const ch = mapChannel(q.get('channel'));
      const startDate = q.get('startDate');
      const params = [];
      const conds = ['n.deleted_at IS NULL', 'n.publish_date IS NOT NULL', 'st.name IS NOT NULL'];
      if (ch) {
        params.push(ch);
        conds.push(`n.channel = $${params.length}`);
      }
      if (startDate) {
        params.push(startDate);
        conds.push(`n.publish_date >= $${params.length}::timestamp`);
      }
      const r = await pool.query(
        `SELECT
           TO_CHAR(n.publish_date, 'YYYY-MM-DD') AS "fullDate",
           TO_CHAR(n.publish_date, 'DD/MM') AS "date",
           COUNT(*) FILTER (WHERE st.name = 'Tích cực')::int AS "Tích cực",
           COUNT(*) FILTER (WHERE st.name = 'Tiêu cực')::int AS "Tiêu cực",
           COUNT(*) FILTER (WHERE st.name = 'Trung lập')::int AS "Trung lập"
         FROM news n
         JOIN sentiments st ON n.sentiment_id = st.id
         WHERE ${conds.join(' AND ')}
         GROUP BY TO_CHAR(n.publish_date, 'YYYY-MM-DD'), TO_CHAR(n.publish_date, 'DD/MM')
         ORDER BY "fullDate" ASC`,
        params
      );
      return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'GET' && pathname === '/api/news/posts-lite') {
      const ch = mapChannel(q.get('channel'));
      const startDate = q.get('startDate');
      const endDate = q.get('endDate');
      const params = [];
      const conds = ['n.deleted_at IS NULL'];
      if (ch) {
        params.push(ch);
        conds.push(`n.channel = $${params.length}`);
      }
      if (startDate) {
        params.push(startDate);
        conds.push(`n.publish_date >= $${params.length}::timestamp`);
      }
      if (endDate) {
        params.push(endDate);
        conds.push(`n.publish_date < $${params.length}::timestamp`);
      }
      const r = await pool.query(
        `SELECT
           n.id, n.source_id, n.publish_date, n.keywords, n.sentiment_id,
           CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
             'id', s.id, 'name', s.name, 'parent_id', s.parent_id,
             'parent', CASE WHEN ps.id IS NOT NULL THEN jsonb_build_object('id', ps.id, 'name', ps.name) ELSE NULL END
           ) ELSE NULL END AS source,
           CASE WHEN st.id IS NOT NULL THEN jsonb_build_object('name', st.name) ELSE NULL END AS sentiment
         FROM news n
         LEFT JOIN sources s ON n.source_id = s.id
         LEFT JOIN sources ps ON s.parent_id = ps.id
         LEFT JOIN sentiments st ON n.sentiment_id = st.id
         WHERE ${conds.join(' AND ')}
         ORDER BY n.created_at DESC
         LIMIT 5000`,
        params
      );
      return sendJson(res, 200, { data: r.rows });
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/news/')) {
      const id = decodeURIComponent(pathname.slice('/api/news/'.length));
      const body = await readJsonBody(req);
      const sets = ['updated_at = CURRENT_TIMESTAMP'];
      const params = [];
      for (const col of ['comment_status', 'status', 'summary', 'keywords', 'screenshot', 'deleted_at']) {
        if (col in body) {
          params.push(body[col]);
          sets.push(`${col} = $${params.length}`);
        }
      }
      params.push(id);
      const r = await pool.query(`UPDATE news SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
      return sendJson(res, 200, { data: r.rows[0] || null });
    }

    // 4. Sources Endpoints
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
        params
      );
      return sendJson(res, 200, { data: r.rows });
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
        ]
      );
      return sendJson(res, 200, { data: r.rows[0] });
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
      return sendJson(res, 200, { data: r.rows[0] || null });
    }

    if (pathname.startsWith('/api/sources/') && req.method === 'DELETE') {
      const id = decodeURIComponent(pathname.slice('/api/sources/'.length));
      await pool.query('UPDATE sources SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
      return sendJson(res, 200, { ok: true });
    }

    // 5. Sentiments & Types
    if (pathname === '/api/sentiments' && req.method === 'GET') {
      const r = await pool.query('SELECT * FROM sentiments WHERE deleted_at IS NULL ORDER BY name ASC');
      return sendJson(res, 200, { data: r.rows });
    }

    if (pathname === '/api/types' && req.method === 'GET') {
      const r = await pool.query('SELECT * FROM types WHERE deleted_at IS NULL ORDER BY name ASC');
      return sendJson(res, 200, { data: r.rows });
    }

    // 6. Rebuttals
    if (pathname === '/api/rebuttals' && req.method === 'GET') {
      const r = await pool.query('SELECT * FROM rebuttals ORDER BY created_at DESC');
      return sendJson(res, 200, { data: r.rows });
    }

    if (pathname === '/api/rebuttals' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const r = await pool.query(
        `INSERT INTO rebuttals (title, content, status, post_url, image_base64)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [body.title || null, body.content || '', body.status || 'draft', body.post_url || null, body.image_base64 || null]
      );
      return sendJson(res, 200, { data: r.rows[0] });
    }

    if (pathname.startsWith('/api/rebuttals/') && req.method === 'GET') {
      const id = decodeURIComponent(pathname.slice('/api/rebuttals/'.length));
      const r = await pool.query('SELECT * FROM rebuttals WHERE id = $1 LIMIT 1', [id]);
      return sendJson(res, 200, { data: r.rows[0] || null });
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
      return sendJson(res, 200, { data: r.rows[0] || null });
    }

    if (pathname.startsWith('/api/rebuttals/') && req.method === 'DELETE') {
      const id = decodeURIComponent(pathname.slice('/api/rebuttals/'.length));
      await pool.query('DELETE FROM rebuttals WHERE id = $1', [id]);
      return sendJson(res, 200, { ok: true });
    }

    // 7. Settings
    if (pathname === '/api/settings' && req.method === 'GET') {
      const r = await pool.query('SELECT * FROM settings ORDER BY key_name ASC');
      return sendJson(res, 200, { data: r.rows });
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
        [keyName, String(body.setting_value ?? ''), body.description || null]
      );
      return sendJson(res, 200, { data: r.rows[0] });
    }

    // 8. Trend Reports
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
        params
      );
      return sendJson(res, 200, { data: r.rows });
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
        params
      );
      return sendJson(res, 200, { data: r.rows });
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
        ]
      );
      return sendJson(res, 200, { data: r.rows[0] });
    }

    // 9. News Queue
    if (pathname === '/api/news-queue' && req.method === 'GET') {
      const status = q.get('status') || 'pending';
      const r = await pool.query('SELECT * FROM news_queue WHERE status = $1 ORDER BY created_at DESC LIMIT 200', [status]);
      return sendJson(res, 200, { data: r.rows, count: r.rowCount });
    }

    if (pathname === '/api/news-queue' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const url = String(body.url || body.link || '').trim();
      if (!url) return sendJson(res, 400, { ok: false, error: 'Thiếu URL.' });
      const r = await pool.query(
        `INSERT INTO news_queue (url, status) VALUES ($1, 'pending') RETURNING *`,
        [url]
      );
      return sendJson(res, 200, { ok: true, data: r.rows[0] });
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

