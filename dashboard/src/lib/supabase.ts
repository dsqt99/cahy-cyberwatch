import {
  getLocalEngineBase,
  getN8nWebhookBaseSync,
  initDesktopRuntimeInfo,
  isDesktopApp,
  notifyDesktopAuth,
  notifyDesktopLogout,
} from './desktopBridge'

export const POSTGRES_API_URL = (
  import.meta.env.VITE_POSTGRES_API_URL || 'http://localhost:5434'
).replace(/\/+$/, '')

export const POSTGRES_DB_INFO =
  import.meta.env.VITE_POSTGRES_DB_INFO || 'localhost:5435/cahy_cyberwatch'

// ===== Unified Auth (n8n Auth Workflow + Pure PostgreSQL Auth + Desktop Operator) =====

export type UserRole = 'admin' | 'guest'
export type AuthProviderType = 'n8n' | 'postgresql' | 'desktop-operator'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  role: UserRole
}

export interface AuthSessionInfo {
  authenticated: boolean
  userId: string
  email: string
  fullName: string
  role: UserRole
  provider: AuthProviderType
  accessToken?: string
  expiresAt: number
}

const SESSION_STORAGE_KEY = 'cahy_auth_session_v2'
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const AUTH_CHANGE_EVENT = 'cahy-auth-changed'

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

const readStoredCustomSession = (): AuthSessionInfo | null => {
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

async function pgRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
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

// Lấy profile + role từ bảng app_users trên PostgreSQL.
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

// Đăng nhập Email + Mật khẩu điều phối qua n8n Workflow (/webhook/auth-login)
// kết hợp xác thực trực tiếp PostgreSQL (bảng app_users + pgcrypto bcrypt).
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

  // 1. Thử xác thực qua n8n Auth Workflow trên localhost n8n trước
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
    // Nếu n8n đang khởi động lại -> chuyển thẳng xuống PostgreSQL Auth API
  }

  // 2. Xác thực trực tiếp qua PostgreSQL Auth API (localhost:5434 -> localhost:5435/cahy_cyberwatch)
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

// Mở khóa Trạm Điều hành Desktop cục bộ (desktopOperatorPasscode trong config.json)
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

// Đồng bộ phiên PostgreSQL / n8n / Desktop -> sessionStorage & Desktop Shell.
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
        // Nếu API tạm bận thì giữ nguyên phiên cục bộ chưa hết hạn
      }
    }
    writeSessionStorage(stored, false)
    return true
  }

  await notifyDesktopLogout()
  return false
}

// Gọi webhook n8n kèm token phiên PostgreSQL/n8n để ghi audit người gọi.
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

// Đăng xuất: xóa phiên PostgreSQL/n8n/Desktop, sessionStorage và khóa lại Desktop Shell.
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

// ===== PostgreSQL Database Types =====
export interface NewsItem {
  id: string
  source_id: string
  content: string
  link: string
  publish_date: string
  sentiment_id: string
  summary: string
  keywords: string
  screenshot?: string
  metadata?: Record<string, unknown>
  comment_status?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string
  // Joined data
  source?: Source
  sentiment?: Sentiment
}

export interface Source {
  id: string
  name: string
  link: string
  metadata?: Record<string, unknown>
  type_id: string
  parent_id?: string
  created_at: string
  updated_at: string
  deleted_at?: string
  // Joined data
  type?: SourceType
  parent?: Source
}

