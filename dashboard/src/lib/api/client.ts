import { isDesktopApp } from '../desktopBridge'
import type { AuthSessionInfo } from './types'

export const POSTGRES_API_URL = (
  import.meta.env.VITE_POSTGRES_API_URL || 'http://localhost:5434'
).replace(/\/+$/, '')

export const POSTGRES_DB_INFO =
  import.meta.env.VITE_POSTGRES_DB_INFO || 'localhost:5435/cahy_cyberwatch'

export const SESSION_STORAGE_KEY = 'cahy_auth_session_v2'
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000

export const readStoredCustomSession = (): AuthSessionInfo | null => {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthSessionInfo
    if (!parsed.authenticated || !parsed.email || Date.now() > parsed.expiresAt) {
      localStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function pgRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = readStoredCustomSession()
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  if (session?.accessToken) {
    headers.set('Authorization', `Bearer ${session.accessToken}`)
  }
  const res = await fetch(`${POSTGRES_API_URL}${path}`, {
    ...init,
    headers,
  })
  const payload = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    const errMsg =
      payload && typeof payload === 'object' && 'error' in payload && payload.error
        ? String(payload.error)
        : `PostgreSQL API HTTP ${res.status}`
    throw new Error(errMsg)
  }
  return payload
}

// Call n8n webhook with current session token & audit headers.
export const n8nFetch = async (url: string, init: RequestInit = {}) => {
  const custom = readStoredCustomSession()
  const headers = new Headers(init.headers)
  if (custom?.accessToken) {
    headers.set('Authorization', `Bearer ${custom.accessToken}`)
  }
  const activeEmail = custom?.email || sessionStorage.getItem('userEmail')
  const activeRole = custom?.role || sessionStorage.getItem('userRole')
  if (activeEmail) headers.set('X-CAHY-User', activeEmail)
  if (activeRole) headers.set('X-CAHY-Role', activeRole)
  headers.set('X-CAHY-Client', isDesktopApp() ? 'CAHY-CyberWatch-Desktop/2.0' : 'CAHY-CyberWatch-Web/2.0')
  return fetch(url, { ...init, headers })
}
