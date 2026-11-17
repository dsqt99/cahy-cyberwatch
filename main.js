// CAHY CyberWatch — All-in-One Social Monitoring & Operations Desktop Application
// Integrates:
//  1. Social Tracking & n8n Operations Dashboard (http://localhost:5690)
//  2. FoxProfile Antidetect Browser Manager (http://127.0.0.1:8010)
//  3. n8n Workflow Studio (http://localhost:5678 or remote)
//  4. Local Screenshot & Cookie Webhook Engine (http://127.0.0.1:5680/webhook/*)
//  5. Unified RBAC Login Gate & Workstation Control Center
// If launched from an Electron-based IDE terminal that sets ELECTRON_RUN_AS_NODE=1,
// re-launch with ELECTRON_RUN_AS_NODE removed so Electron initializes its main-process runtime.
if (process.env.ELECTRON_RUN_AS_NODE) {
  const { spawnSync } = require('child_process');
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const res = spawnSync(require('electron'), process.argv.slice(1), { stdio: 'inherit', env: cleanEnv });
  process.exit(res.status ?? 0);
}

const {
  app,
  BaseWindow,
  WebContentsView,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  dialog,
  shell,
} = require('electron');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { getStats } = require('./capture');
const { createWebhookServer, refreshFbCredential } = require('./server');

const APP_META = {
  name: 'CAHY CyberWatch',
  fullTitle: 'CAHY CyberWatch - Hệ thống Giám sát & Điều hành Không gian mạng',
  version: '2.0.0',
};

const TOPBAR_HEIGHT = 46;
const IS_SMOKE_TEST = process.argv.includes('--smoke-test');

// Portable exe unpacks to a temp dir; PORTABLE_EXECUTABLE_DIR is where the user put the .exe.
const APP_DIR = app.isPackaged
  ? process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath)
  : __dirname;
const CONFIG_FILE = path.join(APP_DIR, 'config.json');
const ICON_PATH = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

const DEFAULT_CONFIG = {
  // bundled copy in the repo; config.json may override (relative paths resolve against APP_DIR)
  foxprofileDir: path.join(APP_DIR, 'foxprofile'),
  foxprofilePort: 8010,
  foxprofileToken: '',
  headed: true,
  webhookHost: '127.0.0.1',
  webhookPort: 5680,
  screenshotDir: path.join(APP_DIR, 'screenshots'),
  defaultProfile: '',
  dashboardPort: 5690,
  n8nUrl: 'http://localhost:5678',
  n8nWebhookBase: 'http://localhost:5678/webhook/',
  n8nApiKey: '',
  desktopOperatorPasscode: '',
  operatorEmail: 'admin@cahy.gov.vn',
  minimizeToTray: true,
  fbCookieProfile: '',
  fbCookieRefreshMinutes: 360,
  fbSessionUserAgent: '',
};

function loadConfig() {
  let disk = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      disk = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {
      console.error('Invalid config.json:', e.message);
    }
  }
  const merged = { ...DEFAULT_CONFIG, ...disk };
  for (const k of ['foxprofileDir', 'screenshotDir']) {
    if (merged[k]) merged[k] = path.resolve(APP_DIR, merged[k]);
  }
  if (!merged.n8nWebhookBase && merged.n8nUrl) {
    merged.n8nWebhookBase = `${String(merged.n8nUrl).replace(/\/+$/, '')}/webhook/`;
  }
  return merged;
}

let config = loadConfig();

const LOG_FILE = path.join(app.getPath('userData'), 'app.log');
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
const writeLog = (line) => {
  const formatted = `${new Date().toISOString()} ${line}\n`;
  logStream.write(formatted);
};

// ===== FoxProfile Resilient Process Manager =====
const foxState = {
  mode: 'stopped', // 'stopped' | 'starting' | 'spawned' | 'external' | 'error'
  online: false,
  profilesCount: 0,
  runningCount: 0,
  lastError: '',
  pid: null,
};
let foxProc = null;

function foxApiBase() {
  return `http://127.0.0.1:${config.foxprofilePort}/api/v1`;
}

