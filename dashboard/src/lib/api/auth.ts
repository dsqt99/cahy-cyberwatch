import {
  getLocalEngineBase,
  getN8nWebhookBaseSync,
  initDesktopRuntimeInfo,
  isDesktopApp,
  notifyDesktopAuth,
  notifyDesktopLogout,
} from '../desktopBridge'
import {
  POSTGRES_API_URL,
  SESSION_STORAGE_KEY,
  SESSION_TTL_MS,
  pgRequest,
  readStoredCustomSession,
} from './client'
import type { AuthProviderType, AuthSessionInfo, Profile, UserRole } from './types'

const AUTH_CHANGE_EVENT = 'cahy-auth-changed'

interface AuthResponsePayload {
  ok?: boolean
  provider?: string
  error?: string
  access_token?: string
  user?: {
    id?: string
    email?: string
    full_name?: string
    role?: string
  }
}

const emitAuthChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT))
  }
}

export const onAuthChange = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(AUTH_CHANGE_EVENT, listener)
  return () => window.removeEventListener(AUTH_CHANGE_EVENT, listener)
}

const writeSessionStorage = (info: AuthSessionInfo, emit = true) => {
  sessionStorage.setItem('isAuthenticated', 'true')
  sessionStorage.setItem('userRole', info.role)
  sessionStorage.setItem('userEmail', info.email)
  sessionStorage.setItem('userFullName', info.fullName)
  sessionStorage.setItem('authProvider', info.provider)
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(info))
  void notifyDesktopAuth({
    authenticated: true,
    email: info.email,
    fullName: info.fullName,
    role: info.role,
    provider: info.provider,
  })
  if (emit) emitAuthChanged()
}

export const getCurrentAuthSession = (): AuthSessionInfo | null => {
  const custom = readStoredCustomSession()
  if (custom) return custom
  if (sessionStorage.getItem('isAuthenticated') === 'true') {
    const role = (sessionStorage.getItem('userRole') as UserRole) || 'guest'
    const rawProvider = sessionStorage.getItem('authProvider')
    const provider: AuthProviderType =
      rawProvider === 'n8n' || rawProvider === 'desktop-operator' ? rawProvider : 'postgresql'
    return {
      authenticated: true,
      userId: '',
      email: sessionStorage.getItem('userEmail') || '',
      fullName: sessionStorage.getItem('userFullName') || '',
      role: role === 'admin' ? 'admin' : 'guest',
      provider,
      expiresAt: Date.now() + SESSION_TTL_MS,
    }
  }
  return null
}

export const fetchUserProfile = async (userId: string): Promise<Profile | null> => {
  try {
    const res = await pgRequest<{ ok?: boolean; data?: Record<string, unknown> }>(
      `/api/profiles/${encodeURIComponent(userId)}`
    )
    const data = res?.data
    if (!data) return null
    return {
      id: String(data.id),
      email: data.email ? String(data.email) : null,
      full_name: data.full_name ? String(data.full_name) : null,
      avatar_url: data.avatar_url ? String(data.avatar_url) : null,
      role: data.role === 'admin' ? 'admin' : 'guest',
    }
  } catch (error) {
    console.error('Error fetching PostgreSQL user profile:', error)
    return null
  }
}

export const fetchUserRole = async (userId: string): Promise<UserRole | null> => {
  const profile = await fetchUserProfile(userId)
  return profile ? profile.role : null
}