export interface Sentiment {
  id: string
  name: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface SourceType {
  id: string
  name: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface Rebuttal {
  id: string
  title: string
  content: string
  status: 'draft' | 'published' | 'error'
  post_url?: string
  image_base64?: string
  created_at: string
  updated_at: string
}

export interface Setting {
  id: string
  key_name: string
  setting_value: string
  description?: string
  updated_at: string
}

export type TrendPeriod = 'day' | 'week' | 'month'

export interface TrendReportStats {
  total: number
  positive: number
  negative: number
  neutral: number
  top_keywords?: { keyword: string; count: number }[]
}

export interface TrendReport {
  id: string
  period: TrendPeriod
  period_start: string
  period_end: string
  source: string | null
  channel: string | null
  title: string | null
  content: string
  stats: TrendReportStats | null
  created_at: string
}

export interface LegacyNewsItem {
  id?: number
  Nguồn: string
  title: string
  link: string
  publishDate: string
  source: string
  sentiment: 'Tích cực' | 'Tiêu cực' | 'Trung lập'
  summary: string
  keywords: string
  processed: string
}

export type SentimentTrend = {
  date: string
  fullDate: string
  'Tích cực': number
  'Tiêu cực': number
  'Trung lập': number
}

export type ChannelType = 'ANTT' | 'Phản Động' | 'all'

export interface NewsTopic {
  id: string
  label: string
  keywords: string[]
}

export const NEWS_TOPICS: NewsTopic[] = [
  {
    id: 'kinh-te',
    label: 'Kinh tế',
    keywords: ['kinh tế', 'môi trường', 'buôn lậu', 'thương mại điện tử', 'tham nhũng'],
  },
  {
    id: 'bieu-tinh',
    label: 'Hoạt động biểu tình, tụ tập đông người',
    keywords: ['biểu tình', 'tụ tập đông người', 'tuần hành', 'gây rối trật tự công cộng', 'kích động', 'tập trung đông người'],
  },
  {
    id: 'trat-tu-xa-hoi',
    label: 'Trật tự xã hội',
    keywords: ['trật tự xã hội', 'trộm cắp', 'cướp', 'cướp giật', 'cố ý gây thương tích', 'đánh nhau', 'gây rối', 'trật tự công cộng'],
  },
  {
    id: 'toi-pham-kgm',
    label: 'Hoạt động tội phạm trên không gian mạng',
    keywords: ['tội phạm mạng', 'lừa đảo qua mạng', 'lừa đảo trực tuyến', 'chiếm đoạt tài sản', 'giả mạo', 'không gian mạng', 'tội phạm công nghệ'],
  },
  {
    id: 'quan-ly-hanh-chinh',
    label: 'Quản lý hành chính về trật tự xã hội',
    keywords: ['quản lý hành chính', 'cư trú', 'tạm trú', 'tạm vắng', 'căn cước công dân', 'căn cước', 'định danh điện tử', 'hộ khẩu', 'vũ khí', 'vật liệu nổ'],
  },
  {
    id: 'ma-tuy',
    label: 'Ma tuý',
    keywords: ['ma tuý', 'ma túy', 'chất cấm', 'heroin', 'ketamine', 'ma tuý đá', 'tàng trữ trái phép', 'mua bán ma tuý', 'nghiện'],
  },
  {
    id: 'giao-thong',
    label: 'Giao thông đường bộ, đường sắt, đường thủy',
    keywords: ['giao thông', 'tai nạn giao thông', 'đường bộ', 'đường sắt', 'đường thủy', 'vi phạm giao thông', 'nồng độ cồn', 'tốc độ', 'ùn tắc'],
  },
  {
    id: 'pccc-cnch',
    label: 'PCCC & CNCH',
    keywords: ['phòng cháy', 'chữa cháy', 'PCCC', 'cứu nạn', 'cứu hộ', 'CNCH', 'hỏa hoạn', 'cháy nổ'],
  },
  {
    id: 'an-ninh',
    label: 'An ninh',
    keywords: ['an ninh', 'an ninh quốc gia', 'an ninh chính trị', 'phản động', 'chống phá', 'thế lực thù địch', 'gián điệp', 'khủng bố'],
  },
  {
    id: 'an-ninh-mang',
    label: 'An ninh mạng và PCTP công nghệ cao',
    keywords: ['an ninh mạng', 'công nghệ cao', 'tấn công mạng', 'dữ liệu cá nhân', 'bảo mật', 'hacker', 'mã độc', 'lộ lọt thông tin'],
  },
  {
    id: 'bao-ve-tre-em',
    label: 'Bảo vệ trẻ em trên KGM',
    keywords: ['bảo vệ trẻ em', 'trẻ em', 'xâm hại trẻ em', 'không gian mạng', 'bạo hành trẻ em', 'trẻ vị thành niên'],
  },
  {
    id: 'tu-tap-loi-keo',
    label: 'Tụ tập, lôi kéo, tổ chức đông người',
    keywords: ['lôi kéo', 'kích động', 'tổ chức', 'tụ tập', 'xúi giục', 'tập hợp lực lượng', 'đông người trái phép'],
  },
  {
    id: 'luc-luong-cand',
    label: 'Lực lượng CAND',
    keywords: ['công an nhân dân', 'CAND', 'lực lượng công an', 'chiến sĩ công an', 'cán bộ công an', 'công an tỉnh', 'công an xã'],
  },
  {
    id: 'moi-truong-atttp',
    label: 'Môi trường, an toàn thực phẩm',
    keywords: ['môi trường', 'an toàn thực phẩm', 'ô nhiễm', 'xả thải', 'thực phẩm bẩn', 'vệ sinh an toàn thực phẩm', 'rác thải', 'chất thải'],
  },
  {
    id: 'bao-ve-su-kien',
    label: 'Bảo vệ sự kiện',
    keywords: ['bảo vệ sự kiện', 'bảo vệ an ninh', 'sự kiện chính trị', 'lễ kỷ niệm', 'hội nghị', 'đại hội', 'bảo vệ đoàn'],
  },
  {
    id: 'sap-nhap-xa-phuong',
    label: 'Sáp nhập xã, phường',
    keywords: [
      'sáp nhập',
      'sáp nhập xã',
      'sáp nhập phường',
      'sáp nhập xã phường',
      'sắp xếp đơn vị hành chính',
      'đơn vị hành chính cấp xã',
      'địa giới hành chính',
      'hợp nhất xã',
      'hợp nhất phường',
      'tinh gọn bộ máy',
    ],
  },
  {
    id: 'ban-tin-tong-hop',
    label: 'Bản tin tổng hợp',
    keywords: ['bản tin', 'tổng hợp', 'tin tức', 'thông báo', 'thời sự'],
  },
]

export const newsTopicById = (id?: string): NewsTopic | undefined =>
  id ? NEWS_TOPICS.find((t) => t.id === id) : undefined

export const channelDbValue = (channel: ChannelType): string | null =>
  channel === 'all' ? null : channel === 'ANTT' ? 'ANTT' : 'PhanDong'

export const getStartDate = (timeRange: 'day' | 'week' | 'month' | 'year' | 'all'): Date | null => {
  if (timeRange === 'all') return null
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  switch (timeRange) {
    case 'day':
      break
    case 'week':
      d.setDate(d.getDate() - 6)
      break
    case 'month':
      d.setDate(d.getDate() - 29)
      break
    case 'year':
      d.setDate(d.getDate() - 364)
      break
  }
  return d
}

// Format Date -> chuỗi "YYYY-MM-DDTHH:mm:ss" theo GIỜ LOCAL (không convert UTC).
export const toLocalTimestamp = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

let cachedSourceIds: { ANTT: string[]; PhanDong: string[] } | null = null

export const getChannelSourceIds = async (): Promise<{ ANTT: string[]; PhanDong: string[] }> => {
  if (cachedSourceIds) return cachedSourceIds
  const PARENT_FACEBOOK_PHAN_DONG = 'e9731f2c-b7a8-4696-ab0e-f3263044aed8'
  try {
    const res = await pgRequest<{ data?: Source[] }>('/api/sources?channel=all')
    const data = res.data || []
    const dongIds = data
      .filter(
        (s) =>
          s.parent_id === PARENT_FACEBOOK_PHAN_DONG ||
          s.id === PARENT_FACEBOOK_PHAN_DONG ||
          (s.name && s.name.toLowerCase() === 'facebook phản động')
      )
      .map((s) => s.id)
    const anttIds = data.filter((s) => !dongIds.includes(s.id)).map((s) => s.id)
    cachedSourceIds = { ANTT: anttIds, PhanDong: dongIds }
    return cachedSourceIds
  } catch {
    return { ANTT: [], PhanDong: [] }
  }
}

// ===== PostgreSQL Data Services =====
export const newsService = {
  async getAllNews(limit?: number, channel: ChannelType = 'ANTT'): Promise<NewsItem[]> {
    try {
      const qs = new URLSearchParams()
      const chVal = channelDbValue(channel)
      if (chVal) qs.set('channel', chVal)
      if (limit) qs.set('limit', String(limit))
      const res = await pgRequest<{ data?: NewsItem[] }>(`/api/news?${qs.toString()}`)
      return res.data || []
    } catch (error) {
      console.error('Error fetching news from PostgreSQL:', error)
      return []
    }
  },

  async getPaginatedNews(
    page: number,
    limit: number,
    searchTerm?: string,
    sentimentFilter?: string,
    sourceFilter?: string,
    timeRange?: 'day' | 'week' | 'month' | 'year' | 'all' | 'custom',
    channel: ChannelType = 'ANTT',
    topicId?: string,
    startDateStr?: string,
    endDateStr?: string
  ): Promise<{ data: NewsItem[]; count: number }> {
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      const chVal = channelDbValue(channel)
      if (chVal) qs.set('channel', chVal)

      if (timeRange === 'custom') {
        if (startDateStr) qs.set('startDate', `${startDateStr}T00:00:00`)
        if (endDateStr) qs.set('endDate', `${endDateStr}T23:59:59`)
      } else if (timeRange && timeRange !== 'all') {
        const startDate = getStartDate(timeRange)
        if (startDate) qs.set('startDate', toLocalTimestamp(startDate))
      }

      if (searchTerm?.trim()) qs.set('search', searchTerm.trim())
      if (sentimentFilter && sentimentFilter !== 'all') qs.set('sentiment', sentimentFilter)
      if (sourceFilter && sourceFilter !== 'all') qs.set('source', sourceFilter)

      const topic = newsTopicById(topicId)
      if (topic && topic.keywords.length > 0) {
        qs.set('topicKeywords', topic.keywords.join('|'))
      }

      const res = await pgRequest<{ data?: NewsItem[]; count?: number }>(
        `/api/news/paginated?${qs.toString()}`
      )
      return { data: res.data || [], count: res.count || 0 }
    } catch (error) {
      console.error('Error fetching paginated news from PostgreSQL:', error)
      return { data: [], count: 0 }
    }
  },

  async getDashboardStats(
    channel: ChannelType = 'ANTT'
  ): Promise<{ totalNews: number; todayNews: number; thaibinh: number; hungyen: number; processed: number }> {
    const defaultStats = { totalNews: 0, todayNews: 0, thaibinh: 0, hungyen: 0, processed: 0 }
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const qs = new URLSearchParams({ today: toLocalTimestamp(todayStart) })
      const chVal = channelDbValue(channel)
      if (chVal) qs.set('channel', chVal)
      const res = await pgRequest<{
        totalNews?: number
        todayNews?: number
        thaibinh?: number
        hungyen?: number
        processed?: number
      }>(`/api/news/dashboard-stats?${qs.toString()}`)
      return {
        totalNews: res.totalNews || 0,
        todayNews: res.todayNews || 0,
        thaibinh: res.thaibinh || 0,
        hungyen: res.hungyen || 0,
        processed: res.processed || 0,
      }
    } catch (e) {
      console.error('Lỗi lấy dashboard stats từ PostgreSQL:', e)
      return defaultStats
    }
  },

