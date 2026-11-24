// News intelligence, analytics, and stats routes.
const { analyticsQuery, parseAnalyticsRange } = require('../../analytics');
const { sendJson, readJsonBody, mapChannel } = require('../http');

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

async function handleNewsRoutes({ req, res, pathname, q, pool }) {
  if (!pathname.startsWith('/api/news') || pathname.startsWith('/api/news-queue')) return false;

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
    sendJson(res, 200, { data: r.rows });
    return true;
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
    if (q.get('endDateExclusive')) {
      params.push(q.get('endDateExclusive'));
      conds.push(`n.publish_date < $${params.length}::timestamp`);
    } else if (endDate) {
      params.push(endDate);
      conds.push(`n.publish_date <= $${params.length}::timestamp`);
    }
    if (search) {
      params.push(`%${search}%`);
      const p = `$${params.length}`;
      conds.push(`(n.content ILIKE ${p} OR n.summary ILIKE ${p} OR n.keywords ILIKE ${p})`);
    }
    if (sentiment === 'Unknown') {
      conds.push("(st.name IS NULL OR st.name NOT IN ('Tích cực', 'Trung lập', 'Tiêu cực'))");
    } else if (sentiment && sentiment !== 'all') {
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
    const direction = q.get('sort') === 'oldest' ? 'ASC' : 'DESC';
    const dataSql = `${NEWS_JOIN_SELECT} ${whereSql} ORDER BY n.created_at ${direction}, n.id ${direction} LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;

    const [countRes, dataRes] = await Promise.all([pool.query(countSql, params), pool.query(dataSql, dataParams)]);
    sendJson(res, 200, {
      data: dataRes.rows,
      count: countRes.rows[0]?.total || 0,
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/news/analytics') {
    let range;
    try {
      range = parseAnalyticsRange(q.get('startDate'), q.get('endDate'));
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
      return true;
    }
    const result = await pool.query(analyticsQuery, [mapChannel(q.get('channel')), range.start, range.end]);
    sendJson(res, 200, { ...result.rows[0].data, period: range });
    return true;
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
      params,
    );
    sendJson(res, 200, r.rows[0]);
    return true;
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
      params,
    );
    sendJson(res, 200, { data: r.rows });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/news/by-source') {
    const source = q.get('source') || '';
    const r = await pool.query(
      `${NEWS_JOIN_SELECT} WHERE n.deleted_at IS NULL AND s.name = $1 ORDER BY n.created_at DESC LIMIT 500`,
      [source],
    );
    sendJson(res, 200, { data: r.rows });
    return true;
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
      params,
    );
    sendJson(res, 200, { data: r.rows });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/news/source-stats') {
    const r = await pool.query(
      `SELECT COALESCE(s.name, 'Unknown') AS source, COUNT(*)::int AS count
       FROM news n
       LEFT JOIN sources s ON n.source_id = s.id
       WHERE n.deleted_at IS NULL
       GROUP BY COALESCE(s.name, 'Unknown')
       ORDER BY count DESC`,
    );
    sendJson(res, 200, { data: r.rows });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/news/keyword-stats') {
    const ch = mapChannel(q.get('channel'));
    const startDate = q.get('startDate');
    const params = [];
    const conds = ['deleted_at IS NULL', 'keywords IS NOT NULL', "keywords <> ''"];
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
      params,
    );
    sendJson(res, 200, { data: r.rows });
    return true;
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
      params,
    );
    sendJson(res, 200, { data: r.rows });
    return true;
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
      params,
    );
    sendJson(res, 200, { data: r.rows });
    return true;
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
    sendJson(res, 200, { data: r.rows[0] || null });
    return true;
  }

  return false;
}

module.exports = { handleNewsRoutes };
