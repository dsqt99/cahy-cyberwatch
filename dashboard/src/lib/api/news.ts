import { pgRequest } from './client'
import { channelDbValue, getStartDate, newsTopicById, toLocalTimestamp } from './topics'
import type { ChannelType, NewsItem, SentimentTrend } from './types'

export const newsService = {
  async getAnalytics(timeRange: 'day' | 'week' | 'month' | 'year' | 'all', channel: ChannelType) {
    const qs = new URLSearchParams()
    const ch = channelDbValue(channel)
    if (ch) qs.set('channel', ch)
    const start = getStartDate(timeRange)
    if (start) qs.set('startDate', toLocalTimestamp(start))
    qs.set('endDate', toLocalTimestamp(new Date()))
    return pgRequest<{
      trends: { date: string; positive: number; neutral: number; negative: number; unknown: number }[]
      sources: { parent: string; count: number; negative: number }[]
      current: { total: number; positive: number; neutral: number; negative: number; unknown: number; classified: number }
      previous: { total: number; negative: number; classified: number } | null
    }>(`/api/news/analytics?${qs}`)
  },

  async getAllNews(limit?: number, channel: ChannelType = 'ANTT'): Promise<NewsItem[]> {
    const qs = new URLSearchParams()
    const chVal = channelDbValue(channel)
    if (chVal) qs.set('channel', chVal)
    if (limit) qs.set('limit', String(limit))
    const res = await pgRequest<{ data?: NewsItem[] }>(`/api/news?${qs.toString()}`)
    return res.data || []
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
    endDateStr?: string,
    sort: 'newest' | 'oldest' = 'newest'
  ): Promise<{ data: NewsItem[]; count: number }> {
    const qs = new URLSearchParams({
      sort,
      page: String(page),
      limit: String(limit),
    })
    const chVal = channelDbValue(channel)
    if (chVal) qs.set('channel', chVal)

    if (timeRange === 'custom') {
      if (startDateStr) qs.set('startDate', `${startDateStr}T00:00:00`)
      if (endDateStr) {
        const nextDay = new Date(`${endDateStr}T00:00:00`)
        nextDay.setDate(nextDay.getDate() + 1)
        qs.set('endDateExclusive', toLocalTimestamp(nextDay))
      }
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

    const res = await pgRequest<{ data?: NewsItem[]; count?: number }>(`/api/news/paginated?${qs.toString()}`)
    return { data: res.data || [], count: res.count || 0 }
  },

  async getDashboardStats(
    channel: ChannelType = 'ANTT'
  ): Promise<{ totalNews: number; todayNews: number; thaibinh: number; hungyen: number; processed: number }> {
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
