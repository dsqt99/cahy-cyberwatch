// Typed bridge between CAHY CyberWatch React Dashboard and the Electron Desktop Shell & Local Engine (:5680).

export type UserRoleType = 'admin' | 'guest';

export interface DesktopAuthPayload {
  authenticated: boolean;
  email: string;
  fullName?: string;
  role: UserRoleType;
  provider: string;
}

export interface DesktopRuntimeInfo {
  appName: string;
  version: string;
  webhookBaseUrl: string;
  foxprofileUrl: string;
  n8nUrl: string;
  n8nWebhookBase: string;
  hasOperatorPasscode: boolean;
}

export interface CyberwatchDesktopAPI {
  isDesktop: boolean;
  appName: string;
  version: string;
  getRuntimeInfo: () => Promise<DesktopRuntimeInfo>;
  syncAuthSession: (session: DesktopAuthPayload) => Promise<{ ok: boolean }>;
  clearAuthSession: () => Promise<{ ok: boolean }>;
  switchWorkspace: (tabId: 'dashboard' | 'foxprofile' | 'n8n' | 'settings') => Promise<boolean>;
  openScreenshotFolder: () => Promise<boolean>;
  onForceLogout: (callback: () => void) => () => void;
  getTheme?: () => Promise<'light' | 'dark'>;
  onThemeChange?: (callback: (theme: 'light' | 'dark') => void) => () => void;
}

declare global {
  interface Window {
    cyberwatchDesktop?: CyberwatchDesktopAPI;
  }
}

export interface FoxProfileItem {
  name: string;
  proxy?: string | null;
  os_type?: string;
  timezone?: string;
  locale?: string;
  engine?: string;
  is_running?: boolean;
  running?: boolean;
  status?: string;
}

export interface CaptureJobRecord {
  id: string;
  kind: 'screenshot' | 'cookie_export';
  type: string;
  profile_id: string;
  url: string;
  source?: string;
  status: 'running' | 'success' | 'error';
  startedAt: string;
  durationMs: number;
  outputFile?: string;
  c_user?: string;
  error?: string;
}

export interface DesktopStatusResponse {
  ok: boolean;
  app: { name: string; version: string };
  timestamp: string;
  services: {
    webhook: { host: string; port: number; online: boolean };
    dashboard: { port: number; url: string };
    foxprofile: {
      port: number;
      url: string;
      dir: string;
      headed: boolean;
      online: boolean;
      profilesCount: number;
      runningCount: number;
    };
    n8n: {
      url: string;
      webhookBase: string;
      hasApiKey: boolean;
    };
  };
  configSummary: {
    defaultProfile: string;
    screenshotDir: string;
    minimizeToTray: boolean;
    hasOperatorPasscode: boolean;
  };
  profiles: FoxProfileItem[];
  captureStats: {
    activeJobs: number;
    queuedProfiles: string[];
    totalCaptures: number;
    totalSuccess: number;
    totalFailed: number;
    totalCookieExports: number;
    recentJobs: CaptureJobRecord[];
  };
}

let cachedRuntimeInfo: DesktopRuntimeInfo | null = null;

export const isDesktopApp = (): boolean => {
  return typeof window !== 'undefined' && Boolean(window.cyberwatchDesktop?.isDesktop);
};

export const initDesktopRuntimeInfo = async (): Promise<DesktopRuntimeInfo | null> => {
  if (!isDesktopApp() || !window.cyberwatchDesktop) return null;
  try {
    cachedRuntimeInfo = await window.cyberwatchDesktop.getRuntimeInfo();
    return cachedRuntimeInfo;
  } catch {
    return null;
  }
};

export const getN8nWebhookBaseSync = (): string => {
  const custom = typeof window !== 'undefined' ? localStorage.getItem('cahy_n8n_webhook_base') : null;
  if (custom && custom.startsWith('http')) {
    if (/^https?:\/\/n8n(-antidet)?\.anm05\.com(\/|$)/i.test(custom)) {
      try {
        localStorage.removeItem('cahy_n8n_webhook_base');
      } catch {
        // Ignore storage errors
      }
    } else {
      return custom.endsWith('/') ? custom : `${custom}/`;
    }
  }
  if (cachedRuntimeInfo?.n8nWebhookBase) {
    return cachedRuntimeInfo.n8nWebhookBase.endsWith('/')
      ? cachedRuntimeInfo.n8nWebhookBase
      : `${cachedRuntimeInfo.n8nWebhookBase}/`;
  }
  const envBase = import.meta.env.VITE_N8N_WEBHOOK_BASE || 'http://localhost:5678/webhook/';
  return envBase.endsWith('/') ? envBase : `${envBase}/`;
};

