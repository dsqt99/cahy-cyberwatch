// Local static HTTP server for the built React Dashboard (default 127.0.0.1:5690).
const fs = require('fs');
const http = require('http');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function startDashboardServer({ dashboardDir, port, appName, writeLog }) {
  return new Promise((resolve, reject) => {
    const server = http
      .createServer((req, res) => {
        const indexHtml = path.join(dashboardDir, 'index.html');
        if (!fs.existsSync(indexHtml)) {
          res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' });
          res.end(
            `<!doctype html><meta charset="utf-8"><title>${appName}</title>` +
              `<body style="font-family:sans-serif;padding:40px;background:#0f172a;color:#f8fafc;">` +
              `<h2>Chưa tìm thấy bản build Dashboard (${dashboardDir})</h2>` +
              `<p>Vui lòng chạy <code>npm run build:dashboard</code> trong thư mục ứng dụng.</p></body>`,
          );
          return;
        }

        let file;
        try {
          const cleanPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
          file = path.join(dashboardDir, cleanPath);
        } catch {}

        if (!file?.startsWith(dashboardDir + path.sep) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
          file = indexHtml;
        }
        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
      })
      .on('error', reject)
      .listen(port, '127.0.0.1', () => {
        writeLog(`dashboard served on http://localhost:${port}/`);
        resolve(server);
      });
  });
}

module.exports = { startDashboardServer };
