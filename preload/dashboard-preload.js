// Preload bridge injected into the embedded Social Tracking Dashboard view.
// Enables seamless Single Sign-On & workspace control between Dashboard and the Electron Desktop Shell.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cyberwatchDesktop', {
  isDesktop: true,
  appName: 'CAHY CyberWatch',
  version: '2.0.0',
  getRuntimeInfo: () => ipcRenderer.invoke('desktop:get-runtime-info'),
  syncAuthSession: (session) => ipcRenderer.invoke('desktop:sync-auth', session),
  clearAuthSession: () => ipcRenderer.invoke('desktop:clear-auth'),
  switchWorkspace: (tabId) => ipcRenderer.invoke('shell:switch-tab', tabId),
  openScreenshotFolder: () => ipcRenderer.invoke('desktop:open-screenshot-dir'),
  getTheme: () => ipcRenderer.invoke('desktop:get-theme'),
  onThemeChange: (callback) => {
    const handler = (_event, theme) => callback(theme);
    ipcRenderer.on('desktop:theme-changed', handler);
    return () => ipcRenderer.removeListener('desktop:theme-changed', handler);
  },
  onForceLogout: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('desktop:force-logout', handler);
    return () => ipcRenderer.removeListener('desktop:force-logout', handler);
  },
});

