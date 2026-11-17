// Preload bridge for the Desktop Shell Chrome (topbar.html & settings.html).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cyberwatchShell', {
  getState: () => ipcRenderer.invoke('shell:get-state'),
  switchTab: (tabId) => ipcRenderer.invoke('shell:switch-tab', tabId),
  navAction: (action) => ipcRenderer.invoke('shell:nav-action', action),
  logout: () => ipcRenderer.invoke('shell:logout'),
  setMenuOpen: (open) => ipcRenderer.invoke('shell:set-menu-open', open),
  setTheme: (theme) => ipcRenderer.invoke('shell:set-theme', theme),
  getConfig: () => ipcRenderer.invoke('shell:get-config'),
  saveConfig: (partial) => ipcRenderer.invoke('shell:save-config', partial),
  pickDirectory: (defaultPath) => ipcRenderer.invoke('shell:pick-directory', defaultPath),
  openPath: (targetPath) => ipcRenderer.invoke('shell:open-path', targetPath),
  restartFoxprofile: () => ipcRenderer.invoke('shell:restart-foxprofile'),
  onStateUpdate: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('shell:state-updated', handler);
    return () => ipcRenderer.removeListener('shell:state-updated', handler);
  },
});