async function probeFoxprofile() {
  const headers = config.foxprofileToken ? { authorization: `Bearer ${config.foxprofileToken}` } : {};
  try {
    const res = await fetch(`${foxApiBase()}/profiles`, {
      headers,
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) {
      foxState.online = false;
      return false;
    }
    const data = await res.json().catch(() => ({}));
    const list = Array.isArray(data.profiles) ? data.profiles : [];
    foxState.online = true;
    foxState.profilesCount = list.length;
    foxState.runningCount = list.filter((p) => p && (p.is_running || p.running)).length;
    foxState.lastError = '';
    return true;
  } catch {
    foxState.online = false;
    return false;
  }
}

function stopSpawnedFoxprofile() {
  if (foxProc?.pid) {
    try {
      spawnSync('taskkill', ['/pid', String(foxProc.pid), '/T', '/F'], { windowsHide: true });
    } catch {}
    foxProc = null;
    foxState.pid = null;
  }
}

async function isFoxprofileTokenlessOnPort() {
  if (!config.foxprofileToken) return false;
  try {
    const res = await fetch(`${foxApiBase()}/info`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const info = await res.json().catch(() => ({}));
    return info?.name === 'FoxProfile' && info?.auth_required === false;
  } catch {
    return false;
  }
}

function stopExternalTokenlessFoxprofile() {
  try {
    const cmd = `Get-NetTCPConnection -LocalPort ${Number(config.foxprofilePort)} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`;
    spawnSync('powershell', ['-NoProfile', '-Command', cmd], { windowsHide: true });
    writeLog(`stopped external token-less FoxProfile on port ${config.foxprofilePort} to respawn with FOXPROFILE_API_TOKEN`);
  } catch {}
}

async function startOrAttachFoxprofile(waitMs = 25000) {
  // 1. If FoxProfile is already running on foxprofilePort, ensure it has FOXPROFILE_API_TOKEN enabled when configured
  if (await probeFoxprofile()) {
    if (!foxProc && (await isFoxprofileTokenlessOnPort())) {
      stopExternalTokenlessFoxprofile();
      foxState.online = false;
      await new Promise((r) => setTimeout(r, 800));
    } else {
      if (!foxProc) foxState.mode = 'external';
      writeLog(`foxprofile online (${foxState.mode}) on port ${config.foxprofilePort}`);
      broadcastShellState();
      return { ok: true, state: { ...foxState } };
    }
  }

  const python = path.join(config.foxprofileDir, '.venv', 'Scripts', 'python.exe');
  if (!fs.existsSync(python)) {
    foxState.mode = 'error';
    foxState.online = false;
    foxState.lastError = `Không tìm thấy Python venv của FoxProfile tại: ${python}`;
    writeLog(`foxprofile missing: ${python}`);
    broadcastShellState();
    return { ok: false, error: foxState.lastError, state: { ...foxState } };
  }

  foxState.mode = 'starting';
  broadcastShellState();

  try {
    foxProc = spawn(
      python,
      ['-m', 'src.server', '--port', String(config.foxprofilePort), ...(config.headed ? ['--headed'] : [])],
      {
        cwd: config.foxprofileDir,
        env: {
          ...process.env,
          FOXPROFILE_RESTORE_TABS: 'false',
          ...(config.foxprofileToken && { FOXPROFILE_API_TOKEN: config.foxprofileToken }),
        },
        windowsHide: true,
      },
    );
    foxState.pid = foxProc.pid;
    foxProc.stdout.on('data', (d) => logStream.write(d));
    foxProc.stderr.on('data', (d) => logStream.write(d));
    foxProc.on('exit', (code) => {
      writeLog(`foxprofile exited: ${code}`);
      if (foxState.pid === foxProc?.pid) {
        foxProc = null;
        foxState.pid = null;
        foxState.online = false;
        foxState.mode = 'stopped';
        broadcastShellState();
      }
    });
  } catch (e) {
    foxState.mode = 'error';
    foxState.lastError = e.message;
    writeLog(`foxprofile spawn error: ${e.message}`);
    broadcastShellState();
    return { ok: false, error: e.message, state: { ...foxState } };
  }

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (await probeFoxprofile()) {
      foxState.mode = 'spawned';
      writeLog(`foxprofile ready (pid=${foxState.pid}) on port ${config.foxprofilePort}`);
      broadcastShellState();
      return { ok: true, state: { ...foxState } };
    }
    if (!foxProc) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  foxState.mode = 'error';
  foxState.lastError = `FoxProfile không phản hồi trên cổng ${config.foxprofilePort} sau ${Math.round(waitMs / 1000)}s`;
  broadcastShellState();
  return { ok: false, error: foxState.lastError, state: { ...foxState } };
}

const foxManager = {
  getState: () => ({ ...foxState }),
  restart: async () => {
    stopSpawnedFoxprofile();
    const res = await startOrAttachFoxprofile(30000);
    if (!res.ok) throw new Error(res.error);
    if (views.foxprofile && activeTab === 'foxprofile') {
      views.foxprofile.webContents.loadURL(`http://127.0.0.1:${config.foxprofilePort}/`);
    }
    return res.state;
  },
};

// ===== Dashboard Static HTTP Server (127.0.0.1:5690) =====
const DASHBOARD_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'dashboard')
  : path.join(__dirname, 'dashboard', 'dist');

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

let dashboardServer = null;
function startDashboardServer() {
  return new Promise((resolve, reject) => {
    dashboardServer = http
      .createServer((req, res) => {
        const indexHtml = path.join(DASHBOARD_DIR, 'index.html');
        if (!fs.existsSync(indexHtml)) {
          res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' });
          res.end(
            `<!doctype html><meta charset="utf-8"><title>${APP_META.name}</title>` +
              `<body style="font-family:sans-serif;padding:40px;background:#0f172a;color:#f8fafc;">` +
              `<h2>Chưa tìm thấy bản build Dashboard (${DASHBOARD_DIR})</h2>` +
              `<p>Vui lòng chạy <code>npm run build:dashboard</code> trong thư mục ứng dụng.</p></body>`,
          );
          return;
        }

        let file;
        try {
          const cleanPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
          file = path.join(DASHBOARD_DIR, cleanPath);
        } catch {}

        if (!file?.startsWith(DASHBOARD_DIR + path.sep) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
          file = indexHtml;
        }
        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
      })
      .on('error', reject)
      .listen(config.dashboardPort, '127.0.0.1', () => {
        writeLog(`dashboard served on http://localhost:${config.dashboardPort}/`);
        resolve();
      });
  });
}

// ===== Webhook & Control HTTP Server (127.0.0.1:5680) =====
let webhookServer = null;
let webhookOnline = false;
function startWebhookEngine() {
  const crop = (png, rect) => nativeImage.createFromBuffer(png).crop(rect).toPNG();
  webhookServer = createWebhookServer({
    getConfig: () => config,
    crop,
    writeLog,
    logFilePath: LOG_FILE,
    foxManager,
    windowController: {
      focus: ({ reload = false } = {}) => bringMainWindowToFront({ reloadDashboard: reload }),
      quit: () => {
        isQuitting = true;
        app.quit();
      },
    },
    appMeta: { name: APP_META.name, version: APP_META.version },
  });
  return new Promise((resolve, reject) => {
    webhookServer
      .on('error', reject)
      .listen(config.webhookPort, config.webhookHost, () => {
        webhookOnline = true;
        writeLog(`webhooks & control API on http://${config.webhookHost}:${config.webhookPort}`);
        resolve();
      });
  });
}

// Keep the n8n facebookApiBotzvn credential fresh from a logged-in, stopped FoxProfile profile.
// Re-reads fbCookieRefreshMinutes each tick so a change in Settings applies without restart; 0 pauses.
function scheduleFbCookieRefresh() {
  const minutes = () => Number(config.fbCookieRefreshMinutes) || 0;
  const tick = async () => {
    if (minutes() > 0) {
      await refreshFbCredential(config, { auto: true })
        .then((r) => writeLog(`${r.ok ? 'ok' : 'fail'} fb-cookie-refresh(auto) profile=${r.profile_id || ''} ${r.ok ? `c_user=${r.c_user} credential=${r.credential_id}` : r.error}`))
        .catch((e) => writeLog(`fail fb-cookie-refresh(auto) ${e.message}`));
    }
    setTimeout(tick, (minutes() || 5) * 60000).unref();
  };
  tick();
}

// ===== Window, Shell Chrome, Auth Gate & System Tray =====
let mainWindow = null;
let topbarView = null;
let tray = null;
let isQuitting = false;
const views = {};
let activeTab = 'dashboard';
let n8nLoaded = false;
let topbarMenuOpen = false;

let authState = {
  authenticated: false,
  email: '',
  fullName: '',
  role: 'guest', // 'admin' | 'guest'
  provider: '',
};

function canAccessTab(tabId) {
  if (tabId === 'dashboard') return true;
  if (authState.authenticated && authState.role === 'admin') return true;
  // Rescue mode: allow opening workstation settings if FoxProfile is offline before login
  if (tabId === 'settings' && !foxState.online) return true;
  return false;
}

function getShellState() {
  const cs = getStats();
  return {
    app: APP_META,
    activeTab,
    auth: { ...authState },
    allowRescueSettings: !foxState.online,
    foxprofile: { ...foxState },
    webhook: {
      online: webhookOnline,
      port: config.webhookPort,
      activeJobs: cs.activeJobs,
      totalSuccess: cs.totalSuccess,
    },
    n8nUrl: config.n8nUrl,
    theme: config.theme === 'light' ? 'light' : 'dark',
  };
}

function broadcastShellState() {
  layoutViews(); // topbar visibility depends on auth state
  if (topbarView && !topbarView.webContents.isDestroyed()) {
    topbarView.webContents.send('shell:state-updated', getShellState());
  }
}

function attachExternalLinkHandler(wc) {
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function layoutViews() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { width, height } = mainWindow.getContentBounds();
  // Login screen is full-bleed: no topbar until signed in (settings rescue keeps it for the way back)
  const showBar = Boolean(authState.authenticated) || activeTab !== 'dashboard';
  const barH = showBar ? TOPBAR_HEIGHT : 0;
  if (topbarView) {
    topbarView.setVisible(showBar);
    // While the account menu is open the topbar view covers the window so the dropdown is not clipped
    topbarView.setBounds({ x: 0, y: 0, width, height: topbarMenuOpen ? height : TOPBAR_HEIGHT });
  }
  const currentView = views[activeTab];
  if (currentView) {
    currentView.setBounds({
      x: 0,
      y: barH,
      width,
      height: Math.max(100, height - barH),
    });
  }
}

function bringMainWindowToFront({ reloadDashboard = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  // Temporarily elevate top-most state so Windows brings the app above terminal/IDE windows
  mainWindow.setAlwaysOnTop(true);
  mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop?.();
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(false);
    }
  }, 180);
  if (reloadDashboard && views.dashboard && !views.dashboard.webContents.isDestroyed()) {
    views.dashboard.webContents.reloadIgnoringCache();
  }
  return true;
}

