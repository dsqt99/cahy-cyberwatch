import { pgRequest } from './client'
import type { ChannelType, Sentiment, Source, SourceType } from './types'

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
