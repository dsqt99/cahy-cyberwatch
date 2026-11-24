const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { handle, exportFbCookie, resolveProfileId, outputPath, getStats, resetStats } = require('../src/capture');
const { createWebhookServer, refreshFbCredential } = require('../src/server');

const realFetch = global.fetch;
const rect = { x: 10, y: -5, sx: 0, sy: 400, w: 600, h: 3000, vw: 1920, vh: 1080, d: 2 };

function mockFetch({
  failWait = [],
  failFull = false,
  fail = {},
  starting = 0,
  profiles = [{ name: 'test-fb' }, { name: 'test-news' }],
  cookies = [
    { name: 'c_user', value: '1000999888', domain: '.facebook.com' },
    { name: 'xs', value: 'secret_xs_token', domain: '.facebook.com' },
    { name: 'other', value: '1', domain: '.example.com' },
  ],
  n8nReply = { data: [{ id: 'wf-1', name: 'FB ver2', active: true }] },
  passthroughPort = null,
} = {}) {
  const calls = [];
  global.fetch = async (url, init = {}) => {
    const u = String(url);
    // Pass through local loopback HTTP calls to our test webhook server!
    if (passthroughPort && u.startsWith(`http://127.0.0.1:${passthroughPort}`)) {
      return realFetch(url, init);
    }

    const { method = 'GET', body } = init;
    const parsedUrl = new URL(u);

    // Mock n8n Public API
    if (parsedUrl.hostname === 'n8n.test') {
      calls.push(`${method} ${parsedUrl.pathname}`);
      return {
        ok: true,
        status: 200,
        json: async () => n8nReply,
        text: async () => JSON.stringify(n8nReply),
      };
    }

    // Mock FoxProfile /profiles & /profiles/:name/cookies
    if (/\/api\/v1\/profiles$/.test(parsedUrl.pathname)) {
      calls.push(`${method} /profiles`);
      if (method === 'POST') {
        const created = JSON.parse(body);
        return { ok: true, status: 201, json: async () => created, text: async () => JSON.stringify(created) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ profiles, total: profiles.length }),
        text: async () => JSON.stringify({ profiles, total: profiles.length }),
      };
    }

    const cookieMatch = parsedUrl.pathname.match(/\/api\/v1\/profiles\/([^/]+)\/cookies$/);
    if (cookieMatch) {
      calls.push(`${method} /profiles/${decodeURIComponent(cookieMatch[1])}/cookies`);
      if (fail['/cookies']) {
        return {
          ok: false,
          status: fail['/cookies'],
          json: async () => ({ detail: 'Profile is running' }),
          text: async () => JSON.stringify({ detail: 'Profile is running' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => cookies,
        text: async () => JSON.stringify(cookies),
      };
    }

    const p = parsedUrl.pathname.replace(/^.*\/browser\/[^/]+/, '');
    const data = body && JSON.parse(body);
    calls.push(`${method} ${p}`);
    const reply = (status, json) => ({
      ok: status < 300,
      status,
      json: async () => json,
      text: async () => JSON.stringify(json),
    });
    if (fail[p]) return reply(fail[p], { detail: 'boom' });
    if (p === '/page/navigate' && starting-- > 0) return reply(503, { detail: 'Browser is still starting' });
    if (p === '/page/wait' && failWait.includes(data.selector)) return reply(408, {});
    if (p === '/page/screenshot' && failFull && u.includes('full_page=true')) return reply(400, {});
    if (p === '/page/evaluate') return reply(200, { result: rect });
    if (p === '/page/screenshot') return reply(200, { png_base64: Buffer.from('png').toString('base64') });
    return reply(200, { success: true });
  };
  return calls;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'));
const crops = [];
const opts = { api: 'http://fox/api/v1', screenshotDir: dir, crop: (png, r) => (crops.push(r), png) };
const body = { url: 'https://www.facebook.com/123_456', profile_id: 'p1', source: 'src' };

test('falls back to the second selector, crops the full page, writes the file', async () => {
  resetStats();
  const calls = mockFetch({ failWait: ['div[aria-posinset="1"]'] });
  const out = await handle('fb', body, opts);
  assert.deepStrictEqual(out, [{ outputFilePath: [path.join(dir, 'facebook_src', 'post_facebook_123_456.png')] }]);
  assert.deepStrictEqual(crops.at(-1), { x: 20, y: 790, width: 1200, height: 6000 });
  assert.strictEqual(fs.readFileSync(out[0].outputFilePath[0], 'utf8'), 'png');
  assert.strictEqual(calls.at(-1), 'POST /stop');
  assert.strictEqual(getStats().totalSuccess, 1);
});

test('clamps to the viewport when the full page is refused', async () => {
  mockFetch({ failFull: true });
  await handle('fb', body, opts);
  assert.deepStrictEqual(crops.at(-1), { x: 20, y: 0, width: 1200, height: 2160 });
});

test('launch failure throws and does not stop', async () => {
  const calls = mockFetch({ fail: { '/launch': 502 } });
  await assert.rejects(handle('fb', body, opts), /POST \/launch: 502 boom/);
  assert.ok(!calls.includes('POST /stop'));
});

test('navigate failure still stops the profile', async () => {
  const calls = mockFetch({ fail: { '/page/navigate': 500 } });
  await assert.rejects(handle('fb', body, opts));
  assert.strictEqual(calls.at(-1), 'POST /stop');
});

test('requests on the same profile run one after another', async () => {
  const calls = mockFetch();
  await Promise.all([handle('fb', body, opts), handle('fb', { ...body, url: 'https://www.facebook.com/2' }, opts)]);
  assert.deepStrictEqual(calls.filter((c) => /launch|stop/.test(c)), ['POST /launch', 'POST /stop', 'POST /launch', 'POST /stop']);
});

test('rejects bad input and keeps paths inside the screenshot dir', async () => {
  await assert.rejects(handle('fb', { ...body, url: 'file:///c:/x' }, opts), /http/);
  await assert.rejects(handle('nope', body, opts), /unknown type/);
  await assert.rejects(handle('fb', { url: 'https://facebook.com/1' }, opts), /profile_id is required/);
  const p = outputPath(dir, 'news', { url: 'https://x.vn/..\\..\\evil.html', source: '../up' });
  assert.ok(p.startsWith(path.join(dir, 'news_')), p);
  assert.strictEqual(path.dirname(path.dirname(p)), dir);
});

test('retries navigate while the browser is still starting', async () => {
  const calls = mockFetch({ starting: 2 });
  await handle('news', { url: 'https://example.com/a', profile_id: 'p3' }, opts);
  assert.strictEqual(calls.filter((c) => c === 'POST /page/navigate').length, 3);
});

test('auto-resolves profile_id for news & fb and auto-creates default news profile when empty', async () => {
  mockFetch({ profiles: [{ name: 'acc-fb-01' }, { name: 'test-news' }] });
  const newsProf = await resolveProfileId({ api: 'http://fox/api/v1', type: 'news' });
  const fbProf = await resolveProfileId({ api: 'http://fox/api/v1', type: 'fb' });
  assert.strictEqual(newsProf, 'test-news');
  assert.strictEqual(fbProf, 'acc-fb-01');

  // Auto-create when 0 profiles exist
  const calls = mockFetch({ profiles: [] });
  const created = await resolveProfileId({ api: 'http://fox/api/v1', type: 'news' });
  assert.strictEqual(created, 'cahy-news-default');
  assert.ok(calls.includes('POST /profiles'));
});

test('exports Facebook cookies with c_user & xs and reports missing cookies cleanly', async () => {
  mockFetch();
  const res = await exportFbCookie({ profile_id: 'test-fb' }, { api: 'http://fox/api/v1' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.c_user, '1000999888');
  assert.strictEqual(res.cookie, 'c_user=1000999888; xs=secret_xs_token');

  mockFetch({ cookies: [{ name: 'c_user', value: '123', domain: '.facebook.com' }] });
  const missing = await exportFbCookie({ profile_id: 'test-fb' }, { api: 'http://fox/api/v1' });
  assert.strictEqual(missing.ok, false);
  assert.match(missing.error, /missing cookies: xs/);
});

test('HTTP server serves screenshot_*, export_fb_cookie, /screenshots/*, /api/desktop/*, and blocks path traversal', async () => {
  mockFetch();
  const srv = createWebhookServer({
    getConfig: () => ({
      foxprofilePort: 8010,
      foxprofileToken: '',
      foxprofileDir: 'D:\\code\\foxprofile',
      headed: false,
      webhookHost: '127.0.0.1',
      webhookPort: 0,
      dashboardPort: 5690,
      screenshotDir: dir,
      defaultProfile: '',
      n8nUrl: 'http://n8n.test',
      n8nApiKey: 'test-api-key',
      desktopOperatorPasscode: 'CAHY2026',
    }),
    crop: (png) => png,
  });

  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const port = srv.address().port;
  const base = `http://127.0.0.1:${port}`;
  mockFetch({ passthroughPort: port });

  try {
    // 1. Báo ver2 style call WITHOUT profile_id -> auto-resolves test-news!

    const shotRes = await fetch(`${base}/webhook/screenshot_news`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://vnexpress.net/tin-hung-yen-999.html', source: 'news' }),
    });
    assert.strictEqual(shotRes.status, 200);
    const shotJson = await shotRes.json();
    assert.ok(shotJson[0].outputFilePath[0].endsWith('post_news_tin-hung-yen-999.png'));

    // 2. Preview screenshot via /screenshots/ & block path traversal
    const previewRes = await fetch(`${base}/screenshots/news_news/post_news_tin-hung-yen-999.png`);
    assert.strictEqual(previewRes.status, 200);
    assert.strictEqual(await previewRes.text(), 'png');

    const traversalRes = await fetch(`${base}/screenshots/..%2F..%2Fevil.txt`);
    assert.strictEqual(traversalRes.status, 404);

    // 3. export_fb_cookie webhook
    const cookieRes = await fetch(`${base}/webhook/export_fb_cookie`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile_id: 'test-fb' }),
    });
    const cookieJson = await cookieRes.json();
    assert.strictEqual(cookieJson.ok, true);
    assert.strictEqual(cookieJson.c_user, '1000999888');

    // 4. Desktop status & n8n API proxy
    const statusRes = await fetch(`${base}/api/desktop/status`, {
      headers: { origin: 'http://localhost:5690' },
    });
    assert.strictEqual(statusRes.headers.get('access-control-allow-origin'), 'http://localhost:5690');
    const statusJson = await statusRes.json();
    assert.strictEqual(statusJson.ok, true);
    assert.strictEqual(statusJson.services.foxprofile.online, true);

    const n8nRes = await fetch(`${base}/api/desktop/n8n-api`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: '/workflows', method: 'GET' }),
    });
    const n8nJson = await n8nRes.json();
    assert.strictEqual(n8nJson.ok, true);
    assert.strictEqual(n8nJson.data.data[0].name, 'FB ver2');

    // 5. Desktop operator passcode auth
    const badAuth = await fetch(`${base}/api/desktop/auth-operator`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passcode: 'wrong' }),
    });
    assert.strictEqual(badAuth.status, 401);

    const okAuth = await fetch(`${base}/api/desktop/auth-operator`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passcode: 'CAHY2026', email: 'admin@cahy.gov.vn' }),
    });
    assert.strictEqual(okAuth.status, 200);
    const okAuthJson = await okAuth.json();
    assert.strictEqual(okAuthJson.user.role, 'admin');
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('fb-cookie-refresh patches the existing facebookApiBotzvn credential without leaking the cookie', async () => {
  const calls = mockFetch({
    n8nReply: { id: 'cred-1', data: [{ id: 'cred-1', type: 'facebookApiBotzvn', name: 'Facebook Credential account' }] },
  });
  const res = await refreshFbCredential(
    { foxprofilePort: 8010, n8nUrl: 'http://n8n.test', n8nApiKey: 'k' },
    { profile_id: 'test-fb' }
  );
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.credential_id, 'cred-1');
  assert.strictEqual(res.created, false);
  assert.ok(calls.includes('PATCH /api/v1/credentials/cred-1'));
  assert.ok(!JSON.stringify(res).includes('secret_xs_token'));
});