  async getNewsBySentiment(sentimentName: string, channel: ChannelType = 'ANTT'): Promise<NewsItem[]> {
    try {
      const qs = new URLSearchParams({ sentiment: sentimentName })
      const chVal = channelDbValue(channel)
      if (chVal) qs.set('channel', chVal)
      const res = await pgRequest<{ data?: NewsItem[] }>(`/api/news/by-sentiment?${qs.toString()}`)
      return res.data || []
    } catch (error) {
      console.error('Error fetching news by sentiment:', error)
      return []
    }
  },

  async getNewsBySource(sourceName: string): Promise<NewsItem[]> {
    try {
      const qs = new URLSearchParams({ source: sourceName })
      const res = await pgRequest<{ data?: NewsItem[] }>(`/api/news/by-source?${qs.toString()}`)
      return res.data || []
    } catch (error) {
      console.error('Error fetching news by source:', error)
      return []
    }
  },

  async getSentimentStats(
    timeRange: 'day' | 'week' | 'month' | 'year' | 'all' = 'all',
    channel: ChannelType = 'ANTT'
  ): Promise<{ sentiment: string; count: number }[]> {
    try {
      const qs = new URLSearchParams()
      const chVal = channelDbValue(channel)
      if (chVal) qs.set('channel', chVal)
      if (timeRange !== 'all') {
        const startDate = getStartDate(timeRange)
        if (startDate) qs.set('startDate', toLocalTimestamp(startDate))
      }
      const res = await pgRequest<{ data?: { sentiment: string; count: number }[] }>(
        `/api/news/sentiment-stats?${qs.toString()}`
      )
      return res.data || []
    } catch (error) {
      console.error('Error fetching sentiment stats:', error)
      return []
    }
  },

