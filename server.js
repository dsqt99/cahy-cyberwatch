// Local Webhook & Desktop Operations HTTP Server (default 127.0.0.1:5680).
// Serves:
//  - /webhook/screenshot_{fb,fbpđ,news,tiktok} (100% compatible with n8n callers)
//  - /webhook/export_fb_cookie                 (replaces legacy MultiProfile CDP cookie flow)
//  - /webhook/health                           (health probe for n8n & monitoring)
//  - /screenshots/*                            (safe local screenshot preview)
//  - /api/desktop/*                            (local control bridge for CAHY CyberWatch UI)
const fs = require('fs');
const http = require('http');
const path = require('path');
const { handle, exportFbCookie, getStats } = require('./capture');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 2e6) req.destroy(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// n8n callers send GET or POST, with a JSON or form body; support all seamlessly.
async function parseBody(req, url) {
  const raw = await readBody(req);
  const type = req.headers['content-type'] || '';
  const body =
    type.includes('json') && raw
      ? JSON.parse(raw)
      : raw
        ? Object.fromEntries(new URLSearchParams(raw))
        : {};
  return { ...Object.fromEntries(url.searchParams), ...body };
}

function isAllowedLocalOrigin(origin) {
  if (!origin) return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function foxHeaders(token) {
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchFoxStatus(api, token) {
  try {
    const res = await fetch(`${api}/profiles`, {
      headers: foxHeaders(token),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      return { online: false, status: res.status, profilesCount: 0, runningCount: 0, profiles: [] };
    }
    const data = await res.json().catch(() => ({}));
    const profiles = Array.isArray(data.profiles) ? data.profiles : [];
    const runningCount = profiles.filter((p) => p && (p.is_running || p.running || p.status === 'running')).length;
    return {
      online: true,
      profilesCount: profiles.length,
      runningCount,
      profiles,
    };
  } catch (e) {
    return { online: false, error: e.message, profilesCount: 0, runningCount: 0, profiles: [] };
  }
}

function readLogTail(logPath, maxLines = 150) {
  if (!logPath || !fs.existsSync(logPath)) return [];
  try {
    const stat = fs.statSync(logPath);
    const readSize = Math.min(stat.size, 64 * 1024);
    const fd = fs.openSync(logPath, 'r');
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
    fs.closeSync(fd);
    return buf.toString('utf8').split(/\r?\n/).filter(Boolean).slice(-maxLines);
  } catch {
    return [];
  }
}

const FB_CREDENTIAL_TYPE = 'facebookApiBotzvn';
const FB_CREDENTIAL_NAME = 'Facebook Credential account';
const FB_SESSION_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

// Last refresh outcome (manual or auto) for the Settings page; never holds the cookie.
let lastFbRefresh = null;

async function refreshFbCredential(cfg, body = {}) {
  let result;
  try {
    result = await writeFbCredential(cfg, body);
  } catch (e) {
    result = { ok: false, profile_id: body.profile_id || cfg.fbCookieProfile || '', error: e.message };
  }
  lastFbRefresh = { ok: result.ok, at: Date.now(), profile_id: result.profile_id || '', c_user: result.c_user || '', error: result.error || '', auto: Boolean(body.auto) };
  return result;
}

// Export FB cookie from a stopped profile and write it into the local n8n facebookApiBotzvn credential.
// Never returns or logs the cookie itself.
async function writeFbCredential(cfg, body = {}) {
  const api = `http://127.0.0.1:${cfg.foxprofilePort}/api/v1`;
  const baseUrl = String(cfg.n8nUrl || '').replace(/\/+$/, '');
  const apiKey = String(cfg.n8nApiKey || '').trim();
  if (!baseUrl || !apiKey) return { ok: false, error: 'Chưa cấu hình n8nUrl / n8nApiKey' };

  const exported = await exportFbCookie(
    { profile_id: body.profile_id || cfg.fbCookieProfile || '' },
    { api, token: cfg.foxprofileToken, defaultProfile: cfg.defaultProfile || '', autoProfile: true }
  );
  if (!exported.ok) return { ok: false, profile_id: exported.profile_id, error: exported.error };

  const n8n = async (endpoint, method = 'GET', payload) => {
    const res = await fetch(`${baseUrl}/api/v1${endpoint}`, {
      method,
      headers: { accept: 'application/json', 'content-type': 'application/json', 'X-N8N-API-KEY': apiKey },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`n8n ${method} ${endpoint.split('?')[0]} HTTP ${res.status}: ${data.message || ''}`.trim());
    return data;
  };

  const name = String(body.credential_name || FB_CREDENTIAL_NAME);
  const list = await n8n('/credentials?limit=250');
  const existing = (list.data || []).find((c) => c.type === FB_CREDENTIAL_TYPE && c.name === name);
  // Node expects the "cURL & WS Capture" session JSON: {http:{cookies:{c_user,xs,...},headers:{Cookie,user-agent},timestamp}}
  const cookies = Object.fromEntries(String(exported.cookie).split(';')
    .map((p) => p.trim()).filter((p) => p.includes('='))
    .map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]));
  // UA captured from the profile at login (fb-login/finish) so the session matches the browser that made it.
  const userAgent = String(body.user_agent || cfg.fbSessionUserAgent || FB_SESSION_UA);
  const headers = { Cookie: exported.cookie, 'user-agent': userAgent };
  const data = { facebookSession: JSON.stringify({ http: { cookies, headers, timestamp: Date.now() } }) };
  const saved = existing
    ? await n8n(`/credentials/${existing.id}`, 'PATCH', { type: FB_CREDENTIAL_TYPE, isPartialData: true, data })
    : await n8n('/credentials', 'POST', { name, type: FB_CREDENTIAL_TYPE, data });
  return {
    ok: true,
    profile_id: exported.profile_id,
    c_user: exported.c_user,
    credential_id: saved.id || existing?.id,
    created: !existing,
    user_agent: userAgent,
  };
}

function createWebhookServer({
  getConfig,
  crop,
  writeLog = () => {},
  logFilePath = '',
  foxManager = null,
  windowController = null,
  appMeta = { name: 'CAHY CyberWatch', version: '2.0.0' },
}) {
  const server = http.createServer(async (req, res) => {
    const cfg = getConfig();
    const api = `http://127.0.0.1:${cfg.foxprofilePort}/api/v1`;
    const origin = req.headers.origin;
    const corsHeaders = isAllowedLocalOrigin(origin)
      ? {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'access-control-allow-headers': 'Content-Type, Authorization, X-N8N-API-KEY',
        }
      : {};

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      return res.end();
    }

    const send = (status, data) => {
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        ...corsHeaders,
      });
      res.end(JSON.stringify(data));
    };

    const url = new URL(req.url, 'http://localhost');
    let pathname = url.pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return send(400, { error: 'invalid url encoding' });
    }

    // 1. Screenshot webhook: /webhook/screenshot_{fb,fbpđ,news,tiktok}
    const shotMatch = pathname.match(/^\/webhook\/screenshot_([^/]+)$/);
    if (shotMatch) {
      const type = shotMatch[1];
      try {
        const body = await parseBody(req, url);
        const out = await handle(type, body, {
          api,
          token: cfg.foxprofileToken,
          screenshotDir: cfg.screenshotDir,
          crop,
          defaultProfile: cfg.defaultProfile || '',
          autoProfile: true,
        });
        const savedPath = out[0].outputFilePath[0];
        const rel = path.relative(path.resolve(cfg.screenshotDir), path.resolve(savedPath)).replace(/\\/g, '/');
        writeLog(`ok screenshot_${type} profile=${body.profile_id || cfg.defaultProfile || 'auto'} file=${savedPath}`);
        // Keep exact legacy response array shape [{"outputFilePath":[...]}]; previewUrl can be derived by /screenshots/<rel>
        if (url.searchParams.get('include_preview') === '1') {
          return send(200, [{ outputFilePath: [savedPath], previewUrl: `http://127.0.0.1:${cfg.webhookPort}/screenshots/${encodeURI(rel)}` }]);
        }
        return send(200, out);
      } catch (e) {
        writeLog(`fail screenshot_${type} ${e.message}`);
        return send(e.status || 500, { error: e.message });
      }
    }

    // 2. Facebook Cookie Export webhook: /webhook/export_fb_cookie
    if (pathname === '/webhook/export_fb_cookie') {
      try {
        const body = await parseBody(req, url);
        const result = await exportFbCookie(body, {
          api,
          token: cfg.foxprofileToken,
          defaultProfile: cfg.defaultProfile || '',
          autoProfile: true,
        });
        writeLog(`${result.ok ? 'ok' : 'fail'} export_fb_cookie profile=${result.profile_id} ${result.ok ? `c_user=${result.c_user}` : result.error}`);
        return send(200, result);
      } catch (e) {
        writeLog(`fail export_fb_cookie ${e.message}`);
        return send(500, { ok: false, error: e.message });
      }
    }

    // 3. Webhook Health probe: /webhook/health
    if (pathname === '/webhook/health') {
      const fox = await fetchFoxStatus(api, cfg.foxprofileToken);
      return send(200, {
        ok: true,
        app: appMeta.name,
        version: appMeta.version,
        timestamp: new Date().toISOString(),
        foxprofile: { online: fox.online, profilesCount: fox.profilesCount, runningCount: fox.runningCount },
        stats: getStats(),
      });
    }

    // 4. Local Screenshot static preview: /screenshots/<subpath>
    if (pathname.startsWith('/screenshots/') && req.method === 'GET') {
      const baseDir = path.resolve(cfg.screenshotDir);
      const subPath = pathname.slice('/screenshots/'.length);
      const target = path.resolve(baseDir, subPath);
      if (!target.startsWith(baseDir + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
        return send(404, { error: 'screenshot not found' });
      }
      const ext = path.extname(target).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'application/octet-stream';
      res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-cache', ...corsHeaders });
      return fs.createReadStream(target).pipe(res);
    }

    // 5. Desktop Control API (/api/desktop/*) — strictly loopback
    if (pathname.startsWith('/api/desktop/')) {
      if (pathname === '/api/desktop/status' && req.method === 'GET') {
        const fox = await fetchFoxStatus(api, cfg.foxprofileToken);
        return send(200, {
          ok: true,
          app: appMeta,
          timestamp: new Date().toISOString(),
          services: {
            webhook: { host: cfg.webhookHost, port: cfg.webhookPort, online: true },
            dashboard: { port: cfg.dashboardPort, url: `http://localhost:${cfg.dashboardPort}` },
            foxprofile: {
              port: cfg.foxprofilePort,
              url: `http://127.0.0.1:${cfg.foxprofilePort}`,
              dir: cfg.foxprofileDir,
              headed: Boolean(cfg.headed),
              online: fox.online,
              profilesCount: fox.profilesCount,
              runningCount: fox.runningCount,
              processState: foxManager ? foxManager.getState() : null,
            },
            n8n: {
              url: cfg.n8nUrl,
              webhookBase: cfg.n8nWebhookBase || `${String(cfg.n8nUrl).replace(/\/+$/, '')}/webhook/`,
              hasApiKey: Boolean(cfg.n8nApiKey),
            },
          },
          configSummary: {
            defaultProfile: cfg.defaultProfile || '',
            screenshotDir: cfg.screenshotDir,
            minimizeToTray: cfg.minimizeToTray !== false,
            hasOperatorPasscode: Boolean(cfg.desktopOperatorPasscode),
          },
          profiles: fox.profiles,
          captureStats: getStats(),
        });
      }

      if (pathname === '/api/desktop/profiles' && req.method === 'GET') {
        const fox = await fetchFoxStatus(api, cfg.foxprofileToken);
        return send(fox.online ? 200 : 503, fox);
      }

      if (pathname === '/api/desktop/profiles' && req.method === 'POST') {
        try {
          const body = await parseBody(req, url);
          const payload = {
            name: String(body.name || '').trim(),
            proxy: body.proxy ? String(body.proxy).trim() : '',
            os_type: body.os_type || 'windows',
            timezone: body.timezone || 'Asia/Ho_Chi_Minh',
            locale: body.locale || 'vi-VN',
            engine: body.engine || 'camoufox',
          };
          const foxRes = await fetch(`${api}/profiles`, {
            method: 'POST',
            headers: foxHeaders(cfg.foxprofileToken),
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
          });
          const data = await foxRes.json().catch(() => ({}));
          return send(foxRes.status, data);
        } catch (e) {
          return send(500, { error: e.message });
        }
      }

      const profileActionMatch = pathname.match(/^\/api\/desktop\/profiles\/([^/]+)\/(launch|stop)$/);
      if (profileActionMatch && req.method === 'POST') {
        const [, name, action] = profileActionMatch;
        try {
          const foxRes = await fetch(`${api}/browser/${encodeURIComponent(name)}/${action}`, {
            method: 'POST',
            headers: foxHeaders(cfg.foxprofileToken),
            signal: AbortSignal.timeout(30000),
          });
          const data = await foxRes.json().catch(() => ({}));
          writeLog(`profile ${action} ${name} -> ${foxRes.status}`);
          return send(foxRes.status, data);
        } catch (e) {
          return send(500, { error: e.message });
        }
      }

      if (pathname === '/api/desktop/foxprofile/restart' && req.method === 'POST') {
        if (!foxManager) return send(501, { ok: false, error: 'FoxProfile process manager unavailable' });
        try {
          const state = await foxManager.restart();
          return send(200, { ok: true, state });
        } catch (e) {
          return send(500, { ok: false, error: e.message });
        }
      }

      if (pathname === '/api/desktop/logs' && req.method === 'GET') {
        const limit = Math.min(500, Math.max(10, Number(url.searchParams.get('limit')) || 150));
        return send(200, { ok: true, logPath: logFilePath, lines: readLogTail(logFilePath, limit) });
      }

      if (pathname === '/api/desktop/window/focus' && req.method === 'POST') {
        const remote = req.socket?.remoteAddress || '';
        const isLoopback = !remote || remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
        if (!isLoopback) return send(403, { ok: false, error: 'loopback only' });
        if (!windowController?.focus) return send(501, { ok: false, error: 'window controller unavailable' });
        const body = await parseBody(req, url).catch(() => ({}));
        const focused = Boolean(windowController.focus({ reload: Boolean(body.reload) }));
        return send(200, { ok: true, focused });
      }

      if (pathname === '/api/desktop/window/quit' && req.method === 'POST') {
        const remote = req.socket?.remoteAddress || '';
        const isLoopback = !remote || remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
        if (!isLoopback) return send(403, { ok: false, error: 'loopback only' });
        if (!windowController?.quit) return send(501, { ok: false, error: 'window controller unavailable' });
        send(200, { ok: true, quitting: true });
        setImmediate(() => windowController.quit());
        return;
      }

      if (pathname === '/api/desktop/fb-cookie-refresh' && req.method === 'POST') {
        try {
          const body = await parseBody(req, url).catch(() => ({}));
          const result = await refreshFbCredential(cfg, body);
          writeLog(`${result.ok ? 'ok' : 'fail'} fb-cookie-refresh profile=${result.profile_id || ''} ${result.ok ? `c_user=${result.c_user} credential=${result.credential_id}` : result.error}`);
          return send(result.ok ? 200 : 422, result);
        } catch (e) {
          writeLog(`fail fb-cookie-refresh ${e.message}`);
          return send(502, { ok: false, error: e.message });
        }
      }

      if (pathname === '/api/desktop/fb-session/status' && req.method === 'GET') {
        return send(200, {
          ok: true,
          profile_id: cfg.fbCookieProfile || '',
          refresh_minutes: Number(cfg.fbCookieRefreshMinutes) || 0,
          user_agent_saved: Boolean(cfg.fbSessionUserAgent),
          last: lastFbRefresh,
        });
      }

      // Manual login: open the profile headed at facebook.com; the operator logs in by hand (no password stored).
      const fbLoginMatch = pathname.match(/^\/api\/desktop\/fb-login\/(open|finish)$/);
      if (fbLoginMatch && req.method === 'POST') {
        const body = await parseBody(req, url).catch(() => ({}));
        const profileId = String(body.profile_id || cfg.fbCookieProfile || '').trim();
        if (!profileId) return send(400, { ok: false, error: 'Chưa chọn profile' });
        const base = `${api}/browser/${encodeURIComponent(profileId)}`;
        const fox = async (method, p, data) => {
          const r = await fetch(base + p, { method, headers: foxHeaders(cfg.foxprofileToken), body: data && JSON.stringify(data), signal: AbortSignal.timeout(60000) });
          const json = await r.json().catch(() => ({}));
          return { status: r.status, ok: r.ok, json };
        };
        try {
          if (fbLoginMatch[1] === 'open') {
            const launch = await fox('POST', '/launch');
            if (!launch.ok && launch.status !== 409) return send(launch.status, { ok: false, error: `launch ${launch.status} ${launch.json.detail || ''}`.trim() });
            // launch answers 202 while the browser starts; page calls get 503 until it is up.
            let nav;
            for (let tries = 60; tries > 0; tries--) {
              nav = await fox('POST', '/page/navigate', { url: 'https://www.facebook.com/', wait_until: 'domcontentloaded' });
              if (nav.status !== 503) break;
              await new Promise((r) => setTimeout(r, 1000));
            }
            writeLog(`fb-login open profile=${profileId} -> ${nav.status}`);
            if (!nav.ok) return send(502, { ok: false, error: `navigate ${nav.status} ${nav.json.detail || ''}`.trim() });
            return send(200, { ok: true, profile_id: profileId });
          }
          const ev = await fox('POST', '/page/evaluate', { script: 'navigator.userAgent' });
          const userAgent = ev.ok && typeof ev.json.result === 'string' ? ev.json.result : '';
          await fox('POST', '/stop');
          // cookie export needs the profile stopped; give foxprofile a moment to release the profile dir.
          await new Promise((r) => setTimeout(r, 1500));
          const result = await refreshFbCredential(cfg, { profile_id: profileId, user_agent: userAgent || undefined });
          writeLog(`${result.ok ? 'ok' : 'fail'} fb-login finish profile=${profileId} ${result.ok ? `c_user=${result.c_user}` : result.error}`);
          return send(result.ok ? 200 : 422, result);
        } catch (e) {
          writeLog(`fail fb-login ${fbLoginMatch[1]} ${e.message}`);
          return send(502, { ok: false, error: e.message });
        }
      }

      // Proxy to n8n Public REST API (/api/v1/*) avoiding browser CORS blocks
      if (pathname === '/api/desktop/n8n-api' && req.method === 'POST') {
        try {
          const body = await parseBody(req, url);
          const apiKey = String(body.apiKey || req.headers['x-n8n-api-key'] || cfg.n8nApiKey || '').trim();
          const baseUrl = String(body.n8nUrl || cfg.n8nUrl || '').replace(/\/+$/, '');
          const endpoint = String(body.endpoint || '/workflows');
          const method = String(body.method || 'GET').toUpperCase();
          if (!baseUrl) return send(400, { ok: false, error: 'Chưa cấu hình n8nUrl' });
          if (!endpoint.startsWith('/')) return send(400, { ok: false, error: 'endpoint phải bắt đầu bằng /' });
          if (!apiKey) {
            return send(401, {
              ok: false,
              needsApiKey: true,
              error: 'Chưa cấu hình n8n Public API Key (X-N8N-API-KEY). Có thể cấu hình trong Quản trị Hệ thống hoặc nhập trực tiếp.',
            });
          }

          const targetUrl = `${baseUrl}/api/v1${endpoint}`;
          const n8nRes = await fetch(targetUrl, {
            method,
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
              'X-N8N-API-KEY': apiKey,
            },
            body: body.payload && method !== 'GET' ? JSON.stringify(body.payload) : undefined,
            signal: AbortSignal.timeout(20000),
          });
          const data = await n8nRes.json().catch(() => ({}));
          return send(n8nRes.status, { ok: n8nRes.ok, status: n8nRes.status, data });
        } catch (e) {
          return send(502, { ok: false, error: e.message });
        }
      }

      // Local Workstation Operator Passcode verification (only active when desktopOperatorPasscode is configured in config.json)
      if (pathname === '/api/desktop/auth-operator' && req.method === 'POST') {
        try {
          const body = await parseBody(req, url);
          const expected = String(cfg.desktopOperatorPasscode || '').trim();
          if (!expected) {
            return send(403, {
              ok: false,
              error: 'Chưa bật Mã Điều hành Desktop trong config.json (desktopOperatorPasscode). Vui lòng đăng nhập qua n8n / Supabase / Google.',
            });
          }
          if (String(body.passcode || '') !== expected) {
            writeLog('fail desktop-operator-auth invalid passcode');
            return send(401, { ok: false, error: 'Mã Điều hành Desktop không chính xác.' });
          }
          const email = String(body.email || cfg.operatorEmail || 'operator@cahy.local').trim();
          writeLog(`ok desktop-operator-auth email=${email}`);
          return send(200, {
            ok: true,
            provider: 'desktop-operator',
            user: {
              id: 'desktop-operator',
              email,
              full_name: 'Quản trị viên Trạm Điều hành CAHY',
              role: 'admin',
            },
          });
        } catch (e) {
          return send(500, { ok: false, error: e.message });
        }
      }
    }

    return send(404, { error: 'not found' });
  });

  return server;
}

module.exports = { createWebhookServer, parseBody, isAllowedLocalOrigin, refreshFbCredential };