function switchTab(tabId) {
  if (!views[tabId] || !canAccessTab(tabId)) return false;

  if (tabId === 'foxprofile') {
    const currentUrl = views.foxprofile.webContents.getURL();
    const targetFoxUrl = `http://127.0.0.1:${config.foxprofilePort}/`;
    if (foxState.online && !currentUrl.startsWith(targetFoxUrl)) {
      views.foxprofile.webContents.loadURL(targetFoxUrl);
    } else if (!foxState.online && !currentUrl.endsWith('fox-offline.html')) {
      views.foxprofile.webContents.loadFile(path.join(__dirname, 'shell', 'fox-offline.html'));
    }
  }

  if (tabId === 'n8n' && !n8nLoaded) {
    n8nLoaded = true;
    views.n8n.webContents.loadURL(config.n8nUrl);
  }

  activeTab = tabId;
  mainWindow.contentView.children.forEach((child) => {
    if (child !== topbarView) mainWindow.contentView.removeChildView(child);
  });
  mainWindow.contentView.addChildView(views[tabId]);
  layoutViews();
  broadcastShellState();
  return true;
}

function createMainWindow() {
  const iconImg = fs.existsSync(ICON_PATH) ? nativeImage.createFromPath(ICON_PATH) : undefined;

  mainWindow = new BaseWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 700,
    title: APP_META.fullTitle,
    icon: iconImg,
  });

  // Top Command Bar
  topbarView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload', 'shell-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  topbarView.setBackgroundColor('#00000000');
  topbarView.webContents.loadFile(path.join(__dirname, 'shell', 'topbar.html'));
  mainWindow.contentView.addChildView(topbarView);

  // 1. Dashboard Workspace (with SSO & Control preload bridge)
  views.dashboard = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload', 'dashboard-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  views.dashboard.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    writeLog('[Dashboard Console ' + level + '] ' + message + ' (' + sourceId + ':' + line + ')');
  });
  views.dashboard.webContents.on('did-fail-load', (_e, code, desc, url) => {
    writeLog('[Dashboard Fail] ' + code + ' ' + desc + ' ' + url);
  });
  attachExternalLinkHandler(views.dashboard.webContents);
  views.dashboard.webContents.loadURL(`http://localhost:${config.dashboardPort}/`);

  // 2. FoxProfile Antidetect Workspace
  views.foxprofile = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload', 'shell-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachExternalLinkHandler(views.foxprofile.webContents);
  views.foxprofile.webContents.on('dom-ready', () => {
    const currentUrl = views.foxprofile.webContents.getURL();
    if (config.foxprofileToken && currentUrl.startsWith(`http://127.0.0.1:${config.foxprofilePort}`)) {
      const tokJson = JSON.stringify(String(config.foxprofileToken));
      views.foxprofile.webContents
        .executeJavaScript(
          `try { if (localStorage.getItem('foxprofile.token') !== ${tokJson}) { localStorage.setItem('foxprofile.token', ${tokJson}); location.reload(); } } catch {}`,
        )
        .catch(() => {});
    }
  });
  views.foxprofile.webContents.loadFile(path.join(__dirname, 'shell', 'fox-offline.html'));

  // 3. n8n Workflow Studio Workspace
  views.n8n = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachExternalLinkHandler(views.n8n.webContents);

  // 4. Native Workstation Management & Config Workspace
  views.settings = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload', 'shell-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachExternalLinkHandler(views.settings.webContents);
  views.settings.webContents.loadFile(path.join(__dirname, 'shell', 'settings.html'));

  mainWindow.on('resize', layoutViews);
  mainWindow.on('close', (e) => {
    if (!isQuitting && config.minimizeToTray !== false && tray && !IS_SMOKE_TEST) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Clean keyboard accelerators without bulky visible menu bar
  const accelMenu = Menu.buildFromTemplate([
    {
      label: 'CAHY CyberWatch',
      submenu: [
        { label: 'Giám sát & Điều hành', accelerator: 'CmdOrCtrl+1', click: () => switchTab('dashboard') },
        { label: 'Tài khoản Antidetect', accelerator: 'CmdOrCtrl+2', click: () => switchTab('foxprofile') },
        { label: 'n8n Studio', accelerator: 'CmdOrCtrl+3', click: () => switchTab('n8n') },
        { label: 'Quản trị Trạm', accelerator: 'CmdOrCtrl+4', click: () => switchTab('settings') },
        { type: 'separator' },
        { label: 'Tải lại', accelerator: 'F5', click: () => views[activeTab]?.webContents.reload() },
        { label: 'DevTools', accelerator: 'F12', click: () => views[activeTab]?.webContents.toggleDevTools() },
        { type: 'separator' },
        {
          label: 'Thoát hoàn toàn',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(accelMenu);
  mainWindow.setMenuBarVisibility(false);

  switchTab('dashboard');
}

function setupTray() {
  if (!fs.existsSync(ICON_PATH)) return;
  try {
    const icon = nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip(`${APP_META.name} - Webhook :${config.webhookPort}`);
    const rebuildTrayMenu = () => {
      tray.setContextMenu(
        Menu.buildFromTemplate([
          {
            label: 'Mở CAHY CyberWatch',
            click: () => {
              bringMainWindowToFront();
            },
          },
          { type: 'separator' },
          {
            label: 'Trung tâm Giám sát (Dashboard)',
            click: () => {
              bringMainWindowToFront();
              switchTab('dashboard');
            },
          },
          {
            label: 'Quản trị Trạm & Cấu hình',
            click: () => {
              bringMainWindowToFront();
              switchTab('settings');
            },
          },
          {
            label: 'Khởi động lại FoxProfile',
            click: () => {
              foxManager.restart().catch((err) => writeLog(`tray restart fox failed: ${err.message}`));
            },
          },
          { type: 'separator' },
          {
            label: 'Thoát hoàn toàn (Dừng Webhook)',
            click: () => {
              isQuitting = true;
              app.quit();
            },
          },
        ]),
      );
    };
    rebuildTrayMenu();
    tray.on('double-click', () => {
      bringMainWindowToFront();
    });
  } catch (e) {
    writeLog(`tray setup skipped: ${e.message}`);
  }
}

// ===== IPC Handlers =====
ipcMain.handle('shell:get-state', () => getShellState());

ipcMain.handle('shell:switch-tab', (_e, tabId) => switchTab(String(tabId)));

ipcMain.handle('shell:nav-action', (_e, action) => {
  const wc = views[activeTab]?.webContents;
  if (!wc) return;
  if (action === 'back' && wc.navigationHistory?.canGoBack()) wc.navigationHistory.goBack();
  else if (action === 'forward' && wc.navigationHistory?.canGoForward()) wc.navigationHistory.goForward();
  else if (action === 'reload') wc.reload();
  else if (action === 'external') {
    const url = wc.getURL();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  }
});

ipcMain.handle('shell:logout', () => {
  authState = { authenticated: false, email: '', fullName: '', role: 'guest', provider: '' };
  activeTab = 'dashboard';
  switchTab('dashboard');
  if (views.dashboard && !views.dashboard.webContents.isDestroyed()) {
    views.dashboard.webContents.send('desktop:force-logout');
  }
  broadcastShellState();
  return { ok: true };
});

ipcMain.handle('shell:set-menu-open', (_e, open) => {
  topbarMenuOpen = Boolean(open);
  // Re-adding moves the topbar above the active workspace view
  if (topbarMenuOpen && mainWindow && !mainWindow.isDestroyed()) mainWindow.contentView.addChildView(topbarView);
  layoutViews();
  return { ok: true };
});

ipcMain.handle('shell:set-theme', (_e, theme) => {
  config.theme = theme === 'light' ? 'light' : 'dark';
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  for (const view of [views.dashboard, views.settings]) {
    if (view && !view.webContents.isDestroyed()) view.webContents.send('desktop:theme-changed', config.theme);
  }
  broadcastShellState();
  return { ok: true, theme: config.theme };
});

ipcMain.handle('desktop:get-theme', () => (config.theme === 'light' ? 'light' : 'dark'));

ipcMain.handle('shell:get-config', () => ({ ...config }));

ipcMain.handle('shell:save-config', (_e, partial) => {
  const prevN8n = config.n8nUrl;
  config = { ...config, ...partial };
  if (config.n8nUrl && (!partial.n8nWebhookBase || config.n8nUrl !== prevN8n)) {
    config.n8nWebhookBase = `${String(config.n8nUrl).replace(/\/+$/, '')}/webhook/`;
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  if (config.n8nUrl !== prevN8n) n8nLoaded = false;
  writeLog(`config updated: ${CONFIG_FILE}`);
  broadcastShellState();
  return { ok: true, config };
});

ipcMain.handle('shell:pick-directory', async (_e, defaultPath) => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    defaultPath: defaultPath && fs.existsSync(defaultPath) ? defaultPath : undefined,
    properties: ['openDirectory', 'createDirectory'],
  });
  return res.canceled ? null : res.filePaths[0] || null;
});

ipcMain.handle('shell:open-path', (_e, targetPath) => {
  if (!targetPath) return false;
  fs.mkdirSync(path.extname(targetPath) ? path.dirname(targetPath) : targetPath, { recursive: true });
  shell.openPath(targetPath);
  return true;
});

ipcMain.handle('shell:restart-foxprofile', async () => {
  try {
    const state = await foxManager.restart();
    return { ok: true, state };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Dashboard <-> Desktop SSO & Runtime Bridge
ipcMain.handle('desktop:get-runtime-info', () => ({
  appName: APP_META.name,
  version: APP_META.version,
  webhookBaseUrl: `http://127.0.0.1:${config.webhookPort}`,
  foxprofileUrl: `http://127.0.0.1:${config.foxprofilePort}`,
  n8nUrl: config.n8nUrl,
  n8nWebhookBase: config.n8nWebhookBase,
  hasOperatorPasscode: Boolean(config.desktopOperatorPasscode),
}));

ipcMain.handle('desktop:sync-auth', (_e, session) => {
  if (session && session.authenticated) {
    authState = {
      authenticated: true,
      email: String(session.email || ''),
      fullName: String(session.fullName || ''),
      role: session.role === 'admin' ? 'admin' : 'guest',
      provider: String(session.provider || 'supabase'),
    };
    writeLog(`auth unlocked email=${authState.email} role=${authState.role} provider=${authState.provider}`);
  } else {
    authState = { authenticated: false, email: '', fullName: '', role: 'guest', provider: '' };
  }
  broadcastShellState();
  return { ok: true, auth: authState };
});

ipcMain.handle('desktop:clear-auth', () => {
  authState = { authenticated: false, email: '', fullName: '', role: 'guest', provider: '' };
  if (activeTab !== 'dashboard') switchTab('dashboard');
  else broadcastShellState();
  return { ok: true };
});

ipcMain.handle('desktop:open-screenshot-dir', () => {
  fs.mkdirSync(config.screenshotDir, { recursive: true });
  shell.openPath(config.screenshotDir);
  return true;
});

// Google refuses sign-in from user agents that mention Electron or custom app tokens.
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|screenshot-app|cahy-cyberwatch)\/\S+/gi, '');

if (!IS_SMOKE_TEST && !app.requestSingleInstanceLock()) {
  console.log('[CAHY CyberWatch] Ứng dụng đang chạy sẵn - đã chuyển tiêu điểm sang cửa sổ chính.');
  // Exit synchronously so Chromium never initializes disk/GPU cache on the duplicate instance
  app.exit(0);
} else {
  app.on('second-instance', () => {
    bringMainWindowToFront();
  });

  app.whenReady().then(async () => {
    try {
      await Promise.all([startDashboardServer(), startWebhookEngine()]);
      createMainWindow();
      if (!IS_SMOKE_TEST) setupTray();

      // Launch/attach FoxProfile asynchronously so UI opens immediately and never crashes if venv needs setup!
      startOrAttachFoxprofile(30000).then((res) => {
        if (res.ok && views.foxprofile) {
          views.foxprofile.webContents.loadURL(`http://127.0.0.1:${config.foxprofilePort}/`);
        }
        if (res.ok && !IS_SMOKE_TEST) scheduleFbCookieRefresh();
      });

      // Background health poll every 6s to keep top command bar live
      const pollTimer = setInterval(async () => {
        await probeFoxprofile();
        broadcastShellState();
      }, 6000);
      pollTimer.unref?.();

      if (IS_SMOKE_TEST) {
        // Automated end-to-end smoke check
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
        isQuitting = true;
        setTimeout(() => app.quit(), 400);
      }
    } catch (e) {
      writeLog(`fatal startup error: ${e.message}`);
      if (IS_SMOKE_TEST) {
        console.error('SMOKE_TEST_FAIL:', e.message);
        process.exit(1);
      }
      dialog.showErrorBox(APP_META.name, `Không thể khởi tạo cổng dịch vụ cục bộ:\n${e.message}`);
      isQuitting = true;
      app.quit();
    }
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  stopSpawnedFoxprofile();
});
