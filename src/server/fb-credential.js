// Facebook cookie export -> n8n facebookApiBotzvn credential sync (never logs or returns raw cookie).
const { exportFbCookie } = require('../capture');

const FB_CREDENTIAL_TYPE = 'facebookApiBotzvn';
const FB_CREDENTIAL_NAME = 'Facebook Credential account';
const FB_SESSION_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

// Last refresh outcome (manual or auto) for Settings UI; never holds the cookie.
let lastFbRefresh = null;

function getLastFbRefresh() {
  return lastFbRefresh;
}

async function writeFbCredential(cfg, body = {}) {
  const api = `http://127.0.0.1:${cfg.foxprofilePort}/api/v1`;
  const baseUrl = String(cfg.n8nUrl || '').replace(/\/+$/, '');
  const apiKey = String(cfg.n8nApiKey || '').trim();
  if (!baseUrl || !apiKey) return { ok: false, error: 'Chưa cấu hình n8nUrl / n8nApiKey' };

  const exported = await exportFbCookie(
    { profile_id: body.profile_id || cfg.fbCookieProfile || '' },
    { api, token: cfg.foxprofileToken, defaultProfile: cfg.defaultProfile || '', autoProfile: true },
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
  const cookies = Object.fromEntries(
    String(exported.cookie)
      .split(';')
      .map((p) => p.trim())
      .filter((p) => p.includes('='))
      .map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]),
  );
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

async function refreshFbCredential(cfg, body = {}) {
  let result;
  try {
    result = await writeFbCredential(cfg, body);
  } catch (err) {
    result = { ok: false, profile_id: body.profile_id || cfg.fbCookieProfile || '', error: err.message };
  }
  lastFbRefresh = {
    ok: result.ok,
    at: Date.now(),
    profile_id: result.profile_id || '',
    c_user: result.c_user || '',
    error: result.error || '',
    auto: Boolean(body.auto),
  };
  return result;
}

module.exports = {
  refreshFbCredential,
  writeFbCredential,
  getLastFbRefresh,
};
