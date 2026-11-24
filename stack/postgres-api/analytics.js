// Aggregate in PostgreSQL, in one statement/snapshot, without a row cap.
const analyticsQuery = `
WITH base AS (
  SELECT n.publish_date, st.name AS sentiment,
    COALESCE(ps.name, CASE WHEN s.name IN ('Báo','Facebook','Telegram','Facebook Phản động') THEN s.name END, 'Khác / chưa rõ') AS parent
  FROM news n
  LEFT JOIN sentiments st ON st.id = n.sentiment_id
  LEFT JOIN sources s ON s.id = n.source_id
  LEFT JOIN sources ps ON ps.id = s.parent_id
  WHERE n.deleted_at IS NULL
    AND ($1::text IS NULL OR n.channel = $1)
    AND ($2::timestamp IS NULL OR n.publish_date >= $2::timestamp - ($3::timestamp - $2::timestamp))
    AND (n.publish_date < $3::timestamp OR ($2::timestamp IS NULL AND n.publish_date IS NULL))
), current_rows AS (
  SELECT * FROM base WHERE $2::timestamp IS NULL OR publish_date >= $2::timestamp
), daily AS (
  SELECT TO_CHAR(publish_date, 'YYYY-MM-DD') AS date,
    COUNT(*) FILTER (WHERE sentiment = 'Tích cực')::int AS positive,
    COUNT(*) FILTER (WHERE sentiment = 'Trung lập')::int AS neutral,
    COUNT(*) FILTER (WHERE sentiment = 'Tiêu cực')::int AS negative,
    COUNT(*) FILTER (WHERE sentiment IS NULL OR sentiment NOT IN ('Tích cực','Trung lập','Tiêu cực'))::int AS unknown
  FROM current_rows WHERE publish_date IS NOT NULL GROUP BY TO_CHAR(publish_date, 'YYYY-MM-DD')
), source_counts AS (
  SELECT parent, COUNT(*)::int AS count,
    COUNT(*) FILTER (WHERE sentiment = 'Tiêu cực')::int AS negative
  FROM current_rows GROUP BY parent
), current_counts AS (
  SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE sentiment = 'Tích cực')::int AS positive,
    COUNT(*) FILTER (WHERE sentiment = 'Trung lập')::int AS neutral,
    COUNT(*) FILTER (WHERE sentiment IS NULL OR sentiment NOT IN ('Tích cực','Trung lập','Tiêu cực'))::int AS unknown,
    COUNT(*) FILTER (WHERE sentiment = 'Tiêu cực')::int AS negative,
    COUNT(*) FILTER (WHERE sentiment IN ('Tích cực','Trung lập','Tiêu cực'))::int AS classified
  FROM current_rows
), previous_counts AS (
  SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE sentiment = 'Tích cực')::int AS positive,
    COUNT(*) FILTER (WHERE sentiment = 'Trung lập')::int AS neutral,
    COUNT(*) FILTER (WHERE sentiment IS NULL OR sentiment NOT IN ('Tích cực','Trung lập','Tiêu cực'))::int AS unknown,
    COUNT(*) FILTER (WHERE sentiment = 'Tiêu cực')::int AS negative,
    COUNT(*) FILTER (WHERE sentiment IN ('Tích cực','Trung lập','Tiêu cực'))::int AS classified
  FROM base WHERE publish_date < $2::timestamp
)
SELECT jsonb_build_object(
  'trends', COALESCE((SELECT jsonb_agg(daily ORDER BY date) FROM daily), '[]'::jsonb),
  'sources', COALESCE((SELECT jsonb_agg(source_counts ORDER BY count DESC, parent) FROM source_counts), '[]'::jsonb),
  'current', (SELECT to_jsonb(current_counts) FROM current_counts),
  'previous', CASE WHEN $2::timestamp IS NULL THEN NULL ELSE (SELECT to_jsonb(previous_counts) FROM previous_counts) END
) AS data`;

function parseAnalyticsRange(startValue, endValue, now = new Date()) {
  // Database timestamps are Vietnam wall-clock timestamps without an offset.
  const localNow = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 19);
  const normalize = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)?$/.test(value)) throw new Error('Invalid analytics timestamp');
    const normalized = value.length === 10 ? value + 'T00:00:00' : value;
    const date = new Date(normalized + 'Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== normalized.slice(0, 19)) throw new Error('Invalid analytics timestamp');
    return normalized;
  };
  const start = startValue ? normalize(startValue) : null;
  const end = normalize(endValue || localNow);
  if (start && new Date(start + 'Z') >= new Date(end + 'Z')) throw new Error('startDate must precede endDate');
  return { start, end };
}

module.exports = { analyticsQuery, parseAnalyticsRange };
