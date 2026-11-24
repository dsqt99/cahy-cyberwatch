// Electron IPC handler registrations for Desktop Shell & Dashboard preload bridges.
const { ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { saveConfig } = require('../config');

function registerIpcHandlers({ appMeta, configFile, getConfig, setConfig, windowManager, foxManager, writeLog }) {
  ipcMain.handle('shell:get-state', () => windowManager.getShellState());
  ipcMain.handle('shell:switch-tab', (_e, tabId) => windowManager.switchTab(String(tabId)));

  ipcMain.handle('shell:nav-action', (_e, action) => {
    const views = windowManager.getViews();
    const wc = views[windowManager.getActiveTab()]?.webContents;
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
    windowManager.setAuthState({ authenticated: false, email: '', fullName: '', role: 'guest', provider: '' });
    windowManager.switchTab('dashboard');
    const dashboard = windowManager.getViews().dashboard;
    if (dashboard && !dashboard.webContents.isDestroyed()) {
      dashboard.webContents.send('desktop:force-logout');
    }
    windowManager.broadcastShellState();
    return { ok: true };
  });

  ipcMain.handle('shell:set-menu-open', (_e, open) => {
    windowManager.setMenuOpen(open);
    return { ok: true };
  });

  ipcMain.handle('shell:set-theme', (_e, theme) => {
    const cfg = { ...getConfig(), theme: theme === 'light' ? 'light' : 'dark' };
    setConfig(cfg);
    saveConfig(configFile, cfg);
    const views = windowManager.getViews();
    for (const view of [views.dashboard, views.settings]) {
      if (view && !view.webContents.isDestroyed()) {
        view.webContents.send('desktop:theme-changed', cfg.theme);
      }
    }
    windowManager.broadcastShellState();
    return { ok: true, theme: cfg.theme };
  });

  ipcMain.handle('desktop:get-theme', () => (getConfig().theme === 'light' ? 'light' : 'dark'));

  ipcMain.handle('shell:get-config', () => ({ ...getConfig() }));

  ipcMain.handle('shell:save-config', (_e, partial) => {
    const prev = getConfig();
    const next = { ...prev, ...partial };
    if (next.n8nUrl && (!partial.n8nWebhookBase || next.n8nUrl !== prev.n8nUrl)) {
      next.n8nWebhookBase = `${String(next.n8nUrl).replace(/\/+$/, '')}/webhook/`;
    }
    setConfig(next);
    saveConfig(configFile, next);
    if (next.n8nUrl !== prev.n8nUrl) windowManager.resetN8nLoaded();
    writeLog(`config updated: ${configFile}`);
    windowManager.broadcastShellState();
    return { ok: true, config: next };
  });

  ipcMain.handle('shell:pick-directory', async (_e, defaultPath) => {
    const mainWindow = windowManager.getMainWindow();
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
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Dashboard <-> Desktop SSO & Runtime Bridge
  ipcMain.handle('desktop:get-runtime-info', () => {
    const cfg = getConfig();
    return {
      appName: appMeta.name,
      version: appMeta.version,
      webhookBaseUrl: `http://127.0.0.1:${cfg.webhookPort}`,
      foxprofileUrl: `http://127.0.0.1:${cfg.foxprofilePort}`,
      n8nUrl: cfg.n8nUrl,
      n8nWebhookBase: cfg.n8nWebhookBase,
      hasOperatorPasscode: Boolean(cfg.desktopOperatorPasscode),
    };
  });

  ipcMain.handle('desktop:sync-auth', (_e, session) => {
    if (session && session.authenticated) {
      const nextAuth = {
        authenticated: true,
        email: String(session.email || ''),
        fullName: String(session.fullName || ''),
        role: session.role === 'admin' ? 'admin' : 'guest',
        provider: String(session.provider || 'supabase'),
      };
      windowManager.setAuthState(nextAuth);
      writeLog(`auth unlocked email=${nextAuth.email} role=${nextAuth.role} provider=${nextAuth.provider}`);
    } else {
      windowManager.setAuthState({ authenticated: false, email: '', fullName: '', role: 'guest', provider: '' });
    }
    windowManager.broadcastShellState();
    return { ok: true, auth: windowManager.getAuthState() };
  });

  ipcMain.handle('desktop:clear-auth', () => {
    windowManager.setAuthState({ authenticated: false, email: '', fullName: '', role: 'guest', provider: '' });
    if (windowManager.getActiveTab() !== 'dashboard') windowManager.switchTab('dashboard');
    else windowManager.broadcastShellState();
    return { ok: true };
  });

  ipcMain.handle('desktop:open-screenshot-dir', () => {
    const dir = getConfig().screenshotDir;
    fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    return true;
  });
}

module.exports = { registerIpcHandlers };
