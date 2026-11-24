// Electron BaseWindow, WebContentsView workspace tabs, topbar layout, accelerators, and system tray.
const { BaseWindow, WebContentsView, Menu, Tray, nativeImage, shell, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { getStats } = require('../capture');

const TOPBAR_HEIGHT = 46;

function attachExternalLinkHandler(wc) {
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createWindowManager({
  rootDir,
  iconPath,
  appMeta,
  isSmokeTest,
  getConfig,
  getFoxState,
  getWebhookOnline,
  onRestartFox,
  writeLog,
}) {
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
    role: 'guest',
    provider: '',
  };

  function canAccessTab(tabId) {
    if (tabId === 'dashboard') return true;
    if (authState.authenticated && authState.role === 'admin') return true;
    // Rescue mode: allow opening workstation settings if FoxProfile is offline before login
    if (tabId === 'settings' && !getFoxState().online) return true;
    return false;
  }

  function getShellState() {
    const cfg = getConfig();
    const foxState = getFoxState();
    const cs = getStats();
    return {
      app: appMeta,
      activeTab,
      auth: { ...authState },
      allowRescueSettings: !foxState.online,
      foxprofile: { ...foxState },
      webhook: {
        online: getWebhookOnline(),
        port: cfg.webhookPort,
        activeJobs: cs.activeJobs,
        totalSuccess: cs.totalSuccess,
      },
      n8nUrl: cfg.n8nUrl,
      theme: cfg.theme === 'light' ? 'light' : 'dark',
    };
  }

  function layoutViews() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const { width, height } = mainWindow.getContentBounds();
    const showBar = Boolean(authState.authenticated) || activeTab !== 'dashboard';
    const barH = showBar ? TOPBAR_HEIGHT : 0;
    if (topbarView) {
      topbarView.setVisible(showBar);
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

  function broadcastShellState() {
    layoutViews();
    if (topbarView && !topbarView.webContents.isDestroyed()) {
      topbarView.webContents.send('shell:state-updated', getShellState());
    }
  }

  function bringToFront({ reloadDashboard = false } = {}) {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.setAlwaysOnTop(true);
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop?.();
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(false);
    }, 180);
    if (reloadDashboard && views.dashboard && !views.dashboard.webContents.isDestroyed()) {
      views.dashboard.webContents.reloadIgnoringCache();
    }
    return true;
  }

  function switchTab(tabId) {
    if (!views[tabId] || !canAccessTab(tabId)) return false;
    const cfg = getConfig();
    const foxState = getFoxState();

    if (tabId === 'foxprofile') {
      const currentUrl = views.foxprofile.webContents.getURL();
      const targetFoxUrl = `http://127.0.0.1:${cfg.foxprofilePort}/`;
      if (foxState.online && !currentUrl.startsWith(targetFoxUrl)) {
        views.foxprofile.webContents.loadURL(targetFoxUrl);
      } else if (!foxState.online && !currentUrl.endsWith('fox-offline.html')) {
        views.foxprofile.webContents.loadFile(path.join(rootDir, 'shell', 'fox-offline.html'));
      }
    }

    if (tabId === 'n8n' && !n8nLoaded) {
      n8nLoaded = true;
      views.n8n.webContents.loadURL(cfg.n8nUrl);
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
    const cfg = getConfig();
    const iconImg = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;

    mainWindow = new BaseWindow({
      width: 1480,
      height: 940,
      minWidth: 1080,
      minHeight: 700,
      title: appMeta.fullTitle,
      icon: iconImg,
    });

    // Top Command Bar
    topbarView = new WebContentsView({
      webPreferences: {
        preload: path.join(rootDir, 'preload', 'shell-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    topbarView.setBackgroundColor('#00000000');
    topbarView.webContents.loadFile(path.join(rootDir, 'shell', 'topbar.html'));
    mainWindow.contentView.addChildView(topbarView);

    // 1. Dashboard Workspace
    views.dashboard = new WebContentsView({
      webPreferences: {
        preload: path.join(rootDir, 'preload', 'dashboard-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    views.dashboard.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      writeLog(`[Dashboard Console ${level}] ${message} (${sourceId}:${line})`);
    });
    views.dashboard.webContents.on('did-fail-load', (_e, code, desc, url) => {
      writeLog(`[Dashboard Fail] ${code} ${desc} ${url}`);
    });
    attachExternalLinkHandler(views.dashboard.webContents);
    views.dashboard.webContents.loadURL(`http://localhost:${cfg.dashboardPort}/`);

    // 2. FoxProfile Antidetect Workspace
    views.foxprofile = new WebContentsView({
      webPreferences: {
        preload: path.join(rootDir, 'preload', 'shell-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    attachExternalLinkHandler(views.foxprofile.webContents);
    views.foxprofile.webContents.on('dom-ready', () => {
      const currentCfg = getConfig();
      const currentUrl = views.foxprofile.webContents.getURL();
      if (currentCfg.foxprofileToken && currentUrl.startsWith(`http://127.0.0.1:${currentCfg.foxprofilePort}`)) {
        const tokJson = JSON.stringify(String(currentCfg.foxprofileToken));
        views.foxprofile.webContents
          .executeJavaScript(
            `try { if (localStorage.getItem('foxprofile.token') !== ${tokJson}) { localStorage.setItem('foxprofile.token', ${tokJson}); location.reload(); } } catch {}`,
          )
          .catch(() => {});
      }
    });
    views.foxprofile.webContents.loadFile(path.join(rootDir, 'shell', 'fox-offline.html'));

    // 3. n8n Workflow Studio Workspace
    views.n8n = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    attachExternalLinkHandler(views.n8n.webContents);

    // 4. Native Workstation Settings Workspace
    views.settings = new WebContentsView({
      webPreferences: {
        preload: path.join(rootDir, 'preload', 'shell-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    attachExternalLinkHandler(views.settings.webContents);
    views.settings.webContents.loadFile(path.join(rootDir, 'shell', 'settings.html'));

    mainWindow.on('resize', layoutViews);
    mainWindow.on('close', (e) => {
      if (!isQuitting && getConfig().minimizeToTray !== false && tray && !isSmokeTest) {
        e.preventDefault();
        mainWindow.hide();
      }
    });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    const accelMenu = Menu.buildFromTemplate([
      {
        label: appMeta.name,
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
    if (!fs.existsSync(iconPath)) return;
    try {
      const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
      tray = new Tray(icon);
      tray.setToolTip(`${appMeta.name} - Webhook :${getConfig().webhookPort}`);
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'Mở CAHY CyberWatch', click: () => bringToFront() },
          { type: 'separator' },
          {
            label: 'Trung tâm Giám sát (Dashboard)',
            click: () => {
              bringToFront();
              switchTab('dashboard');
            },
          },
          {
            label: 'Quản trị Trạm & Cấu hình',
            click: () => {
              bringToFront();
              switchTab('settings');
            },
          },
          {
            label: 'Khởi động lại FoxProfile',
            click: () => {
              onRestartFox().catch((err) => writeLog(`tray restart fox failed: ${err.message}`));
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
      tray.on('double-click', () => bringToFront());
    } catch (err) {
      writeLog(`tray setup skipped: ${err.message}`);
    }
  }

  return {
    createMainWindow,
    setupTray,
    switchTab,
    layoutViews,
    broadcastShellState,
    bringToFront,
    getShellState,
    getMainWindow: () => mainWindow,
    getViews: () => views,
    getActiveTab: () => activeTab,
    getAuthState: () => authState,
    setAuthState: (next) => {
      authState = next;
    },
    setQuitting: (val) => {
      isQuitting = Boolean(val);
    },
    setMenuOpen: (open) => {
      topbarMenuOpen = Boolean(open);
      if (topbarMenuOpen && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.contentView.addChildView(topbarView);
      }
      layoutViews();
    },
    resetN8nLoaded: () => {
      n8nLoaded = false;
    },
    loadFoxViewIfReady: (force = false) => {
      if (!views.foxprofile) return;
      if (force || activeTab === 'foxprofile') {
        views.foxprofile.webContents.loadURL(`http://127.0.0.1:${getConfig().foxprofilePort}/`);
      }
    },
  };
}

module.exports = { createWindowManager };
