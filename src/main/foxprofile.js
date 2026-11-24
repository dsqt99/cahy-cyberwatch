// Resilient FoxProfile Antidetect process manager (attach external or spawn bundled venv).
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function createFoxProfileManager({ getConfig, writeLog, logStream, onStateChange, onReloadFoxView }) {
  const state = {
    mode: 'stopped', // 'stopped' | 'starting' | 'spawned' | 'external' | 'error'
    online: false,
    profilesCount: 0,
    runningCount: 0,
    lastError: '',
    pid: null,
  };
  let proc = null;

  const apiBase = () => `http://127.0.0.1:${getConfig().foxprofilePort}/api/v1`;

  async function probe() {
    const cfg = getConfig();
    const headers = cfg.foxprofileToken ? { authorization: `Bearer ${cfg.foxprofileToken}` } : {};
    try {
      const res = await fetch(`${apiBase()}/profiles`, {
        headers,
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) {
        state.online = false;
        return false;
      }
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data.profiles) ? data.profiles : [];
      state.online = true;
      state.profilesCount = list.length;
      state.runningCount = list.filter((p) => p && (p.is_running || p.running)).length;
      state.lastError = '';
      return true;
    } catch {
      state.online = false;
      return false;
    }
  }

  function stopSpawned() {
    if (proc?.pid) {
      try {
        spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true });
      } catch {}
      proc = null;
      state.pid = null;
    }
  }

  async function isTokenlessOnPort() {
    const cfg = getConfig();
    if (!cfg.foxprofileToken) return false;
    try {
      const res = await fetch(`${apiBase()}/info`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) return false;
      const info = await res.json().catch(() => ({}));
      return info?.name === 'FoxProfile' && info?.auth_required === false;
    } catch {
      return false;
    }
  }

  function stopExternalTokenless() {
    const cfg = getConfig();
    try {
      const cmd = `Get-NetTCPConnection -LocalPort ${Number(cfg.foxprofilePort)} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`;
      spawnSync('powershell', ['-NoProfile', '-Command', cmd], { windowsHide: true });
      writeLog(`stopped external token-less FoxProfile on port ${cfg.foxprofilePort} to respawn with FOXPROFILE_API_TOKEN`);
    } catch {}
  }

  async function startOrAttach(waitMs = 25000) {
    const cfg = getConfig();

    if (await probe()) {
      if (!proc && (await isTokenlessOnPort())) {
        stopExternalTokenless();
        state.online = false;
        await new Promise((r) => setTimeout(r, 800));
      } else {
        if (!proc) state.mode = 'external';
        writeLog(`foxprofile online (${state.mode}) on port ${cfg.foxprofilePort}`);
        onStateChange();
        return { ok: true, state: { ...state } };
      }
    }

    const python = path.join(cfg.foxprofileDir, '.venv', 'Scripts', 'python.exe');
    if (!fs.existsSync(python)) {
      state.mode = 'error';
      state.online = false;
      state.lastError = `Không tìm thấy Python venv của FoxProfile tại: ${python}`;
      writeLog(`foxprofile missing: ${python}`);
      onStateChange();
      return { ok: false, error: state.lastError, state: { ...state } };
    }

    state.mode = 'starting';
    onStateChange();

    try {
      proc = spawn(
        python,
        ['-m', 'src.server', '--port', String(cfg.foxprofilePort), ...(cfg.headed ? ['--headed'] : [])],
        {
          cwd: cfg.foxprofileDir,
          env: {
            ...process.env,
            FOXPROFILE_RESTORE_TABS: 'false',
            ...(cfg.foxprofileToken && { FOXPROFILE_API_TOKEN: cfg.foxprofileToken }),
          },
          windowsHide: true,
        },
      );
      state.pid = proc.pid;
      proc.stdout.on('data', (d) => logStream.write(d));
      proc.stderr.on('data', (d) => logStream.write(d));
      proc.on('exit', (code) => {
        writeLog(`foxprofile exited: ${code}`);
        if (state.pid === proc?.pid) {
          proc = null;
          state.pid = null;
          state.online = false;
          state.mode = 'stopped';
          onStateChange();
        }
      });
    } catch (err) {
      state.mode = 'error';
      state.lastError = err.message;
      writeLog(`foxprofile spawn error: ${err.message}`);
      onStateChange();
      return { ok: false, error: err.message, state: { ...state } };
    }

    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      if (await probe()) {
        state.mode = 'spawned';
        writeLog(`foxprofile ready (pid=${state.pid}) on port ${cfg.foxprofilePort}`);
        onStateChange();
        return { ok: true, state: { ...state } };
      }
      if (!proc) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    state.mode = 'error';
    state.lastError = `FoxProfile không phản hồi trên cổng ${cfg.foxprofilePort} sau ${Math.round(waitMs / 1000)}s`;
    onStateChange();
    return { ok: false, error: state.lastError, state: { ...state } };
  }

  async function restart() {
    stopSpawned();
    const res = await startOrAttach(30000);
    if (!res.ok) throw new Error(res.error);
    onReloadFoxView?.();
    return res.state;
  }

  return {
    getState: () => ({ ...state }),
    probe,
    startOrAttach,
    stopSpawned,
    restart,
  };
}

module.exports = { createFoxProfileManager };
