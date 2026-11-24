// Local Webhook & Desktop Operations HTTP Server (default 127.0.0.1:5680).
const http = require('http');
const { parseBody, isAllowedLocalOrigin, isLoopbackAddress } = require('./http-utils');
const { refreshFbCredential } = require('./fb-credential');
const { handleWebhookRoutes } = require('./routes/webhooks');
const { handleDesktopRoutes } = require('./routes/desktop');

function createWebhookServer({
  getConfig,
  crop,
  writeLog = () => {},
  logFilePath = '',
  foxManager = null,
  windowController = null,
  appMeta = { name: 'CAHY CyberWatch', version: '2.0.0' },
}) {
  return http.createServer(async (req, res) => {
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

    // Security gates: /api/desktop/* is loopback-only (or needs webhookToken);
    // /webhook/* (except health) requires webhookToken when configured.
    const loopback = isLoopbackAddress(req.socket?.remoteAddress || '');
    const expectedToken = String(cfg.webhookToken || '').trim();
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const givenToken = String(req.headers['x-cahy-token'] || bearer || url.searchParams.get('token') || '');
    const tokenOk = Boolean(expectedToken) && givenToken === expectedToken;

    if (pathname.startsWith('/api/desktop/') && !loopback && !tokenOk) {
      return send(403, { ok: false, error: 'loopback or token required' });
    }
    if (pathname.startsWith('/webhook/') && pathname !== '/webhook/health' && expectedToken && !tokenOk) {
      return send(401, { ok: false, error: 'invalid or missing webhook token' });
    }
    if (pathname.startsWith('/screenshots/') && !loopback && expectedToken && !tokenOk) {
      return send(401, { ok: false, error: 'invalid or missing webhook token' });
    }

    const ctx = {
      req,
      res,
      url,
      pathname,
      cfg,
      api,
      crop,
      writeLog,
      logFilePath,
      foxManager,
      windowController,
      appMeta,
      corsHeaders,
      send,
    };

    if (await handleWebhookRoutes(ctx)) return;
    if (await handleDesktopRoutes(ctx)) return;

    return send(404, { error: 'not found' });
  });
}

module.exports = {
  createWebhookServer,
  parseBody,
  isAllowedLocalOrigin,
  refreshFbCredential,
};