  async getSourceStats(): Promise<{ source: string; count: number }[]> {
    try {
      const res = await pgRequest<{ data?: { source: string; count: number }[] }>('/api/news/source-stats')
      return res.data || []
    } catch (error) {
      console.error('Error fetching source stats:', error)
      return []
    }
  },

  async getKeywordStats(
    timeRange: 'day' | 'week' | 'month' | 'year' | 'all' = 'week',
    channel: ChannelType = 'ANTT'
  ): Promise<{ keyword: string; count: number }[]> {
    try {
      const qs = new URLSearchParams()
      const chVal = channelDbValue(channel)
      if (chVal) qs.set('channel', chVal)
      if (timeRange !== 'all') {
        const startDate = getStartDate(timeRange)
        if (startDate) qs.set('startDate', toLocalTimestamp(startDate))
      }
      const res = await pgRequest<{ data?: { keyword: string; count: number }[] }>(
        `/api/news/keyword-stats?${qs.toString()}`
      )
      return res.data || []
    } catch (error) {
      console.error('Error fetching keyword stats:', error)
      return []
    }
  },

  async getDailySentimentTrends(channel: ChannelType = 'ANTT'): Promise<SentimentTrend[]> {
    try {
      const qs = new URLSearchParams()
      const chVal = channelDbValue(channel)
      if (chVal) qs.set('channel', chVal)
      const res = await pgRequest<{ data?: SentimentTrend[] }>(`/api/news/daily-trends?${qs.toString()}`)
      return res.data || []
    } catch (error) {
      console.error('Error fetching daily sentiment trends:', error)
      return []
    }
  },

