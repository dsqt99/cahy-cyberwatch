// Shared HTTP response, body parsing, CORS, and channel mapping utilities.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CAHY-User, X-CAHY-Role, X-CAHY-Client',
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function mapChannel(ch) {
  if (!ch || ch === 'all') return null;
  if (ch === 'ANTT') return 'ANTT';
  if (ch === 'Phản Động' || ch === 'PhanDong') return 'PhanDong';
  return ch;
}

module.exports = { CORS_HEADERS, sendJson, readJsonBody, mapChannel };
