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
