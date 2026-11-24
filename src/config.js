// Centralized configuration loader & metadata for CAHY CyberWatch (Desktop + Headless Agent + CLI).
const fs = require('fs');
const path = require('path');

const APP_META = {
  name: 'CAHY CyberWatch',
  fullTitle: 'CAHY CyberWatch - Hệ thống Giám sát & Điều hành Không gian mạng',
  version: '2.0.0',
};

function createDefaultConfig(baseDir) {
  return {
    foxprofileDir: path.join(baseDir, 'foxprofile'),
    foxprofilePort: 8010,
    foxprofileToken: '',
    headed: true,
    webhookHost: '127.0.0.1',
    webhookPort: 5680,
    screenshotDir: path.join(baseDir, 'screenshots'),
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
    webhookToken: '',
    browserIdleSeconds: 120,
    screenshotRetentionDays: 0,
    captureRetries: 1,
    captureJitterMinSeconds: 2,
    captureJitterMaxSeconds: 6,
    maxConcurrentBrowsers: 3,
  };
}

function loadConfig(baseDir, overrides = {}) {
  const configFile = path.join(baseDir, 'config.json');
  const defaults = { ...createDefaultConfig(baseDir), ...overrides };
  let disk = {};

  if (fs.existsSync(configFile)) {
    try {
      disk = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    } catch (err) {
      console.error('Invalid config.json:', err.message);
    }
  }

  const merged = { ...defaults, ...disk };
  for (const key of ['foxprofileDir', 'screenshotDir']) {
    if (merged[key]) merged[key] = path.resolve(baseDir, merged[key]);
  }
  if (!merged.n8nWebhookBase && merged.n8nUrl) {
    merged.n8nWebhookBase = `${String(merged.n8nUrl).replace(/\/+$/, '')}/webhook/`;
  }
  return merged;
}

function saveConfig(configFile, config) {
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
}

module.exports = {
  APP_META,
  createDefaultConfig,
  loadConfig,
  saveConfig,
};
