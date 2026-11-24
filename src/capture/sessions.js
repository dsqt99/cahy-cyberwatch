// Per-profile execution queues, warm browser sessions, global concurrency gate, and anti-bot pacing.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function authHeaders(token) {
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

// One browser per profile: FoxProfile returns 409 on a second launch, so queue jobs per profile.
const queues = new Map();
function enqueue(key, job) {
  const next = (queues.get(key) ?? Promise.resolve()).then(job, job);
  queues.set(key, next.catch(() => {}));
  return next;
}

function getQueuedProfiles() {
  return Array.from(queues.keys());
}

// Browser sessions kept warm between jobs (key = profile_id) so batches avoid relaunching Camoufox.
const sessions = new Map();

function stopSession(key) {
  const session = sessions.get(key);
  if (!session) return Promise.resolve(false);
  clearTimeout(session.timer);
  sessions.delete(key);
  return fetch(`${session.api}/browser/${encodeURIComponent(key)}/stop`, {
    method: 'POST',
    headers: authHeaders(session.token),
    signal: AbortSignal.timeout(30000),
  }).then(() => true, () => true);
}

function keepSessionWarm(key, api, token, ms) {
  const prev = sessions.get(key);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => enqueue(key, () => stopSession(key)), ms);
  timer.unref?.();
  sessions.set(key, { api, token, timer });
}

async function stopAllSessions() {
  await Promise.all(Array.from(sessions.keys()).map((key) => enqueue(key, () => stopSession(key))));
}

// Global cap on simultaneously running capture jobs (max <= 0 = unlimited).
const gate = { active: 0, waiters: [] };
async function acquire(max) {
  if (!(max > 0)) return false;
  while (gate.active >= max) await new Promise((resolve) => gate.waiters.push(resolve));
  gate.active++;
  return true;
}

function release() {
  gate.active = Math.max(0, gate.active - 1);
  gate.waiters.shift()?.();
}

// Random pause between consecutive jobs on the same profile (Facebook/TikTok only).
const lastEnd = new Map();
async function pace(profileId, paced, jitterMs) {
  if (!paced || !jitterMs || !(jitterMs[1] > 0)) return;
  const last = lastEnd.get(profileId);
  if (!last) return;
  const gap = jitterMs[0] + Math.random() * Math.max(0, jitterMs[1] - jitterMs[0]);
  const wait = last + gap - Date.now();
  if (wait > 0) await sleep(wait);
}

function markJobFinished(profileId) {
  lastEnd.set(profileId, Date.now());
}

module.exports = {
  sleep,
  authHeaders,
  enqueue,
  getQueuedProfiles,
  sessions,
  stopSession,
  keepSessionWarm,
  stopAllSessions,
  acquire,
  release,
  pace,
  markJobFinished,
};
