// Live telemetry store for Desktop Control Center & Dashboard Workflow Hub.
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

function getStats(queuedProfiles = []) {
  return {
    activeJobs: stats.activeJobs,
    queuedProfiles,
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

module.exports = {
  stats,
  recordJobStart,
  recordJobEnd,
  getStats,
  resetStats,
};
