// Headless agent: runs the webhook + evidence engine WITHOUT Electron (plain Node, low RAM).
// Use on a server / background service; FoxProfile must already be running (config.foxprofilePort).
//   npm run agent
const path = require('path');
const { loadConfig } = require('../config');
const { createWebhookServer } = require('../server');
const { cleanupOldScreenshots, stopAllSessions, cropPng } = require('../capture');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const config = loadConfig(ROOT_DIR, { headed: false });
const log = (line) => console.log(`${new Date().toISOString()} ${line}`);

if (!['127.0.0.1', 'localhost'].includes(config.webhookHost) && !config.webhookToken) {
  console.error('Refusing to start: webhookHost is exposed but webhookToken is empty.');
  process.exit(1);
}

const server = createWebhookServer({ getConfig: () => config, crop: cropPng, writeLog: log });
server.listen(config.webhookPort, config.webhookHost, () =>
  log(`CAHY agent listening on http://${config.webhookHost}:${config.webhookPort}`),
);

const sweep = () => {
  const removed = cleanupOldScreenshots(config.screenshotDir, config.screenshotRetentionDays);
  if (removed) log(`retention: removed ${removed} file(s)`);
};
sweep();
setInterval(sweep, 24 * 3600 * 1000).unref();

const shutdown = async () => {
  await stopAllSessions().catch(() => {});
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
