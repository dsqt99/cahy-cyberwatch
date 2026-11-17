import React, { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  newsService,
  trendReportsService,
  channelDbValue,
  NewsItem,
  TrendReport,
  TrendPeriod,
  TrendChannel,
  ChannelType,
  TrendReportPeriodOption,
} from "@/lib/supabase";
import { FileText, BarChart3, Loader2, TrendingUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface KeywordData {
  keyword: string;
  count: number;
}

interface StatsData {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
}

const ComprehensiveReport: React.FC<{ channel: ChannelType }> = ({ channel }) => {
  const reportChannel = (channelDbValue(channel) ?? "ANTT") as TrendChannel;

  const [reportPeriod, setReportPeriod] = useState<TrendPeriod>("day");
  const [reportPeriodStart, setReportPeriodStart] = useState<string>("all");
  const [reportPeriodOptions, setReportPeriodOptions] = useState<TrendReportPeriodOption[]>([]);
  const [reports, setReports] = useState<TrendReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  const [loadingStats, setLoadingStats] = useState(true);
  const [stats, setStats] = useState<StatsData>({
    total: 0,
    positive: 0,
    negative: 0,
    neutral: 0,
  });
  const [keywords, setKeywords] = useState<KeywordData[]>([]);

  useEffect(() => {
    setReportPeriodStart("all");
    void trendReportsService
      .getReportPeriods(reportPeriod, reportChannel)
      .then(setReportPeriodOptions);
  }, [reportPeriod, reportChannel]);

  useEffect(() => {
    const fetchReports = async () => {
      setLoadingReports(true);
      try {
        const data = await trendReportsService.getReports({
          period: reportPeriod,
          channel: reportChannel,
          periodStart: reportPeriodStart === "all" ? undefined : reportPeriodStart,
          limit: 50,
        });
        setReports(data);
      } finally {
        setLoadingReports(false);
      }
    };
    void fetchReports();
  }, [reportPeriod, reportChannel, reportPeriodStart]);

  useEffect(() => {
    const fetchStats = async () => {
      setLoadingStats(true);
      try {
        let data: NewsItem[];
        if (reportPeriodStart === "all") {
          data = await newsService.getPostsByTimeRange("all", channel);
        } else {
          const opt = reportPeriodOptions.find((o) => o.period_start === reportPeriodStart);
          data = opt
            ? await newsService.getPostsBetween(opt.period_start, opt.period_end, channel)
            : [];
        }

        setStats({
          total: data.length,
          positive: data.filter((item) => item.sentiment?.name === "Tích cực").length,
          negative: data.filter((item) => item.sentiment?.name === "Tiêu cực").length,
          neutral: data.filter((item) => item.sentiment?.name === "Trung lập").length,
        });

        const keywordMap = new Map<string, number>();
        data.forEach((item) => {
          if (item.keywords) {
            item.keywords
              .split(",")
              .map((k) => k.trim())
              .forEach((keyword) => {
                if (keyword) keywordMap.set(keyword, (keywordMap.get(keyword) || 0) + 1);
              });
          }
        });
        setKeywords(
          Array.from(keywordMap.entries())
            .map(([keyword, count]) => ({ keyword, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20)
        );
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoadingStats(false);
      }
    };
    void fetchStats();
  }, [channel, reportPeriodStart, reportPeriodOptions]);

  const periodLabel = (p: TrendPeriod) =>
    p === "day" ? "Ngày" : p === "week" ? "Tuần" : "Tháng";

  const formatRange = (r: { period_start: string; period_end: string }) => {
    const d = (dt: Date) =>
      dt.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    const start = new Date(r.period_start);
    const lastDay = new Date(new Date(r.period_end).getTime() - 1);
    return `${d(start)} 00h - ${d(lastDay)} 24h`;
  };

  const periodOptionLabel = (o: TrendReportPeriodOption) => {
    if (reportPeriod === "day") {
      return new Date(o.period_start).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
    return formatRange(o);
  };

  const currentPeriodLabel = () => {
    if (reportPeriodStart === "all") return "tất cả các kỳ";
    const opt = reportPeriodOptions.find((o) => o.period_start === reportPeriodStart);
    return opt ? formatRange(opt) : "";
  };

  return (
    <div className="space-y-5">
      {/* Filter & Period Summary Card */}
      <div className="surface-panel p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" strokeWidth={1.75} />
              <span>Báo cáo Tổng hợp & Phân tích Xu hướng</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tổng hợp dữ liệu định kỳ do luồng AI n8n biên soạn cho kênh {channel}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Chu kỳ báo cáo</Label>
              <Select
                value={reportPeriod}
                onValueChange={(v) => setReportPeriod(v as TrendPeriod)}
              >
                <SelectTrigger className="w-40 h-9 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Báo cáo ngày</SelectItem>
                  <SelectItem value="week">Báo cáo tuần</SelectItem>
                  <SelectItem value="month">Báo cáo tháng</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Kỳ dữ liệu</Label>
              <Select value={reportPeriodStart} onValueChange={setReportPeriodStart}>
                <SelectTrigger className="w-56 h-9 text-xs bg-background font-mono">
                  <SelectValue placeholder="Tất cả các kỳ" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">Tất cả các kỳ</SelectItem>
                  {reportPeriodOptions.map((o) => (
                    <SelectItem key={o.period_start} value={o.period_start}>
                      {periodOptionLabel(o)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Telemetry Strip for Selected Period */}
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
            <span>Phạm vi thống kê:</span>
            <span className="font-mono text-foreground font-medium">{currentPeriodLabel()}</span>
            {loadingStats && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-lg bg-muted/45 border border-border">
              <div className="text-xs text-muted-foreground font-medium">Tổng bài viết</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-foreground mt-1">
                {stats.total}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Toàn kỳ báo cáo</div>
            </div>
            <div className="p-4 rounded-lg bg-muted/45 border border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Tích cực</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                {stats.positive}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground tabular-nums mt-0.5">
                {stats.total > 0 ? Math.round((stats.positive / stats.total) * 100) : 0}% tỷ trọng
              </div>
            </div>
            <div className="p-4 rounded-lg bg-muted/45 border border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Trung lập</span>
                <span className="w-2 h-2 rounded-full bg-slate-400" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-foreground mt-1">
                {stats.neutral}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground tabular-nums mt-0.5">
                {stats.total > 0 ? Math.round((stats.neutral / stats.total) * 100) : 0}% tỷ trọng
              </div>
            </div>
            <div className="p-4 rounded-lg bg-muted/45 border border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Tiêu cực</span>
                <span className="w-2 h-2 rounded-full bg-rose-500" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1">
                {stats.negative}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground tabular-nums mt-0.5">
                {stats.total > 0 ? Math.round((stats.negative / stats.total) * 100) : 0}% tỷ trọng
              </div>
            </div>
          </div>

          <div className="pt-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground mb-2.5">
              <BarChart3 className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
              <span>Từ khóa xuất hiện nhiều trong kỳ</span>
            </div>
            {keywords.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                Chưa ghi nhận từ khóa nổi bật trong kỳ này.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((kw, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="rounded-md font-normal text-xs px-2.5 py-0.5 gap-1.5"
                  >
                    <span>{kw.keyword}</span>
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {kw.count}
                    </span>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rendered Markdown Reports */}
      {loadingReports ? (
        <div className="surface-panel p-8 space-y-3">
          <div className="h-4 w-56 rounded bg-muted animate-pulse" />
          <div className="h-3 w-full rounded bg-muted animate-pulse" />
          <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
        </div>
      ) : reports.length === 0 ? (
        <div className="surface-panel p-10 text-center space-y-1.5">
          <p className="text-sm font-semibold text-foreground">
            Chưa có bản báo cáo tổng hợp cho bộ lọc này
          </p>
          <p className="text-xs text-muted-foreground">
            Bạn có thể kích hoạt sinh báo cáo tức thời tại mục Điều khiển n8n hoặc chờ lịch tự động.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <article key={report.id} className="surface-panel p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-border">
                <div className="space-y-0.5">
                  <h3 className="font-bold text-sm text-foreground">
                    {report.title || `Báo cáo định kỳ (${periodLabel(report.period).toLowerCase()})`}
                  </h3>
                  <div className="font-mono text-xs text-muted-foreground tabular-nums">
                    {formatRange(report)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="rounded-md text-xs">
                    Kỳ {periodLabel(report.period)}
                  </Badge>
                  {report.stats && (
                    <>
                      <Badge variant="secondary" className="rounded-md font-mono text-xs tabular-nums">
                        Tổng: {report.stats.total}
                      </Badge>
                      <span className="px-2 py-0.5 rounded-md text-xs font-mono tabular-nums bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                        +{report.stats.positive}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-xs font-mono tabular-nums bg-muted text-muted-foreground border border-border">
                        ={report.stats.neutral}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-xs font-mono tabular-nums bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                        -{report.stats.negative}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="bg-muted/25 border border-border rounded-lg p-5 max-h-[620px] overflow-y-auto">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  className="prose prose-sm prose-slate dark:prose-invert max-w-none"
                  components={{
                    table: ({ ...props }) => (
                      <div className="overflow-x-auto my-4 border border-border rounded-lg">
                        <table className="w-full text-left border-collapse text-xs" {...props} />
                      </div>
                    ),
                    th: ({ ...props }) => (
                      <th
                        className="p-2.5 border-b border-border bg-muted font-semibold text-foreground"
                        {...props}
                      />
                    ),
                    td: ({ ...props }) => (
                      <td
                        className="p-2.5 border-b border-border/60 text-muted-foreground"
                        {...props}
                      />
                    ),
                    tr: ({ ...props }) => (
                      <tr className="hover:bg-muted/40 transition-colors" {...props} />
                    ),
                    a: ({ ...props }) => (
                      <a
                        className="text-primary hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                        {...props}
                      />
                    ),
                  }}
                >
                  {report.content}
                </ReactMarkdown>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default ComprehensiveReport;
