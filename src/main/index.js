// CAHY CyberWatch — Electron Main Process Entrypoint.
// Re-launch if invoked from an IDE terminal with ELECTRON_RUN_AS_NODE=1.
if (process.env.ELECTRON_RUN_AS_NODE) {
  const { spawnSync } = require('child_process');
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const res = spawnSync(require('electron'), process.argv.slice(1), { stdio: 'inherit', env: cleanEnv });
  process.exit(res.status ?? 0);
}

const { app, nativeImage, dialog } = require('electron');
const path = require('path');
const { APP_META, loadConfig } = require('../config');
const { cleanupOldScreenshots, cropPng } = require('../capture');
const { createWebhookServer, refreshFbCredential } = require('../server');
const { createLogger } = require('./logger');
const { createFoxProfileManager } = require('./foxprofile');
const { startDashboardServer } = require('./dashboard-server');
const { createWindowManager } = require('./window-manager');
const { registerIpcHandlers } = require('./ipc');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const IS_SMOKE_TEST = process.argv.includes('--smoke-test');

// Portable exe unpacks to a temp dir; PORTABLE_EXECUTABLE_DIR is where the user put the .exe.
const APP_DIR = app.isPackaged
  ? process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath)
  : ROOT_DIR;
const CONFIG_FILE = path.join(APP_DIR, 'config.json');
const ICON_PATH = path.join(ROOT_DIR, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const DASHBOARD_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'dashboard')
  : path.join(ROOT_DIR, 'dashboard', 'dist');

let config = loadConfig(APP_DIR);
const getConfig = () => config;
const setConfig = (next) => {
  config = next;
};

const { logFile, logStream, writeLog } = createLogger(app.getPath('userData'));

let webhookOnline = false;
let windowManager = null;

const foxManager = createFoxProfileManager({
  getConfig,
  writeLog,
  logStream,
  onStateChange: () => windowManager?.broadcastShellState(),
  onReloadFoxView: () => windowManager?.loadFoxViewIfReady(false),
});

windowManager = createWindowManager({
  rootDir: ROOT_DIR,
  iconPath: ICON_PATH,
  appMeta: APP_META,
  isSmokeTest: IS_SMOKE_TEST,
  getConfig,
  getFoxState: () => foxManager.getState(),
  getWebhookOnline: () => webhookOnline,
  onRestartFox: () => foxManager.restart(),
  writeLog,
});

function startWebhookEngine() {
  const crop = (png, rect) => {
    try {
      return cropPng(png, rect);
    } catch {
      return nativeImage.createFromBuffer(png).crop(rect).toPNG();
    }
  };
  const server = createWebhookServer({
    getConfig,
    crop,
    writeLog,
    logFilePath: logFile,
    foxManager,
    windowController: {
      focus: ({ reload = false } = {}) => windowManager.bringToFront({ reloadDashboard: reload }),
      quit: () => {
        windowManager.setQuitting(true);
        app.quit();
      },
    },
    appMeta: { name: APP_META.name, version: APP_META.version },
  });

  return new Promise((resolve, reject) => {
    server
      .on('error', reject)
      .listen(config.webhookPort, config.webhookHost, () => {
        webhookOnline = true;
        writeLog(`webhooks & control API on http://${config.webhookHost}:${config.webhookPort}`);
        resolve(server);
      });
  });
}

function scheduleFbCookieRefresh() {
  const minutes = () => Number(config.fbCookieRefreshMinutes) || 0;
  const tick = async () => {
    if (minutes() > 0) {
      await refreshFbCredential(config, { auto: true })
        .then((r) =>
          writeLog(
            `${r.ok ? 'ok' : 'fail'} fb-cookie-refresh(auto) profile=${r.profile_id || ''} ${
              r.ok ? `c_user=${r.c_user} credential=${r.credential_id}` : r.error
            }`,
          ),
        )
        .catch((err) => writeLog(`fail fb-cookie-refresh(auto) ${err.message}`));
    }
    setTimeout(tick, (minutes() || 5) * 60000).unref();
  };
  tick();
}

registerIpcHandlers({
  appMeta: APP_META,
  configFile: CONFIG_FILE,
  getConfig,
  setConfig,
  windowManager,
  foxManager,
  writeLog,
});

// Google refuses sign-in from user agents that mention Electron or custom app tokens.
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|screenshot-app|cahy-cyberwatch)\/\S+/gi, '');

if (!IS_SMOKE_TEST && !app.requestSingleInstanceLock()) {
  console.log('[CAHY CyberWatch] Ứng dụng đang chạy sẵn - đã chuyển tiêu điểm sang cửa sổ chính.');
  app.exit(0);
} else {
  app.on('second-instance', () => windowManager.bringToFront());

  app.whenReady().then(async () => {
    try {
      await Promise.all([
        startDashboardServer({
          dashboardDir: DASHBOARD_DIR,
          port: config.dashboardPort,
          appName: APP_META.name,
          writeLog,
        }),
        startWebhookEngine(),
      ]);

      windowManager.createMainWindow();
      if (!IS_SMOKE_TEST) windowManager.setupTray();

      foxManager.startOrAttach(30000).then((res) => {
        if (res.ok) windowManager.loadFoxViewIfReady(true);
        if (res.ok && !IS_SMOKE_TEST) scheduleFbCookieRefresh();
      });

      const pollTimer = setInterval(async () => {
        await foxManager.probe();
        windowManager.broadcastShellState();
      }, 6000);
      pollTimer.unref?.();

      const sweep = () => {
        try {
          const removed = cleanupOldScreenshots(config.screenshotDir, config.screenshotRetentionDays);
          if (removed) writeLog(`retention: removed ${removed} screenshot(s) older than ${config.screenshotRetentionDays}d`);
        } catch (err) {
          writeLog(`retention error: ${err.message}`);
        }
      };
      sweep();
      setInterval(sweep, 24 * 3600 * 1000).unref?.();

      if (config.webhookHost !== '127.0.0.1' && config.webhookHost !== 'localhost' && !config.webhookToken) {
        writeLog('WARNING: webhookHost is exposed beyond loopback but webhookToken is empty');
      }

      if (IS_SMOKE_TEST) {
        const [healthRes, dashRes] = await Promise.all([
          fetch(`http://127.0.0.1:${config.webhookPort}/webhook/health`),
          fetch(`http://127.0.0.1:${config.dashboardPort}/`),
        ]);
        const health = await healthRes.json();
        console.log(
          JSON.stringify({
            smokeTest: 'PASS',
            app: APP_META.name,
            version: APP_META.version,
            webhookStatus: healthRes.status,
            dashboardStatus: dashRes.status,
            healthApp: health.app,
          }),
        );
        windowManager.setQuitting(true);
        setTimeout(() => app.quit(), 400);
      }
    } catch (err) {
      writeLog(`fatal startup error: ${err.message}`);
      if (IS_SMOKE_TEST) {
        console.error('SMOKE_TEST_FAIL:', err.message);
        process.exit(1);
      }
      dialog.showErrorBox(APP_META.name, `Không thể khởi tạo cổng dịch vụ cục bộ:\n${err.message}`);
      windowManager.setQuitting(true);
      app.quit();
    }
  });
}

app.on('before-quit', () => windowManager.setQuitting(true));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => foxManager.stopSpawned());
