import { pgRequest } from './client'
import type {
  Rebuttal,
  Setting,
  TrendChannel,
  TrendPeriod,
  TrendReport,
  TrendReportFilter,
  TrendReportPeriodOption,
} from './types'

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
