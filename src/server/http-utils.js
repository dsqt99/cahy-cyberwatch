// HTTP parsing, CORS, loopback checks, FoxProfile status helpers, and log tailing.
const fs = require('fs');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
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

function isLoopbackAddress(remoteAddr) {
  return !remoteAddr || remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';
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
  } catch (err) {
    return { online: false, error: err.message, profilesCount: 0, runningCount: 0, profiles: [] };
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

module.exports = {
  readBody,
  parseBody,
  isAllowedLocalOrigin,
  isLoopbackAddress,
  foxHeaders,
  fetchFoxStatus,
  readLogTail,
};
