import React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Database,
  ExternalLink,
  Radio,
  Workflow,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import KeywordChart from "@/components/KeywordChart";
import type { ChannelType, NewsItem } from "@/lib/supabase";
import {
  ActiveViewId,
  DailyTrend,
  DashboardStats,
  KeywordStat,
  TIME_RANGE_LABELS,
  TimeRangeValue,
  formatDateTimeVi,
  getSentimentBadgeClass,
} from "./types";

interface SentimentSummary {
  pos: number;
  neu: number;
  neg: number;
  unknown: number;
  total: number;
  posPct: number;
  neuPct: number;
  negPct: number;
  unknownPct: number;
}

interface OverviewTabProps {
  loading: boolean;
  channel: ChannelType;
  timeRange: TimeRangeValue;
  stats: DashboardStats;
  processedPct: number;
  sentimentSummary: SentimentSummary;
  trendPeriodTotals: { pos: number; neu: number; neg: number; total: number };
  dailyTrends: DailyTrend[];
  newsData: NewsItem[];
  keywordData: KeywordStat[];
  onSetTimeRange: (range: TimeRangeValue) => void;
  onSetActiveTab: (tab: ActiveViewId) => void;
  onOpenArticles: (date?: string, sentiment?: string, keyword?: string) => void;
}

