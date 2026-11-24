// Desktop Control API routes (/api/desktop/*).
const { getStats } = require('../../capture');
const { parseBody, isLoopbackAddress, foxHeaders, fetchFoxStatus, readLogTail } = require('../http-utils');
const { refreshFbCredential, getLastFbRefresh } = require('../fb-credential');

async function handleDesktopRoutes(ctx) {
  const { req, url, pathname, cfg, api, writeLog, logFilePath, foxManager, windowController, appMeta, send } = ctx;
  if (!pathname.startsWith('/api/desktop/')) return false;

  if (pathname === '/api/desktop/status' && req.method === 'GET') {
    const fox = await fetchFoxStatus(api, cfg.foxprofileToken);
    send(200, {
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
    return true;
  }

  if (pathname === '/api/desktop/profiles' && req.method === 'GET') {
    const fox = await fetchFoxStatus(api, cfg.foxprofileToken);
    send(fox.online ? 200 : 503, fox);
    return true;
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
      send(foxRes.status, data);
    } catch (err) {
      send(500, { error: err.message });
    }
    return true;
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
      send(foxRes.status, data);
    } catch (err) {
      send(500, { error: err.message });
    }
    return true;
  }

  if (pathname === '/api/desktop/foxprofile/restart' && req.method === 'POST') {
    if (!foxManager) {
      send(501, { ok: false, error: 'FoxProfile process manager unavailable' });
      return true;
    }
    try {
      const state = await foxManager.restart();
      send(200, { ok: true, state });
    } catch (err) {
      send(500, { ok: false, error: err.message });
    }
    return true;
  }

  if (pathname === '/api/desktop/logs' && req.method === 'GET') {
    const limit = Math.min(500, Math.max(10, Number(url.searchParams.get('limit')) || 150));
    send(200, { ok: true, logPath: logFilePath, lines: readLogTail(logFilePath, limit) });
    return true;
  }

  if (pathname === '/api/desktop/window/focus' && req.method === 'POST') {
    if (!isLoopbackAddress(req.socket?.remoteAddress || '')) {
      send(403, { ok: false, error: 'loopback only' });
      return true;
    }
    if (!windowController?.focus) {
      send(501, { ok: false, error: 'window controller unavailable' });
      return true;
    }
    const body = await parseBody(req, url).catch(() => ({}));
    const focused = Boolean(windowController.focus({ reload: Boolean(body.reload) }));
    send(200, { ok: true, focused });
    return true;
  }

  if (pathname === '/api/desktop/window/quit' && req.method === 'POST') {
    if (!isLoopbackAddress(req.socket?.remoteAddress || '')) {
      send(403, { ok: false, error: 'loopback only' });
      return true;
    }
    if (!windowController?.quit) {
      send(501, { ok: false, error: 'window controller unavailable' });
      return true;
    }
    send(200, { ok: true, quitting: true });
    setImmediate(() => windowController.quit());
    return true;
  }

  if (pathname === '/api/desktop/fb-cookie-refresh' && req.method === 'POST') {
    try {
      const body = await parseBody(req, url).catch(() => ({}));
      const result = await refreshFbCredential(cfg, body);
      writeLog(
        `${result.ok ? 'ok' : 'fail'} fb-cookie-refresh profile=${result.profile_id || ''} ${
          result.ok ? `c_user=${result.c_user} credential=${result.credential_id}` : result.error
        }`,
      );
      send(result.ok ? 200 : 422, result);
    } catch (err) {
      writeLog(`fail fb-cookie-refresh ${err.message}`);
      send(502, { ok: false, error: err.message });
    }
    return true;
  }

  if (pathname === '/api/desktop/fb-session/status' && req.method === 'GET') {
    send(200, {
      ok: true,
      profile_id: cfg.fbCookieProfile || '',
      refresh_minutes: Number(cfg.fbCookieRefreshMinutes) || 0,
      user_agent_saved: Boolean(cfg.fbSessionUserAgent),
      last: getLastFbRefresh(),
    });
    return true;
  }

  // Manual login: open the profile headed at facebook.com; operator logs in manually (no password stored).
  const fbLoginMatch = pathname.match(/^\/api\/desktop\/fb-login\/(open|finish)$/);
  if (fbLoginMatch && req.method === 'POST') {
    const body = await parseBody(req, url).catch(() => ({}));
    const profileId = String(body.profile_id || cfg.fbCookieProfile || '').trim();
    if (!profileId) {
      send(400, { ok: false, error: 'Chưa chọn profile' });
      return true;
    }
    const base = `${api}/browser/${encodeURIComponent(profileId)}`;
    const fox = async (method, p, data) => {
      const r = await fetch(base + p, {
        method,
        headers: foxHeaders(cfg.foxprofileToken),
        body: data && JSON.stringify(data),
        signal: AbortSignal.timeout(60000),
      });
      const json = await r.json().catch(() => ({}));
      return { status: r.status, ok: r.ok, json };
    };

    try {
      if (fbLoginMatch[1] === 'open') {
        const launch = await fox('POST', '/launch');
        if (!launch.ok && launch.status !== 409) {
          send(launch.status, { ok: false, error: `launch ${launch.status} ${launch.json.detail || ''}`.trim() });
          return true;
        }
        let nav;
        for (let tries = 60; tries > 0; tries--) {
          nav = await fox('POST', '/page/navigate', { url: 'https://www.facebook.com/', wait_until: 'domcontentloaded' });
          if (nav.status !== 503) break;
          await new Promise((r) => setTimeout(r, 1000));
        }
        writeLog(`fb-login open profile=${profileId} -> ${nav.status}`);
        if (!nav.ok) {
          send(502, { ok: false, error: `navigate ${nav.status} ${nav.json.detail || ''}`.trim() });
          return true;
        }
        send(200, { ok: true, profile_id: profileId });
        return true;
      }

      const ev = await fox('POST', '/page/evaluate', { script: 'navigator.userAgent' });
      const userAgent = ev.ok && typeof ev.json.result === 'string' ? ev.json.result : '';
      await fox('POST', '/stop');
      await new Promise((r) => setTimeout(r, 1500));
      const result = await refreshFbCredential(cfg, { profile_id: profileId, user_agent: userAgent || undefined });
      writeLog(
        `${result.ok ? 'ok' : 'fail'} fb-login finish profile=${profileId} ${
          result.ok ? `c_user=${result.c_user}` : result.error
        }`,
      );
      send(result.ok ? 200 : 422, result);
    } catch (err) {
      writeLog(`fail fb-login ${fbLoginMatch[1]} ${err.message}`);
      send(502, { ok: false, error: err.message });
    }
    return true;
  }

  // Proxy to n8n Public REST API (/api/v1/*) avoiding browser CORS blocks
  if (pathname === '/api/desktop/n8n-api' && req.method === 'POST') {
    try {
      const body = await parseBody(req, url);
      const apiKey = String(body.apiKey || req.headers['x-n8n-api-key'] || cfg.n8nApiKey || '').trim();
      const baseUrl = String(body.n8nUrl || cfg.n8nUrl || '').replace(/\/+$/, '');
      const endpoint = String(body.endpoint || '/workflows');
      const method = String(body.method || 'GET').toUpperCase();
      if (!baseUrl) {
        send(400, { ok: false, error: 'Chưa cấu hình n8nUrl' });
        return true;
      }
      if (!endpoint.startsWith('/')) {
        send(400, { ok: false, error: 'endpoint phải bắt đầu bằng /' });
        return true;
      }
      if (!apiKey) {
        send(401, {
          ok: false,
          needsApiKey: true,
          error:
            'Chưa cấu hình n8n Public API Key (X-N8N-API-KEY). Có thể cấu hình trong Quản trị Hệ thống hoặc nhập trực tiếp.',
        });
        return true;
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
      send(n8nRes.status, { ok: n8nRes.ok, status: n8nRes.status, data });
    } catch (err) {
      send(502, { ok: false, error: err.message });
    }
    return true;
  }

  // Local Workstation Operator Passcode verification
  if (pathname === '/api/desktop/auth-operator' && req.method === 'POST') {
    try {
      const body = await parseBody(req, url);
      const expected = String(cfg.desktopOperatorPasscode || '').trim();
      if (!expected) {
        send(403, {
          ok: false,
          error:
            'Chưa bật Mã Điều hành Desktop trong config.json (desktopOperatorPasscode). Vui lòng đăng nhập qua n8n / Supabase / Google.',
        });
        return true;
      }
      if (String(body.passcode || '') !== expected) {
        writeLog('fail desktop-operator-auth invalid passcode');
        send(401, { ok: false, error: 'Mã Điều hành Desktop không chính xác.' });
        return true;
      }
      const email = String(body.email || cfg.operatorEmail || 'operator@cahy.local').trim();
      writeLog(`ok desktop-operator-auth email=${email}`);
      send(200, {
        ok: true,
        provider: 'desktop-operator',
        user: {
          id: 'desktop-operator',
          email,
          full_name: 'Quản trị viên Trạm Điều hành CAHY',
          role: 'admin',
        },
      });
    } catch (err) {
      send(500, { ok: false, error: err.message });
    }
    return true;
  }

  return false;
}

module.exports = { handleDesktopRoutes };
