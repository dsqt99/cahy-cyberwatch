// Screenshot & Facebook Cookie Engine over the FoxProfile REST API (replaces legacy MultiProfile n8n flows).
const fs = require('fs');
const path = require('path');

const FB = { dir: 'facebook', selectors: ['div[aria-posinset="1"]', 'div[role="main"]'], waitUntil: 'domcontentloaded' };
const TYPES = {
  fb: FB,
  'fbpđ': FB,
  news: { dir: 'news', selectors: ['body'], waitUntil: 'load' },
  tiktok: { dir: 'tiktok', selectors: ['div[id="main-content-video_detail"]', 'body'], waitUntil: 'domcontentloaded' },
};

// Webhook input ends up in a file path: strip separators and characters Windows rejects.
const safe = (s) => String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '_');

function outputPath(baseDir, type, body) {
  const { dir } = TYPES[type];
  const cleanUrl = String(body.url).split('?')[0].replace(/\/+$/, '');
  const last = cleanUrl.split('/').pop();
  const id = (type === 'news' ? last.split('.')[0] : last) || Math.floor(Date.now() / 1000);
  return path.join(baseDir, `${dir}_${safe(body.source ?? '')}`, `post_${dir}_${safe(id)}.png`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Live telemetry for Desktop Control Center & Dashboard Workflow Hub
const stats = {
  activeJobs: 0,
  totalCaptures: 0,
  totalSuccess: 0,
  totalFailed: 0,
  totalCookieExports: 0,
  recentJobs: [],
};
let jobSeq = 1;

function recordJobStart(meta) {
  stats.activeJobs++;
  const entry = {
    id: `job_${Date.now()}_${jobSeq++}`,
    startedAt: new Date().toISOString(),
    status: 'running',
    durationMs: 0,
    ...meta,
  };
  stats.recentJobs.unshift(entry);
  if (stats.recentJobs.length > 40) stats.recentJobs.length = 40;
  return { entry, t0: Date.now() };
}

function recordJobEnd(tracker, status, extra = {}) {
  stats.activeJobs = Math.max(0, stats.activeJobs - 1);
  tracker.entry.status = status;
  tracker.entry.durationMs = Date.now() - tracker.t0;
  Object.assign(tracker.entry, extra);
}

function getStats() {
  return {
    activeJobs: stats.activeJobs,
    queuedProfiles: Array.from(queues.keys()),
    totalCaptures: stats.totalCaptures,
    totalSuccess: stats.totalSuccess,
    totalFailed: stats.totalFailed,
    totalCookieExports: stats.totalCookieExports,
    recentJobs: stats.recentJobs.slice(0, 30),
  };
}

function resetStats() {
  stats.activeJobs = 0;
  stats.totalCaptures = 0;
  stats.totalSuccess = 0;
  stats.totalFailed = 0;
  stats.totalCookieExports = 0;
  stats.recentJobs = [];
}

function authHeaders(token) {
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

// Resolve a usable FoxProfile profile_id when callers (e.g. Báo ver2 screenshot_news) omit profile_id.
async function resolveProfileId({ api, token, type, profileId, defaultProfile, autoCreateNews = true }) {
  if (profileId) return String(profileId).trim();
  if (defaultProfile) return String(defaultProfile).trim();

  const res = await fetch(`${api}/profiles`, {
    method: 'GET',
    headers: authHeaders(token),
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(`GET /profiles: ${res.status} ${json.detail ?? ''}`.trim()), { status: res.status });
  }

  const list = Array.isArray(json.profiles) ? json.profiles : [];
  const names = list.map((p) => (typeof p === 'string' ? p : p?.name)).filter(Boolean);

  if (names.length > 0) {
    const pattern =
      type === 'news'
        ? /news|bao|default/i
        : type === 'tiktok'
          ? /tiktok|tt/i
          : /fb|facebook/i;
    return names.find((n) => pattern.test(n)) || names[0];
  }

  // Auto-provision an ephemeral-safe default profile for public news scraping when FoxProfile has 0 profiles.
  if (type === 'news' && autoCreateNews) {
    const autoName = 'cahy-news-default';
    const createRes = await fetch(`${api}/profiles`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: autoName,
        os_type: 'windows',
        timezone: 'Asia/Ho_Chi_Minh',
        locale: 'vi-VN',
        engine: 'camoufox',
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (createRes.ok || createRes.status === 409) return autoName;
  }

  return '';
}

async function shoot({ api, token, type, body }) {
  const t = TYPES[type];
  const base = `${api}/browser/${encodeURIComponent(body.profile_id)}`;
  const call = async (method, p, data, qs) => {
    const res = await fetch(base + p + (qs ? '?' + new URLSearchParams(qs) : ''), {
      method,
      headers: authHeaders(token),
      body: data && JSON.stringify(data),
      signal: AbortSignal.timeout(120000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(`${method} ${p}: ${res.status} ${json.detail ?? json.message ?? ''}`.trim()), { status: res.status });
    return json;
  };

  let launched = false;
  try {
    await call('POST', '/launch');
    launched = true;
    // launch answers 202 when the browser takes longer than foxprofile's wait; page calls then get 503 until it is up.
    for (let tries = 60; ; tries--) {
      try {
        await call('POST', '/page/navigate', { url: body.url, wait_until: t.waitUntil });
        break;
      } catch (e) {
        if (e.status !== 503 || tries <= 1) throw e;
        await sleep(1000);
      }
    }

    let selector = null;
    for (const [i, sel] of t.selectors.entries()) {
      try {
        await call('POST', '/page/wait', { selector: sel, timeout: i === 0 ? 20000 : 5000 });
        selector = sel;
        break;
      } catch (e) {}
    }
    if (!selector) throw new Error('no element matched: ' + t.selectors.join(' | '));

    const rectScript = `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.scrollIntoView({ block: 'start' });
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, sx: scrollX, sy: scrollY, w: r.width, h: r.height,
               vw: innerWidth, vh: innerHeight, d: devicePixelRatio };
    })()`;
    await call('POST', '/page/evaluate', { script: rectScript });
    await sleep(1500); // let lazy images inside the element load after scrolling
    const r = (await call('POST', '/page/evaluate', { script: rectScript })).result;

    // Full page keeps tall elements whole; foxprofile refuses pages over 16384px, then use the viewport.
    let shot, x, y, w, h;
    try {
      shot = await call('GET', '/page/screenshot', null, { full_page: true, format: 'json' });
      [x, y, w, h] = [r.x + r.sx, r.y + r.sy, r.w, r.h];
    } catch (e) {
      shot = await call('GET', '/page/screenshot', null, { full_page: false, format: 'json' });
      x = Math.max(0, r.x);
      y = Math.max(0, r.y);
      w = Math.min(r.x + r.w, r.vw) - x;
      h = Math.min(r.y + r.h, r.vh) - y;
    }
    const px = (v) => Math.max(0, Math.round(v * r.d));
    const rect = { x: px(x), y: px(y), width: Math.max(1, px(w)), height: Math.max(1, px(h)) };
    return { selector, rect, png: Buffer.from(shot.png_base64, 'base64') };
  } finally {
    if (launched) await call('POST', '/stop').catch(() => {});
  }
}

// One browser per profile: foxprofile answers 409 to a second launch, so queue requests per profile.
const queues = new Map();
function enqueue(key, job) {
  const next = (queues.get(key) ?? Promise.resolve()).then(job, job);
  queues.set(key, next.catch(() => {}));
  return next;
}

// crop(pngBuffer, rect) -> pngBuffer; injected so this module runs outside Electron in tests.
async function handle(type, body, { api, token, screenshotDir, crop, defaultProfile = '', autoProfile = false }) {
  if (!TYPES[type]) throw Object.assign(new Error(`unknown type: ${type}`), { status: 404 });
  if (!/^https?:\/\//i.test(String(body.url ?? ''))) throw Object.assign(new Error('url must be http(s)'), { status: 400 });

  let profileId = body.profile_id || defaultProfile;
  if (!profileId && autoProfile) {
    profileId = await resolveProfileId({ api, token, type, profileId: '', defaultProfile });
  }
  if (!profileId) throw Object.assign(new Error('profile_id is required'), { status: 400 });

  const resolvedBody = { ...body, profile_id: profileId };
  const file = outputPath(screenshotDir, type, resolvedBody);

  stats.totalCaptures++;
  const tracker = recordJobStart({
    kind: 'screenshot',
    type,
    profile_id: profileId,
    url: String(body.url),
    source: String(body.source ?? ''),
  });

  try {
    const { rect, png } = await enqueue(profileId, () => shoot({ api, token, type, body: resolvedBody }));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, crop(png, rect));
    stats.totalSuccess++;
    recordJobEnd(tracker, 'success', { outputFile: file });
    return [{ outputFilePath: [file] }]; // same shape as the n8n Aggregate + Respond to Webhook
  } catch (e) {
    stats.totalFailed++;
    recordJobEnd(tracker, 'error', { error: e.message });
    throw e;
  }
}

// Export Facebook cookies (incl. httpOnly c_user & xs) from a stopped FoxProfile profile.
// Replaces legacy n8n-antidetect/setup/export_fb_cookie.json with identical response contract.
async function exportFbCookie(body, { api, token, defaultProfile = '', autoProfile = false }) {
  let profileId = body?.profile_id || defaultProfile;
  if (!profileId && autoProfile) {
    profileId = await resolveProfileId({
      api,
      token,
      type: 'fb',
      profileId: '',
      defaultProfile,
      autoCreateNews: false,
    });
  }
  if (!profileId) {
    return { ok: false, profile_id: '', error: 'profile_id is required' };
  }

  stats.totalCookieExports++;
  const tracker = recordJobStart({
    kind: 'cookie_export',
    type: 'fb_cookie',
    profile_id: profileId,
    url: 'https://www.facebook.com',
  });

  try {
    const result = await enqueue(profileId, async () => {
      // Ensure browser is stopped if FoxProfile requires stopped profile before SQLite cookie export
      const res = await fetch(`${api}/profiles/${encodeURIComponent(profileId)}/cookies?format=json`, {
        method: 'GET',
        headers: authHeaders(token),
        signal: AbortSignal.timeout(90000),
      });
      const text = await res.text();
      let parsed;
      try {
        parsed = text ? JSON.parse(text) : [];
      } catch {
        parsed = null;
      }
      if (!res.ok) {
        const detail = (parsed && (parsed.detail || parsed.error || parsed.message)) || text || `HTTP ${res.status}`;
        return { ok: false, profile_id: profileId, error: String(detail) };
      }
      const allCookies = Array.isArray(parsed) ? parsed : [];
      const fbCookies = allCookies.filter((c) => c && typeof c.domain === 'string' && /facebook\.com$/i.test(c.domain.replace(/^\./, '')));
      const jar = Object.fromEntries(fbCookies.map((c) => [c.name, c.value]));
      const missing = ['c_user', 'xs'].filter((k) => !jar[k]);
      if (missing.length > 0) {
        return {
          ok: false,
          profile_id: profileId,
          error: `missing cookies: ${missing.join(',')}`,
          total_cookies: fbCookies.length,
        };
      }
      return {
        ok: true,
        profile_id: profileId,
        c_user: String(jar.c_user),
        cookie: fbCookies.map((c) => `${c.name}=${c.value}`).join('; '),
        total_cookies: fbCookies.length,
      };
    });

    recordJobEnd(tracker, result.ok ? 'success' : 'error', result.ok ? { c_user: result.c_user } : { error: result.error });
    return result;
  } catch (e) {
    recordJobEnd(tracker, 'error', { error: e.message });
    return { ok: false, profile_id: profileId, error: e.message };
  }
}

module.exports = {
  handle,
  exportFbCookie,
  resolveProfileId,
  outputPath,
  getStats,
  resetStats,
  TYPES,
};