export const signInWithCredentials = async (
  emailInput: string,
  password: string
): Promise<{ ok: boolean; session?: AuthSessionInfo; error?: string }> => {
  const email = emailInput.trim().toLowerCase()
  if (!email || !password) {
    return { ok: false, error: 'Vui lòng nhập đầy đủ Email và Mật khẩu.' }
  }

  await initDesktopRuntimeInfo()
  const n8nBase = getN8nWebhookBaseSync()

  // 1. Try n8n Auth Workflow first
  try {
    const n8nRes = await fetch(`${n8nBase}auth-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        client: isDesktopApp() ? 'cahy-cyberwatch-desktop' : 'cahy-cyberwatch-web',
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (n8nRes.status !== 404 && n8nRes.status < 500) {
      const payload = (await n8nRes.json().catch(() => ({}))) as AuthResponsePayload
      if (n8nRes.ok && payload.ok && payload.user) {
        const info: AuthSessionInfo = {
          authenticated: true,
          userId: String(payload.user.id || email),
          email: String(payload.user.email || email),
          fullName: String(payload.user.full_name || email),
          role: payload.user.role === 'admin' ? 'admin' : 'guest',
          provider: 'n8n',
          accessToken: payload.access_token,
          expiresAt: Date.now() + SESSION_TTL_MS,
        }
        writeSessionStorage(info)
        return { ok: true, session: info }
      }

      if (n8nRes.status === 401 || n8nRes.status === 403 || payload.ok === false) {
        return {
          ok: false,
          error: payload.error || 'Tài khoản hoặc mật khẩu không chính xác.',
        }
      }
    }
  } catch {
    // Fall back to PostgreSQL Auth API
  }

  // 2. Authenticate directly against PostgreSQL Auth API
  try {
    const pgRes = await fetch(`${POSTGRES_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(8000),
    })
    const payload = (await pgRes.json().catch(() => ({}))) as AuthResponsePayload
    if (!pgRes.ok || !payload.ok || !payload.user) {
      return {
        ok: false,
        error: payload.error || 'Email hoặc mật khẩu không chính xác.',
      }
    }

    const info: AuthSessionInfo = {
      authenticated: true,
      userId: String(payload.user.id || email),
      email: String(payload.user.email || email),
      fullName: String(payload.user.full_name || email),
      role: payload.user.role === 'admin' ? 'admin' : 'guest',
      provider: 'postgresql',
      accessToken: payload.access_token,
      expiresAt: Date.now() + SESSION_TTL_MS,
    }
    writeSessionStorage(info)
    return { ok: true, session: info }
  } catch {
    return {
      ok: false,
      error: `Không kết nối được máy chủ PostgreSQL API (${POSTGRES_API_URL}).`,
    }
  }
}

export const signInWithDesktopOperator = async (
  email: string,
  passcode: string
): Promise<{ ok: boolean; session?: AuthSessionInfo; error?: string }> => {
  try {
    await initDesktopRuntimeInfo()
    const res = await fetch(`${getLocalEngineBase()}/api/desktop/auth-operator`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), passcode }),
      signal: AbortSignal.timeout(5000),
    })
    const payload = (await res.json().catch(() => ({}))) as AuthResponsePayload
    if (!res.ok || !payload.ok || !payload.user) {
      return {
        ok: false,
        error: payload.error || 'Không thể xác thực Mã Điều hành Trạm Desktop.',
      }
    }
    const info: AuthSessionInfo = {
      authenticated: true,
      userId: String(payload.user.id || 'desktop-operator'),
      email: String(payload.user.email || email || 'operator@cahy.local'),
      fullName: String(payload.user.full_name || 'Quản trị viên Trạm CAHY'),
      role: payload.user.role === 'admin' ? 'admin' : 'guest',
      provider: 'desktop-operator',
      expiresAt: Date.now() + SESSION_TTL_MS,
    }
    writeSessionStorage(info)
    return { ok: true, session: info }
  } catch {
    return {
      ok: false,
      error: 'Không kết nối được dịch vụ Trạm Desktop cục bộ (127.0.0.1:5680).',
    }
  }
}

export const syncSessionToStorage = async (): Promise<boolean> => {
  await initDesktopRuntimeInfo()
  const stored = readStoredCustomSession()
  if (stored) {
    if (stored.accessToken && stored.provider !== 'desktop-operator') {
      try {
        const verifyRes = await fetch(`${POSTGRES_API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${stored.accessToken}` },
          signal: AbortSignal.timeout(4000),
        })
        if (verifyRes.status === 401) {
          await signOut()
          return false
        }
        if (verifyRes.ok) {
          const body = (await verifyRes.json().catch(() => ({}))) as AuthResponsePayload
          if (body.user) {
            stored.fullName = String(body.user.full_name || stored.fullName)
            stored.role = body.user.role === 'admin' ? 'admin' : 'guest'
          }
        }
      } catch {
        // Keep local unexpired session if API is temporarily unreachable
      }
    }
    writeSessionStorage(stored, false)
    return true
  }

  await notifyDesktopLogout()
  return false
}

export const signOut = async () => {
  localStorage.removeItem(SESSION_STORAGE_KEY)
  sessionStorage.removeItem('isAuthenticated')
  sessionStorage.removeItem('userRole')
  sessionStorage.removeItem('userEmail')
  sessionStorage.removeItem('userFullName')
  sessionStorage.removeItem('authProvider')
  await notifyDesktopLogout()
  emitAuthChanged()
}
