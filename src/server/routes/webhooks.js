// Webhook & screenshot preview routes (/webhook/* and /screenshots/*).
const fs = require('fs');
const path = require('path');
const { handle, exportFbCookie, getStats } = require('../../capture');
const { parseBody, fetchFoxStatus } = require('../http-utils');

async function handleWebhookRoutes(ctx) {
  const { req, res, url, pathname, cfg, api, crop, writeLog, appMeta, corsHeaders, send } = ctx;

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
        keepAliveMs: Math.max(0, Number(cfg.browserIdleSeconds ?? 120)) * 1000,
        retries: Math.max(0, Number(cfg.captureRetries ?? 1)),
        jitterMs: [
          Math.max(0, Number(cfg.captureJitterMinSeconds ?? 2)) * 1000,
          Math.max(0, Number(cfg.captureJitterMaxSeconds ?? 6)) * 1000,
        ],
        maxConcurrent: Number(cfg.maxConcurrentBrowsers ?? 3),
      });
      const savedPath = out[0].outputFilePath[0];
      const rel = path.relative(path.resolve(cfg.screenshotDir), path.resolve(savedPath)).replace(/\\/g, '/');
      writeLog(`ok screenshot_${type} profile=${body.profile_id || cfg.defaultProfile || 'auto'} file=${savedPath}`);
      if (url.searchParams.get('include_preview') === '1') {
        send(200, [
          {
            outputFilePath: [savedPath],
            previewUrl: `http://127.0.0.1:${cfg.webhookPort}/screenshots/${encodeURI(rel)}`,
          },
        ]);
        return true;
      }
      send(200, out);
      return true;
    } catch (err) {
      writeLog(`fail screenshot_${type} ${err.message}`);
      send(err.status || 500, { error: err.message });
      return true;
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
      writeLog(
        `${result.ok ? 'ok' : 'fail'} export_fb_cookie profile=${result.profile_id} ${
          result.ok ? `c_user=${result.c_user}` : result.error
        }`,
      );
      send(200, result);
      return true;
    } catch (err) {
      writeLog(`fail export_fb_cookie ${err.message}`);
      send(500, { ok: false, error: err.message });
      return true;
    }
  }

  // 3. Webhook Health probe: /webhook/health
  if (pathname === '/webhook/health') {
    const fox = await fetchFoxStatus(api, cfg.foxprofileToken);
    send(200, {
      ok: true,
      app: appMeta.name,
      version: appMeta.version,
      timestamp: new Date().toISOString(),
      foxprofile: { online: fox.online, profilesCount: fox.profilesCount, runningCount: fox.runningCount },
      stats: getStats(),
    });
    return true;
  }

  // 4. Local Screenshot static preview: /screenshots/<subpath>
  if (pathname.startsWith('/screenshots/') && req.method === 'GET') {
    const baseDir = path.resolve(cfg.screenshotDir);
    const subPath = pathname.slice('/screenshots/'.length);
    const target = path.resolve(baseDir, subPath);
    if (!target.startsWith(baseDir + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      send(404, { error: 'screenshot not found' });
      return true;
    }
    const ext = path.extname(target).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.webp'
            ? 'image/webp'
            : 'application/octet-stream';
    res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-cache', ...corsHeaders });
    fs.createReadStream(target).pipe(res);
    return true;
  }

  return false;
}

module.exports = { handleWebhookRoutes };