export const getLocalEngineBase = (): string => {
  return cachedRuntimeInfo?.webhookBaseUrl || 'http://127.0.0.1:5680';
};

export const notifyDesktopAuth = async (payload: DesktopAuthPayload): Promise<void> => {
  if (isDesktopApp() && window.cyberwatchDesktop) {
    try {
      await window.cyberwatchDesktop.syncAuthSession(payload);
    } catch {
      // Ignore IPC errors outside desktop context
    }
  }
};

export const notifyDesktopLogout = async (): Promise<void> => {
  if (isDesktopApp() && window.cyberwatchDesktop) {
    try {
      await window.cyberwatchDesktop.clearAuthSession();
    } catch {
      // Ignore IPC errors
    }
  }
};

export const fetchDesktopStatus = async (): Promise<DesktopStatusResponse | null> => {
  try {
    const res = await fetch(`${getLocalEngineBase()}/api/desktop/status`, {
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    return (await res.json()) as DesktopStatusResponse;
  } catch {
    return null;
  }
};

export const controlFoxProfile = async (
  name: string,
  action: 'launch' | 'stop'
): Promise<{ ok: boolean; message?: string }> => {
  const res = await fetch(
    `${getLocalEngineBase()}/api/desktop/profiles/${encodeURIComponent(name)}/${action}`,
    { method: 'POST' }
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data.detail || data.error || `HTTP ${res.status}`));
  }
  return { ok: true, message: String(data.message || '') };
};

export const createFoxProfileFromDashboard = async (payload: {
  name: string;
  proxy?: string;
}): Promise<void> => {
  const res = await fetch(`${getLocalEngineBase()}/api/desktop/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: payload.name,
      proxy: payload.proxy || '',
      os_type: 'windows',
      timezone: 'Asia/Ho_Chi_Minh',
      locale: 'vi-VN',
      engine: 'camoufox',
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data.detail || data.error || `HTTP ${res.status}`));
  }
};

export const restartLocalFoxProfile = async (): Promise<void> => {
  const res = await fetch(`${getLocalEngineBase()}/api/desktop/foxprofile/restart`, {
    method: 'POST',
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.error || `HTTP ${res.status}`));
  }
};

export const testLocalScreenshotCapture = async (params: {
  type: 'news' | 'fb' | 'fbpđ' | 'tiktok';
  url: string;
  profileId?: string;
}): Promise<{ outputFilePath: string; previewUrl?: string }> => {
  const res = await fetch(
    `${getLocalEngineBase()}/webhook/screenshot_${encodeURIComponent(params.type)}?include_preview=1`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: params.url,
        profile_id: params.profileId || '',
        source: 'dashboard-control',
      }),
    }
  );
  const data = (await res.json().catch(() => ({}))) as
    | Array<{ outputFilePath?: string[]; previewUrl?: string }>
    | { error?: string };
  if (!res.ok || !Array.isArray(data)) {
    const errMsg = !Array.isArray(data) && data.error ? data.error : `HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return {
    outputFilePath: data[0]?.outputFilePath?.[0] || '',
    previewUrl: data[0]?.previewUrl,
  };
};

export const exportLocalFacebookCookie = async (
  profileId?: string
): Promise<{ ok: boolean; profile_id: string; c_user?: string; cookie?: string; total_cookies?: number; error?: string }> => {
  const res = await fetch(`${getLocalEngineBase()}/webhook/export_fb_cookie`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_id: profileId || '' }),
  });
  return (await res.json()) as {
    ok: boolean;
    profile_id: string;
    c_user?: string;
    cookie?: string;
    total_cookies?: number;
    error?: string;
  };
};

export interface N8nWorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  updatedAt?: string;
  createdAt?: string;
}

export interface N8nExecutionSummary {
  id: string;
  workflowId: string;
  status?: string;
  finished?: boolean;
  mode?: string;
  startedAt?: string;
  stoppedAt?: string;
}

export const callN8nPublicApiViaDesktop = async <T = unknown>(params: {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  apiKey?: string;
  n8nUrl?: string;
  payload?: Record<string, unknown>;
}): Promise<{ ok: boolean; needsApiKey?: boolean; error?: string; data?: T }> => {
  try {
    const res = await fetch(`${getLocalEngineBase()}/api/desktop/n8n-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      needsApiKey?: boolean;
      error?: string;
      data?: T;
    };
    if (!res.ok || !json.ok) {
      return {
        ok: false,
        needsApiKey: json.needsApiKey,
        error: json.error || `HTTP ${res.status}`,
      };
    }
    return { ok: true, data: json.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Không kết nối được Desktop Proxy (:5680)',
    };
  }
};

