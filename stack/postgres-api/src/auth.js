// HMAC-SHA256 bearer token signing & verification.
const crypto = require('node:crypto');
const { TOKEN_SECRET } = require('./config');

function signToken(payload) {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 86400000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

module.exports = { signToken, verifyToken };
