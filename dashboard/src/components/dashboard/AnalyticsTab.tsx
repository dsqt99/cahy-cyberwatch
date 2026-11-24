import React from "react";
import { Activity, Hash, PieChart as PieChartIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import KeywordChart from "@/components/KeywordChart";
import ParentSourceDonut from "@/components/ParentSourceDonut";
import { comparisonLabel } from "@/lib/dashboardMetrics.mjs";
import type { ChannelType } from "@/lib/supabase";
import type { AnalyticsPayload } from "@/hooks/useDashboardData";
import { DailyTrend, KeywordStat, SentimentStat, TIME_RANGE_LABELS, TimeRangeValue } from "./types";

interface AnalyticsTabProps {
  loading: boolean;
  channel: ChannelType;
  timeRange: TimeRangeValue;
  analytics: AnalyticsPayload | null;
  dailyTrends: DailyTrend[];
  trendPeriodTotals: { pos: number; neu: number; neg: number; total: number };
  keywordData: KeywordStat[];
  sentimentData: SentimentStat[];
  sentimentSummary: { pos: number; neu: number; neg: number };
  parentSourceData: { parent: string; count: number }[];
  onOpenArticles: (date?: string, sentiment?: string, keyword?: string) => void;
}

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  loading,
  channel,
  timeRange,
  analytics,
  dailyTrends,
  trendPeriodTotals,
  keywordData,
  sentimentData,
  sentimentSummary,
  parentSourceData,
  onOpenArticles,
}) => {
  if (loading) {
    return (
      <p role="status" className="p-5 text-muted-foreground">
        Đang tải phân tích…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            label: "Bài viết trong kỳ",
            value: analytics?.current.total || 0,
            detail: comparisonLabel(analytics?.current.total || 0, analytics?.previous?.total ?? null),
          },
          {
            label: "Bài có sắc thái tiêu cực",
            value: analytics?.current.negative || 0,
            detail: comparisonLabel(analytics?.current.negative || 0, analytics?.previous?.negative ?? null),
          },
          {
            label: "Chưa phân loại",
            value: (analytics?.current.total || 0) - (analytics?.current.classified || 0),
            detail: "Sắc thái không phải mức độ cần xử lý",
          },
        ].map((item) => (
          <div key={item.label} className="surface-panel p-4">
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="my-2 text-2xl font-semibold tabular-nums">{item.value.toLocaleString("vi-VN")}</p>
            <p className="text-xs text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        So sánh với khoảng liền trước có cùng độ dài. Ngày không có bài ghi nhận không xác nhận trạng thái hoạt động của nguồn thu thập.
      </p>

      {/* Time-Series Sentiment Analysis */}
      <div className="surface-panel p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Chuỗi Thời gian Sắc thái Dư luận</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Phân tích biến động trong {TIME_RANGE_LABELS[timeRange].toLowerCase()} trên kênh {channel} ({dailyTrends.length} điểm dữ liệu)
            </p>
          </div>
          <div className="text-left sm:text-right font-mono tabular-nums">
            <div className="text-xl font-bold text-primary">
              {(analytics?.current.total || 0).toLocaleString("vi-VN")}
            </div>
            <div className="text-[11px] text-muted-foreground">bài viết trong kỳ</div>
          </div>
        </div>

        <div className="h-80 w-full">
          {dailyTrends.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
              Chưa có dữ liệu xu hướng cho khoảng thời gian này.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                onClick={(state) => {
                  if (state?.activeLabel) onOpenArticles(String(state.activeLabel));
                }}
                data={dailyTrends}
                margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  tickFormatter={(date) => String(date).slice(5).split("-").reverse().join("/")}
                  dataKey="date"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  fontSize={12}
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
                        <div className="bg-popover text-popover-foreground p-3 border border-border rounded-lg shadow-md text-xs space-y-1.5">
                          <p className="font-mono font-semibold">Ngày {label}</p>
                          {payload.map((entry, index) => (
                            <div key={index} className="flex items-center justify-between gap-4 font-mono tabular-nums">
                              <span style={{ color: entry.color }}>{String(entry.dataKey)}</span>
                              <span>{entry.value} bài</span>
                            </div>
                          ))}
                          <div className="pt-1 border-t border-border flex items-center justify-between gap-4 font-mono font-semibold tabular-nums">
                            <span>Tổng cộng</span>
                            <span>{total} bài</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="linear" dataKey="Tích cực" stroke="#10b981" strokeWidth={2.25} fill="#10b981" fillOpacity={0.12} />
                <Area type="linear" dataKey="Trung lập" stroke="#64748b" strokeWidth={2.25} fill="#64748b" fillOpacity={0.1} />
                <Area type="linear" dataKey="Tiêu cực" stroke="#e11d48" strokeWidth={2.25} fill="#e11d48" fillOpacity={0.14} />
                <Area type="linear" dataKey="Chưa phân loại" stroke="#f59e0b" fillOpacity={0.05} fill="#f59e0b" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 pt-2 border-t border-border text-xs font-mono tabular-nums">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
            <span className="text-muted-foreground">Tích cực:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{trendPeriodTotals.pos}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-slate-500" />
            <span className="text-muted-foreground">Trung lập:</span>
            <span className="font-bold text-foreground">{trendPeriodTotals.neu}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
            <span className="text-muted-foreground">Tiêu cực:</span>
            <span className="font-bold text-rose-600 dark:text-rose-400">{trendPeriodTotals.neg}</span>
          </div>
        </div>
      </div>

      {/* Top Keywords + Sentiment Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 surface-panel p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Hash className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Bảng Xếp hạng Từ khóa Nổi bật</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Top {keywordData.length} cụm từ khóa có mật độ xuất hiện cao nhất
            </p>
          </div>
          <KeywordChart data={keywordData} onSelect={(keyword) => onOpenArticles(undefined, undefined, keyword)} />
        </div>

        <div className="lg:col-span-5 surface-panel p-5 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-primary" strokeWidth={1.75} />
                <span>Phân bổ Sắc thái Toàn diện</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tỷ lệ phần trăm từng nhóm sắc thái trong khung thời gian đang chọn
              </p>
            </div>

            <div className="space-y-4 pt-1">
              {sentimentData.map((item) => {
                const total = sentimentData.reduce((sum, s) => sum + s.count, 0);
                const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
                const barColor =
                  item.sentiment === "Tích cực"
                    ? "bg-emerald-500"
                    : item.sentiment === "Tiêu cực"
                      ? "bg-rose-500"
                      : item.sentiment === "Unknown"
                        ? "bg-amber-500"
                        : "bg-slate-500";
                return (
                  <div key={item.sentiment} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">
                        {item.sentiment === "Unknown" ? "Chưa phân loại" : item.sentiment}
                      </span>
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <span className="text-muted-foreground">{item.count} bài</span>
                        <span className="font-bold text-foreground w-10 text-right">{percentage}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-sm h-2 overflow-hidden">
                      <div className={`h-full rounded-sm ${barColor} transition-all duration-300`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-border grid grid-cols-3 gap-3 text-center">
            <div className="p-2.5 rounded-lg bg-emerald-500/8 border border-emerald-500/20">
              <div className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {sentimentSummary.pos}
              </div>
              <div className="text-[11px] text-muted-foreground">Tích cực</div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/60 border border-border">
              <div className="font-mono text-lg font-bold text-foreground tabular-nums">{sentimentSummary.neu}</div>
              <div className="text-[11px] text-muted-foreground">Trung lập</div>
            </div>
            <div className="p-2.5 rounded-lg bg-rose-500/8 border border-rose-500/20">
              <div className="font-mono text-lg font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                {sentimentSummary.neg}
              </div>
              <div className="text-[11px] text-muted-foreground">Tiêu cực</div>
            </div>
          </div>
        </div>
      </div>

      <div className="surface-panel p-5 space-y-3">
        <h3 className="font-semibold">Nguồn đóng góp trong kỳ</h3>
        <p className="text-xs text-muted-foreground">
          Số bài và số bài tiêu cực theo nền tảng, tính trên toàn bộ dữ liệu trong kỳ.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-3">Nền tảng</th>
                <th className="text-right">Bài viết</th>
                <th className="text-right">Tiêu cực</th>
                <th className="text-right">Tỷ trọng bài</th>
              </tr>
            </thead>
            <tbody>
              {analytics?.sources.map((row) => (
                <tr key={row.parent} className="border-b border-border/50">
                  <td className="py-3">{row.parent}</td>
                  <td className="text-right tabular-nums">{row.count}</td>
                  <td className="text-right tabular-nums">{row.negative}</td>
                  <td className="text-right tabular-nums">
                    {(analytics.current.total ? (row.count / analytics.current.total) * 100 : 0).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ParentSourceDonut data={parentSourceData} />
    </div>
  );
};

export default AnalyticsTab;