  async getPostsByTimeRange(
    timeRange: 'day' | 'week' | 'month' | 'year' | 'all' = 'all',
    channel: ChannelType = 'ANTT'
  ): Promise<NewsItem[]> {
    try {
      const qs = new URLSearchParams()
      const chVal = channelDbValue(channel)
      if (chVal) qs.set('channel', chVal)
      if (timeRange !== 'all') {
        const startDate = getStartDate(timeRange)
        if (startDate) qs.set('startDate', toLocalTimestamp(startDate))
      }
      const res = await pgRequest<{ data?: NewsItem[] }>(`/api/news/posts-lite?${qs.toString()}`)
      return res.data || []
    } catch (error) {
      console.error('Error fetching posts by time range:', error)
      return []
    }
  },

  async getPostsBetween(startTs: string, endTs: string, channel: ChannelType = 'ANTT'): Promise<NewsItem[]> {
    try {
      const qs = new URLSearchParams({
        startDate: startTs,
        endDate: endTs,
      })
      const chVal = channelDbValue(channel)
      if (chVal) qs.set('channel', chVal)
      const res = await pgRequest<{ data?: NewsItem[] }>(`/api/news/posts-lite?${qs.toString()}`)
      return res.data || []
    } catch (error) {
      console.error('Error fetching posts between range:', error)
      return []
    }
  },

