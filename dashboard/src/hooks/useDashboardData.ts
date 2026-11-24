import { useEffect, useMemo, useRef, useState } from "react";
import { ChannelType, NewsItem, getStartDate, newsService } from "@/lib/supabase";
import { completionPercent, sentimentSummary as summarizeSentiments } from "@/lib/dashboardMetrics.mjs";
import type {
  DailyTrend,
  DashboardStats,
  KeywordStat,
  SentimentStat,
  TimeRangeValue,
} from "@/components/dashboard/types";

export type AnalyticsPayload = Awaited<ReturnType<typeof newsService.getAnalytics>>;

export function useDashboardData(channel: ChannelType, timeRange: TimeRangeValue) {
  const [newsData, setNewsData] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dataError, setDataError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const snapshotKey = useRef("");

  const [stats, setStats] = useState<DashboardStats>({
    totalNews: 0,
    todayNews: 0,
    thaibinh: 0,
    hungyen: 0,
    processed: 0,
  });
  const [sentimentData, setSentimentData] = useState<SentimentStat[]>([]);
  const [keywordData, setKeywordData] = useState<KeywordStat[]>([]);
  const [dailyTrends, setDailyTrends] = useState<DailyTrend[]>([]);
  const [parentSourceData, setParentSourceData] = useState<{ parent: string; count: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    const key = `${channel}:${timeRange}`;
    const sameScope = snapshotKey.current === key;
    setLoading(!sameScope);
    setRefreshing(sameScope);
    setDataError("");

    if (!sameScope) {
      snapshotKey.current = "";
      setNewsData([]);
      setSentimentData([]);
      setDailyTrends([]);
      setKeywordData([]);
      setParentSourceData([]);
      setAnalytics(null);
      setLastUpdated(null);
    }

    (async () => {
      try {
        const [recent, totals, keywords, aggregate] = await Promise.all([
          newsService.getAllNews(50, channel),
          newsService.getDashboardStats(channel),
          newsService.getKeywordStats(timeRange, channel),
          newsService.getAnalytics(timeRange, channel),
        ]);
        if (cancelled) return;

        const byDate = new Map(aggregate.trends.map((row) => [row.date, row]));
        const start = getStartDate(timeRange);
        if (start) {
          const now = new Date();
          for (const date = new Date(start); date <= now; date.setDate(date.getDate() + 1)) {
            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
              date.getDate()
            ).padStart(2, "0")}`;
            if (!byDate.has(dateKey)) {
              byDate.set(dateKey, { date: dateKey, positive: 0, neutral: 0, negative: 0, unknown: 0 });
            }
          }
        }

        const mapped: DailyTrend[] = [...byDate.values()]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((row) => ({
            date: row.date,
            "Tích cực": row.positive,
            "Trung lập": row.neutral,
            "Tiêu cực": row.negative,
            "Chưa phân loại": row.unknown,
          }));

        setNewsData(recent);
        setStats(totals);
        setSentimentData([
          { sentiment: "Tích cực", count: aggregate.current.positive },
          { sentiment: "Trung lập", count: aggregate.current.neutral },
          { sentiment: "Tiêu cực", count: aggregate.current.negative },
          { sentiment: "Unknown", count: aggregate.current.unknown },
        ]);
        setKeywordData(keywords.slice(0, 10));
        setDailyTrends(mapped);
        setParentSourceData(aggregate.sources);
        setAnalytics(aggregate);
        setLastUpdated(new Date());
        snapshotKey.current = key;
      } catch {
        if (!cancelled) {
          setDataError(
            sameScope
              ? "Không thể cập nhật. Đang hiển thị dữ liệu của lần tải thành công gần nhất."
              : "Không tải được dữ liệu. Kiểm tra kết nối và thử lại."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [channel, timeRange, refreshVersion]);

  const refreshData = () => setRefreshVersion((v) => v + 1);

  const sentimentSummary = useMemo(() => summarizeSentiments(sentimentData), [sentimentData]);

  const trendPeriodTotals = useMemo(
    () =>
      dailyTrends.reduce(
        (acc, day) => {
          const pos = day["Tích cực"] || 0;
          const neu = day["Trung lập"] || 0;
          const neg = day["Tiêu cực"] || 0;
          return {
            pos: acc.pos + pos,
            neu: acc.neu + neu,
            neg: acc.neg + neg,
            total: acc.total + pos + neu + neg,
          };
        },
        { pos: 0, neu: 0, neg: 0, total: 0 }
      ),
    [dailyTrends]
  );

  const processedPct = completionPercent(stats.processed, stats.totalNews);

  return {
    newsData,
    loading,
    refreshing,
    lastUpdated,
    dataError,
    refreshVersion,
    refreshData,
    analytics,
    stats,
    sentimentData,
    keywordData,
    dailyTrends,
    parentSourceData,
    sentimentSummary,
    trendPeriodTotals,
    processedPct,
  };
}
