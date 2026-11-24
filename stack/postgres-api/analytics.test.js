const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { analyticsQuery, parseAnalyticsRange } = require('./analytics');

test('analytics range rejects ambiguous and reversed timestamps', () => {
  for (const [start, end] of [['2026-02-30', '2026-03-01'], ['2026-11-18', '2026-11-17'], ['bad', null], ['2026-11-17T00:00:00Z', null]]) {
    assert.throws(() => parseAnalyticsRange(start, end));
  }
  assert.deepEqual(parseAnalyticsRange('2026-11-01', '2026-11-17'), { start: '2026-11-01T00:00:00', end: '2026-11-17T00:00:00' });
});

test('SQL counts beyond 5000, unknown, exclusive end, channels, deletes and previous period', { skip: !process.env.RUN_PG_ANALYTICS_TEST }, () => {
  const sql = `BEGIN;
    CREATE TEMP TABLE news (id int, source_id int, publish_date timestamp, sentiment_id int, channel text, deleted_at timestamp);
    CREATE TEMP TABLE sources (id int, parent_id int, name text);
    CREATE TEMP TABLE sentiments (id int, name text);
    INSERT INTO sources VALUES (1, 2, 'Page'), (2, NULL, 'Facebook');
    INSERT INTO sentiments VALUES (1, 'Tiêu cực'), (2, 'Tích cực');
    INSERT INTO news SELECT n,1,'2026-11-16 12:00',1,'ANTT',NULL FROM generate_series(1,5001) n;
    INSERT INTO news VALUES (6000,1,'2026-11-16 13:00',NULL,'ANTT',NULL),
      (6001,1,'2026-11-15 00:00',2,'ANTT',NULL),
      (6002,1,'2026-11-17 00:00',1,'ANTT',NULL),
      (6003,1,'2026-11-16 12:00',1,'PhanDong',NULL),
      (6004,1,'2026-11-16 12:00',1,'ANTT',now());
    PREPARE analytics(text,timestamp,timestamp) AS ${analyticsQuery};
    EXECUTE analytics('ANTT','2026-11-16','2026-11-17');
    EXECUTE analytics('ANTT',NULL,'2026-11-17');
    EXECUTE analytics('ANTT','2026-12-01','2026-12-02');
    ROLLBACK;`;
  const out = execFileSync('docker', ['exec', '-i', 'cahy_n8n_postgres', 'psql', '-U', 'postgres', '-d', 'cahy_cyberwatch', '-Atq', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
  const [result, all, empty] = out.trim().split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  assert.equal(all.current.total, 5003);
  assert.equal(all.previous, null);
  assert.deepEqual(empty.current, { total: 0, positive: 0, neutral: 0, negative: 0, unknown: 0, classified: 0 });
  assert.deepEqual(empty.trends, []);
  assert.deepEqual(empty.sources, []);
  assert.deepEqual(result.current, { total: 5002, positive: 0, neutral: 0, negative: 5001, unknown: 1, classified: 5001 });
  assert.deepEqual(result.previous, { total: 1, positive: 1, neutral: 0, negative: 0, unknown: 0, classified: 1 });
  assert.deepEqual(result.trends, [{ date: '2026-11-16', positive: 0, neutral: 0, negative: 5001, unknown: 1 }]);
  assert.equal(result.sources[0].parent, 'Facebook');
  assert.equal(result.sources[0].count, 5002);
});