  async getSentimentTrendsByTimeRange(
    timeRange: 'day' | 'week' | 'month' | 'year' | 'all',
    channel: ChannelType = 'ANTT'
  ): Promise<SentimentTrend[]> {
    try {
      const qs = new URLSearchParams()
      const chVal = channelDbValue(channel)
      if (chVal) qs.set('channel', chVal)
      if (timeRange !== 'all') {
        const startDate = getStartDate(timeRange)
        if (startDate) qs.set('startDate', toLocalTimestamp(startDate))
      }
      const res = await pgRequest<{ data?: SentimentTrend[] }>(`/api/news/daily-trends?${qs.toString()}`)
      return res.data || []
    } catch (error) {
      console.error('Error fetching sentiment trends by time range:', error)
      return []
    }
  },
}

export const sourcesService = {
  async getAllSources(channel: ChannelType = 'all'): Promise<Source[]> {
    try {
      const qs = new URLSearchParams({ channel })
      const res = await pgRequest<{ data?: Source[] }>(`/api/sources?${qs.toString()}`)
      return res.data || []
    } catch (error) {
      console.error('Error fetching sources:', error)
      return []
    }
  },

  async getSourcesByType(typeName: string): Promise<Source[]> {
    try {
      const qs = new URLSearchParams({ typeName })
      const res = await pgRequest<{ data?: Source[] }>(`/api/sources?${qs.toString()}`)
      return res.data || []
    } catch (error) {
      console.error('Error fetching sources by type:', error)
      return []
    }
  },

  async addSource(source: Partial<Source>): Promise<{ data: Source | null; error: unknown }> {
    try {
      cachedSourceIds = null
      const res = await pgRequest<{ data?: Source }>('/api/sources', {
        method: 'POST',
        body: JSON.stringify(source),
      })
      return { data: res.data || null, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },

  async updateSource(id: string, updates: Partial<Source>): Promise<{ data: Source | null; error: unknown }> {
    try {
      cachedSourceIds = null
      const res = await pgRequest<{ data?: Source }>(`/api/sources/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
      return { data: res.data || null, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },

  async deleteSource(id: string): Promise<{ error: unknown }> {
    try {
      cachedSourceIds = null
      await pgRequest(`/api/sources/${encodeURIComponent(id)}`, { method: 'DELETE' })
      return { error: null }
    } catch (error) {
      return { error }
    }
  },
}

export const sentimentsService = {
  async getAllSentiments(): Promise<Sentiment[]> {
    try {
      const res = await pgRequest<{ data?: Sentiment[] }>('/api/sentiments')
      return res.data || []
    } catch (error) {
      console.error('Error fetching sentiments:', error)
      return []
    }
  },
}

export const typesService = {
  async getAllTypes(): Promise<SourceType[]> {
    try {
      const res = await pgRequest<{ data?: SourceType[] }>('/api/types')
      return res.data || []
    } catch (error) {
      console.error('Error fetching types:', error)
      return []
    }
  },
}

export const rebuttalsService = {
  async getAllRebuttals(): Promise<Rebuttal[]> {
    try {
      const res = await pgRequest<{ data?: Rebuttal[] }>('/api/rebuttals')
      return res.data || []
    } catch (error) {
      console.error('Error fetching rebuttals:', error)
      return []
    }
  },

  async getRebuttal(id: string): Promise<Rebuttal | null> {
    try {
      const res = await pgRequest<{ data?: Rebuttal | null }>(`/api/rebuttals/${encodeURIComponent(id)}`)
      return res.data || null
    } catch (error) {
      console.error('Error fetching rebuttal:', error)
      return null
    }
  },

  async updateStatus(id: string, status: 'draft' | 'published' | 'error'): Promise<{ error: unknown }> {
    try {
      await pgRequest(`/api/rebuttals/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      return { error: null }
    } catch (error) {
      return { error }
    }
  },

  async updateRebuttal(id: string, updates: Partial<Rebuttal>): Promise<{ error: unknown }> {
    try {
      await pgRequest(`/api/rebuttals/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
      return { error: null }
    } catch (error) {
      return { error }
    }
  },

  async deleteRebuttal(id: string): Promise<{ error: unknown }> {
    try {
      await pgRequest(`/api/rebuttals/${encodeURIComponent(id)}`, { method: 'DELETE' })
      return { error: null }
    } catch (error) {
      return { error }
    }
  },
}

export const createRebuttal = async (payload: {
  title?: string
  content: string
  status?: string
  image_base64?: string
}): Promise<{ id: string | null; error: unknown }> => {
  try {
    const res = await pgRequest<{ data?: Rebuttal }>('/api/rebuttals', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return { id: res.data?.id ?? null, error: null }
  } catch (err) {
    return { id: null, error: err }
  }
}

export const getRebuttalById = async (id: string): Promise<Rebuttal | null> => {
  return rebuttalsService.getRebuttal(id)
}

export const settingsService = {
  async getAllSettings(): Promise<Setting[]> {
    try {
      const res = await pgRequest<{ data?: Setting[] }>('/api/settings')
      return res.data || []
    } catch (error) {
      console.error('Error fetching settings:', error)
      return []
    }
  },

  async updateSetting(key_name: string, setting_value: string): Promise<{ error: unknown }> {
    try {
      await pgRequest(`/api/settings/${encodeURIComponent(key_name)}`, {
        method: 'PATCH',
        body: JSON.stringify({ setting_value }),
      })
      return { error: null }
    } catch (error) {
      return { error }
    }
  },
}

export type TrendChannel = 'ANTT' | 'PhanDong'

export interface TrendReportFilter {
  period?: TrendPeriod
  periodStart?: string
  channel?: TrendChannel
  limit?: number
}

export interface TrendReportPeriodOption {
  period_start: string
  period_end: string
}

export const trendReportsService = {
  async getReports(filter: TrendReportFilter = {}): Promise<TrendReport[]> {
    try {
      const { period, periodStart, channel, limit = 50 } = filter
      const qs = new URLSearchParams({ limit: String(limit) })
      if (period) qs.set('period', period)
      if (periodStart) qs.set('periodStart', periodStart)
      if (channel) qs.set('channel', channel)
      const res = await pgRequest<{ data?: TrendReport[] }>(`/api/trend-reports?${qs.toString()}`)
      return res.data || []
    } catch (error) {
      console.error('Error fetching trend reports:', error)
      return []
    }
  },

  async getReportPeriods(period?: TrendPeriod, channel?: TrendChannel): Promise<TrendReportPeriodOption[]> {
    try {
      const qs = new URLSearchParams()
      if (period) qs.set('period', period)
      if (channel) qs.set('channel', channel)
      const res = await pgRequest<{ data?: TrendReportPeriodOption[] }>(
        `/api/trend-reports/periods?${qs.toString()}`
      )
      return res.data || []
    } catch (error) {
      console.error('Error fetching report periods:', error)
      return []
    }
  },
}
