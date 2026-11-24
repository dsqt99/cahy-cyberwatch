// Smart CLI launcher for CAHY CyberWatch Desktop.
// Eliminates Chromium SingletonLock / GPUCache stderr collisions when an instance
// is already running in the background or Windows System Tray.
const { spawn, execSync } = require('child_process');
const path = require('path');
const { loadConfig } = require('../config');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readPorts() {
  const cfg = loadConfig(ROOT_DIR);
  return {
    host: cfg.webhookHost || '127.0.0.1',
    webhookPort: Number(cfg.webhookPort) || 5680,
    dashboardPort: Number(cfg.dashboardPort) || 5690,
  };
}

async function probeRunningInstance(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/webhook/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function forceStopPortOwnerWin(port) {
  if (process.platform !== 'win32') return;
  try {
    const cmd = `powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue; if ($c) { $c | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }"`;
    execSync(cmd, { stdio: 'ignore' });
  } catch {
    // ignore
  }
}

async function stopExistingInstance(baseUrl, webhookPort) {
  try {
    const res = await fetch(`${baseUrl}/api/desktop/window/quit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) forceStopPortOwnerWin(webhookPort);
  } catch {
    forceStopPortOwnerWin(webhookPort);
  }

  for (let i = 0; i < 25; i++) {
    await sleep(200);
    const alive = await probeRunningInstance(baseUrl);
    if (!alive) return true;
  }
  forceStopPortOwnerWin(webhookPort);
  await sleep(400);
  return true;
}

function launchElectron(extraArgs) {
  const electronBinary = require('electron');
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronBinary, ['.', ...extraArgs], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: cleanEnv,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const forceRestart = rawArgs.includes('--restart');
  const isSmoke = rawArgs.includes('--smoke-test');
  const passArgs = rawArgs.filter((a) => a !== '--restart');

  const { host, webhookPort, dashboardPort } = readPorts();
  const baseUrl = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${webhookPort}`;

  if (!isSmoke) {
    const running = await probeRunningInstance(baseUrl);
    if (running) {
      if (forceRestart) {
        console.log('[CAHY CyberWatch] Đang đóng phiên chạy nền cũ để khởi động lại...');
        await stopExistingInstance(baseUrl, webhookPort);
      } else {
        try {
          const focusRes = await fetch(`${baseUrl}/api/desktop/window/focus`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ reload: true }),
            signal: AbortSignal.timeout(1500),
          });
          if (focusRes.ok) {
            console.log(
              `[CAHY CyberWatch] Ứng dụng đang hoạt động sẵn (Dashboard http://127.0.0.1:${dashboardPort} | Webhook :${webhookPort}).`,
            );
            console.log('[CAHY CyberWatch] Đã mở cửa sổ ứng dụng lên trên cùng màn hình và làm mới giao diện.');
            console.log('[CAHY CyberWatch] Gợi ý: Chạy "npm run restart" nếu muốn khởi động lại toàn bộ tiến trình.');
            return;
          }
        } catch {
          // fall through to clean restart if older build lacks /api/desktop/window/focus
        }
        console.log('[CAHY CyberWatch] Phát hiện phiên cũ chưa có bộ điều khiển cửa sổ mới, đang khởi động lại...');
        await stopExistingInstance(baseUrl, webhookPort);
      }
    }
  }

  launchElectron(passArgs);
}

main().catch((err) => {
  console.error('[CAHY CyberWatch] Lỗi khởi chạy:', err.message);
  process.exit(1);
});