const OverviewTab: React.FC<OverviewTabProps> = ({
  loading,
  channel,
  timeRange,
  stats,
  processedPct,
  sentimentSummary,
  trendPeriodTotals,
  dailyTrends,
  newsData,
  keywordData,
  onSetTimeRange,
  onSetActiveTab,
  onOpenArticles,
}) => {
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="doppelrand-shell">
              <div className="doppelrand-core h-32 space-y-3">
                <div className="h-3.5 w-32 rounded bg-muted" />
                <div className="h-7 w-24 rounded bg-muted" />
                <div className="h-3 w-40 rounded bg-muted/70" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-8 doppelrand-shell">
            <div className="doppelrand-core h-80" />
          </div>
          <div className="xl:col-span-4 doppelrand-shell">
            <div className="doppelrand-core h-80" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
        {[
          {
            label: "Tổng tin thu thập",
            value: stats.totalNews,
            icon: Database,
            meta: `Kênh ${channel === "ANTT" ? "ANTT" : "Phản động"}`,
          },
          {
            label: "Hôm nay",
            value: stats.todayNews,
            icon: Radio,
            meta: "Từ 00:00 theo ngày đăng",
          },
          {
            label: "Đã tóm tắt",
            value: stats.processed,
            icon: CheckCircle2,
            meta: `${processedPct.toLocaleString("vi-VN")}% · còn ${Math.max(0, stats.totalNews - stats.processed)}`,
          },
          {
            label: "Tin tiêu cực",
            value: sentimentSummary.neg,
            icon: AlertTriangle,
            meta: `${sentimentSummary.negPct.toFixed(1)}% · ${TIME_RANGE_LABELS[timeRange].toLowerCase()}`,
            danger: true,
          },
        ].map(({ label, value, icon: Icon, meta, danger }) => (
          <div key={label} className="rounded-xl border border-border/70 bg-card p-4 flex flex-col justify-between gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground truncate">{label}</span>
              <Icon
                className={`w-3.5 h-3.5 shrink-0 ${danger ? "text-rose-500" : "text-muted-foreground/70"}`}
                strokeWidth={1.75}
                aria-hidden
              />
            </div>
            <div
              className={`text-2xl leading-none font-semibold tracking-tight tabular-nums ${
                danger && value > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
              }`}
            >
              {value.toLocaleString("vi-VN")}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{meta}</p>
          </div>
        ))}
      </section>

      {/* Analytics Row */}
      {sentimentSummary.total === 0 ? (
        <section className="rounded-xl border border-dashed border-border/80 bg-card/50 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-muted/70 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Chưa có bài viết trong {TIME_RANGE_LABELS[timeRange].toLowerCase()}
              </p>
              <p className="text-xs text-muted-foreground">
                Chuyển sang khoảng thời gian rộng hơn hoặc chạy luồng thu thập mới.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {timeRange !== "month" && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onSetTimeRange("month")}>
                30 ngày qua
              </Button>
            )}
            {timeRange !== "all" && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onSetTimeRange("all")}>
                Toàn bộ
              </Button>
            )}
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => onSetActiveTab("workflows")}>
              <Workflow className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
              Thu thập
            </Button>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-8 rounded-xl border border-border/70 bg-card p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Diễn biến sắc thái
                <span className="ml-2 text-xs font-normal text-muted-foreground">{TIME_RANGE_LABELS[timeRange]}</span>
              </h2>
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
                {[
                  { name: "Tích cực", n: trendPeriodTotals.pos, dot: "bg-emerald-500" },
                  { name: "Trung lập", n: trendPeriodTotals.neu, dot: "bg-slate-400 dark:bg-slate-500" },
                  { name: "Tiêu cực", n: trendPeriodTotals.neg, dot: "bg-rose-500" },
                ].map(({ name, n, dot }) => (
                  <li key={name} className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className={`w-2 h-2 rounded-sm ${dot}`} aria-hidden />
                    {name}
                    <span className="font-medium text-foreground">{n.toLocaleString("vi-VN")}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="h-56 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  onClick={(state) => {
                    if (state?.activeLabel) onOpenArticles(String(state.activeLabel));
                  }}
                  data={dailyTrends}
                  margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gradPos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradNeu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#64748b" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradNeg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.6)" />
                  <XAxis
                    tickFormatter={(date) => String(date).slice(5).split("-").reverse().join("/")}
                    dataKey="date"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <RechartsTooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const total = payload.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
                        return (
                          <div className="bg-popover/95 backdrop-blur-xl text-popover-foreground p-3.5 border border-border/80 rounded-xl shadow-2xl text-xs space-y-2">
                            <p className="font-mono font-bold text-foreground">Ngày {label}</p>
                            {payload.map((entry, idx) => (
                              <div key={idx} className="flex items-center justify-between gap-5 font-mono tabular-nums">
                                <span style={{ color: entry.color }} className="font-bold">
                                  {String(entry.dataKey)}
                                </span>
                                <span className="font-bold">{entry.value} bài</span>
                              </div>
                            ))}
                            <div className="pt-1.5 border-t border-border flex items-center justify-between gap-5 font-mono font-extrabold tabular-nums">
                              <span>Tổng số bài</span>
                              <span className="text-primary">{total} bài</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area type="linear" dataKey="Tích cực" stroke="#10b981" strokeWidth={2.5} fillOpacity={0.25} fill="url(#gradPos)" />
                  <Area type="linear" dataKey="Trung lập" stroke="#64748b" strokeWidth={2.5} fillOpacity={0.25} fill="url(#gradNeu)" />
                  <Area type="linear" dataKey="Tiêu cực" stroke="#ef4444" strokeWidth={2.5} fillOpacity={0.25} fill="url(#gradNeg)" />
                  <Area type="linear" dataKey="Chưa phân loại" stroke="#f59e0b" fillOpacity={0.05} fill="#f59e0b" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="xl:col-span-4 rounded-xl border border-border/70 bg-card p-5 flex flex-col justify-between gap-4">
            <div className="space-y-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">Tỷ trọng sắc thái</h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {sentimentSummary.total.toLocaleString("vi-VN")} bài
                </span>
              </div>

              <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex gap-0.5" aria-hidden>
                <div className="bg-emerald-500 h-full" style={{ width: `${sentimentSummary.posPct}%` }} />
                <div className="bg-slate-400 dark:bg-slate-500 h-full" style={{ width: `${sentimentSummary.neuPct}%` }} />
                <div className="bg-rose-500 h-full" style={{ width: `${sentimentSummary.negPct}%` }} />
                <div className="bg-amber-500 h-full" style={{ width: `${sentimentSummary.unknownPct}%` }} />
              </div>

              <dl className="divide-y divide-border/60 text-[13px]">
                {[
                  { name: "Tích cực", n: sentimentSummary.pos, pct: sentimentSummary.posPct, dot: "bg-emerald-500" },
                  { name: "Trung lập", n: sentimentSummary.neu, pct: sentimentSummary.neuPct, dot: "bg-slate-400 dark:bg-slate-500" },
                  { name: "Tiêu cực", n: sentimentSummary.neg, pct: sentimentSummary.negPct, dot: "bg-rose-500" },
                  { name: "Chưa phân loại", n: sentimentSummary.unknown, pct: sentimentSummary.unknownPct, dot: "bg-amber-500" },
                ].map(({ name, n, pct, dot }) => (
                  <div key={name} className="flex items-center justify-between py-2.5">
                    <dt className="flex items-center gap-2 text-foreground">
                      <span className={`w-2 h-2 rounded-sm ${dot}`} aria-hidden />
                      {name}
                    </dt>
                    <dd className="tabular-nums text-muted-foreground">
                      <span className="font-medium text-foreground">{n.toLocaleString("vi-VN")}</span>
                      <span className="ml-1.5 inline-block w-10 text-right">
                        {pct.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      )}

      {/* Latest Feed + Top Keywords */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div
          className={`${
            keywordData.length > 0 ? "xl:col-span-7" : "xl:col-span-12"
          } rounded-xl border border-border/70 bg-card p-5 space-y-3`}
        >
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border/60">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-foreground">Tin mới nhất</h2>
              <span className="text-xs text-muted-foreground">6 bài gần nhất</span>
            </div>
            <button
              type="button"
              onClick={() => onSetActiveTab("articles")}
              className="inline-flex items-center gap-1 h-7 -mr-1.5 px-2 rounded-md text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              Xem tất cả
              <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>

          {newsData.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
              Chưa có bài viết nào trên kênh {channel}.
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {newsData.slice(0, 6).map((item) => {
                const title =
                  item.content && item.content.trim()
                    ? item.content.substring(0, 140) + (item.content.length > 140 ? "..." : "")
                    : item.summary || "Không có nội dung tóm tắt";
                const sName = item.sentiment?.name || "Chưa phân loại";

                return (
                  <div
                    key={item.id}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 hover:bg-muted/35 rounded-lg px-2 -mx-2 transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground/90 truncate max-w-[220px]">
                          {item.source?.name || "Nguồn tin"}
                        </span>
                        <span>·</span>
                        <span className="font-mono tabular-nums shrink-0">{formatDateTimeVi(item.publish_date)}</span>
                      </div>
                      <p className="text-xs text-foreground/90 line-clamp-1">{title}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${getSentimentBadgeClass(sName)}`}
                      >
                        {sName}
                      </Badge>
                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                          title="Mở bài gốc"
                        >
                          <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {keywordData.length > 0 && (
          <div className="xl:col-span-5 rounded-xl border border-border/70 bg-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border/60">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-foreground">Từ khóa nổi bật</h2>
                <span className="text-xs text-muted-foreground">{TIME_RANGE_LABELS[timeRange]}</span>
              </div>
              <button
                type="button"
                onClick={() => onSetActiveTab("analytics")}
                className="inline-flex items-center gap-1 h-7 -mr-1.5 px-2 rounded-md text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                Chi tiết
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </div>

            <KeywordChart
              data={keywordData.slice(0, 7)}
              onSelect={(keyword) => onOpenArticles(undefined, undefined, keyword)}
            />
          </div>
        )}
      </section>
    </div>
  );
};

export default OverviewTab;