test('fb-login open retries navigate, finish stops then saves the session, status shows the result', async () => {
  const srv = createWebhookServer({
    getConfig: () => ({ foxprofilePort: 8010, foxprofileToken: '', n8nUrl: 'http://n8n.test', n8nApiKey: 'k', fbCookieProfile: 'test-fb', fbCookieRefreshMinutes: 60, fbSessionUserAgent: 'UA-saved' }),
    crop: (png) => png,
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const calls = mockFetch({
    starting: 1,
    passthroughPort: srv.address().port,
    n8nReply: { id: 'cred-1', data: [{ id: 'cred-1', type: 'facebookApiBotzvn', name: 'Facebook Credential account' }] },
  });
  const post = (p) => fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  try {
    const open = await post('/api/desktop/fb-login/open');
    assert.strictEqual(open.status, 200);
    assert.strictEqual(calls.filter((c) => c === 'POST /page/navigate').length, 2);

    const fin = await (await post('/api/desktop/fb-login/finish')).json();
    assert.strictEqual(fin.ok, true);
    assert.strictEqual(fin.user_agent, 'UA-saved'); // evaluate mock returns a non-string, so config UA wins
    assert.ok(calls.indexOf('POST /stop') < calls.indexOf('GET /profiles/test-fb/cookies'));

    const st = await (await fetch(`${base}/api/desktop/fb-session/status`)).json();
    assert.strictEqual(st.profile_id, 'test-fb');
    assert.strictEqual(st.last.ok, true);
    assert.strictEqual(st.last.c_user, '1000999888');
    assert.ok(!JSON.stringify(st).includes('secret_xs_token'));
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('keep-alive reuses the browser across jobs and cookie export stops it first', async () => {
  const { stopAllSessions } = require('../src/capture');
  const calls = mockFetch();
  const ka = { ...opts, keepAliveMs: 60000 };
  await handle('fb', { ...body, profile_id: 'warm1' }, ka);
  await handle('fb', { ...body, profile_id: 'warm1', url: 'https://www.facebook.com/9' }, ka);
  assert.strictEqual(calls.filter((c) => c === 'POST /launch').length, 1);
  assert.ok(!calls.includes('POST /stop'));
  await exportFbCookie({ profile_id: 'warm1' }, { api: 'http://fox/api/v1' });
  assert.ok(calls.indexOf('POST /stop') !== -1 && calls.indexOf('POST /stop') < calls.indexOf('GET /profiles/warm1/cookies'));
  await stopAllSessions();
});

test('/api/desktop is loopback-only and webhookToken gates /webhook/*', async () => {
  const srv = createWebhookServer({
    getConfig: () => ({ foxprofilePort: 8010, foxprofileToken: '', webhookToken: 's3cret', screenshotDir: dir }),
    crop: (png) => png,
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  mockFetch({ passthroughPort: srv.address().port });
  try {
    const noTok = await fetch(`${base}/webhook/export_fb_cookie`, { method: 'POST', body: '{}' });
    assert.strictEqual(noTok.status, 401);
    const withTok = await fetch(`${base}/webhook/export_fb_cookie`, { method: 'POST', headers: { authorization: 'Bearer s3cret', 'content-type': 'application/json' }, body: JSON.stringify({ profile_id: 'test-fb' }) });
    assert.strictEqual(withTok.status, 200);
    const health = await fetch(`${base}/webhook/health`);
    assert.strictEqual(health.status, 200);
    const desktop = await fetch(`${base}/api/desktop/logs`);
    assert.notStrictEqual(desktop.status, 403); // loopback caller is allowed
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('detects Facebook login/checkpoint wall and fails with 401 without retrying', async () => {
  const { setRetryDelay } = require('../src/capture');
  setRetryDelay(5);
  let evalCalls = 0;
  const realFetchBackup = global.fetch;
  const calls = [];
  global.fetch = async (url, init = {}) => {
    const p = new URL(String(url)).pathname.replace(/^.*\/browser\/[^/]+/, '');
    calls.push(`${init.method || 'GET'} ${p}`);
    if (p === '/page/evaluate') {
      evalCalls++;
      return { ok: true, status: 200, json: async () => ({ result: 'https://www.facebook.com/checkpoint/?next=123' }), text: async () => '{}' };
    }
    return { ok: true, status: 200, json: async () => ({ success: true }), text: async () => '{}' };
  };
  try {
    await assert.rejects(
      handle('fb', { url: 'https://www.facebook.com/post/1', profile_id: 'fb-wall' }, { ...opts, retries: 2 }),
      /facebook_login_required/
    );
    assert.strictEqual(evalCalls, 1); // noRetry=true so only 1 attempt
    assert.ok(calls.includes('POST /stop'));
  } finally {
    global.fetch = realFetchBackup;
  }
});

test('retries transient capture failure and succeeds on second attempt', async () => {
  const { setRetryDelay } = require('../src/capture');
  setRetryDelay(5);
  let navCount = 0;
  const realFetchBackup = global.fetch;
  global.fetch = async (url, init = {}) => {
    const p = new URL(String(url)).pathname.replace(/^.*\/browser\/[^/]+/, '');
    if (p === '/page/navigate' && ++navCount === 1) {
      return { ok: false, status: 502, json: async () => ({ detail: 'temporary glitch' }), text: async () => '{}' };
    }
    if (p === '/page/evaluate') {
      const parsed = init.body ? JSON.parse(init.body) : {};
      if (parsed.script === 'location.href') {
        return { ok: true, status: 200, json: async () => ({ result: 'https://www.facebook.com/ok' }), text: async () => '{}' };
      }
      return { ok: true, status: 200, json: async () => ({ result: rect }), text: async () => '{}' };
    }
    if (p === '/page/screenshot') {
      return { ok: true, status: 200, json: async () => ({ png_base64: Buffer.from('png').toString('base64') }), text: async () => '{}' };
    }
    return { ok: true, status: 200, json: async () => ({ success: true }), text: async () => '{}' };
  };
  try {
    const out = await handle('fb', { url: 'https://www.facebook.com/retry/1', profile_id: 'fb-retry' }, { ...opts, retries: 1 });
    assert.strictEqual(navCount, 2);
    assert.ok(out[0].outputFilePath[0].endsWith('post_facebook_1.png'));
  } finally {
    global.fetch = realFetchBackup;
  }
});

test('maxConcurrent caps simultaneous browsers across different profiles', async () => {
  let current = 0;
  let peak = 0;
  const realFetchBackup = global.fetch;
  global.fetch = async (url, init = {}) => {
    const p = new URL(String(url)).pathname.replace(/^.*\/browser\/[^/]+/, '');
    if (p === '/launch') { current++; peak = Math.max(peak, current); }
    if (p === '/stop') { current = Math.max(0, current - 1); }
    if (p === '/page/navigate') await new Promise((r) => setTimeout(r, 40));
    if (p === '/page/evaluate') {
      const parsed = init.body ? JSON.parse(init.body) : {};
      if (parsed.script === 'location.href') return { ok: true, status: 200, json: async () => ({ result: 'https://example.com' }), text: async () => '{}' };
      return { ok: true, status: 200, json: async () => ({ result: rect }), text: async () => '{}' };
    }
    if (p === '/page/screenshot') {
      return { ok: true, status: 200, json: async () => ({ png_base64: Buffer.from('png').toString('base64') }), text: async () => '{}' };
    }
    return { ok: true, status: 200, json: async () => ({ success: true }), text: async () => '{}' };
  };
  try {
    await Promise.all([
      handle('news', { url: 'https://example.com/1', profile_id: 'c1' }, { ...opts, maxConcurrent: 2 }),
      handle('news', { url: 'https://example.com/2', profile_id: 'c2' }, { ...opts, maxConcurrent: 2 }),
      handle('news', { url: 'https://example.com/3', profile_id: 'c3' }, { ...opts, maxConcurrent: 2 }),
      handle('news', { url: 'https://example.com/4', profile_id: 'c4' }, { ...opts, maxConcurrent: 2 }),
    ]);
    assert.ok(peak <= 2, `peak concurrency was ${peak}, expected <= 2`);
  } finally {
    global.fetch = realFetchBackup;
  }
});
