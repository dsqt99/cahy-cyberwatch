"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Activity,
  FileSpreadsheet,
  ShieldAlert,
  Workflow,
  Database,
  RefreshCw,
  Search,
  ExternalLink,
  Calendar,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Radio,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Menu,
  X,
  ArrowUpRight,
  RotateCcw,
  Hash,
  PieChart as PieChartIcon,
  Bot,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { getParentSourceInfo, getParentSourceName } from "@/lib/parentSourceUtils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  newsService,
  sourcesService,
  NewsItem,
  ChannelType,
  signOut,
  getStartDate,
  NEWS_TOPICS,
} from "@/lib/supabase";
import { useAppTheme } from "@/lib/theme";
import { isDesktopApp } from "@/lib/desktopBridge";
import KeywordChart from "@/components/KeywordChart";
import ParentSourceDonut from "@/components/ParentSourceDonut";
import ComprehensiveReport from "@/components/AlertReport";
import SourceManagement from "@/components/SourceManagement";
import RebuttalManagement from "@/components/RebuttalManagement";
import WorkflowControlCenter from "@/components/WorkflowControlCenter";

type ActiveViewId =
  | "overview"
  | "articles"
  | "analytics"
  | "alerts"
  | "rebuttals"
  | "workflows"
  | "sources";

type TimeRangeValue = "day" | "week" | "month" | "year" | "all";

type SentimentStat = { sentiment: string; count: number };
type KeywordStat = { keyword: string; count: number };
type DailyTrend = {
  date: string;
  "Tích cực": number;
  "Trung lập": number;
  "Tiêu cực": number;
};

const TIME_RANGE_LABELS: Record<TimeRangeValue, string> = {
  day: "24 giờ qua",
  week: "7 ngày qua",
  month: "30 ngày qua",
  year: "365 ngày qua",
  all: "Toàn thời gian",
};

const VIEW_META: Record<
  ActiveViewId,
  { title: string; subtitle: string }
> = {
  overview: {
    title: "Tổng quan",
    subtitle: "Lưu lượng tin, sắc thái và tín hiệu mới",
  },
  articles: {
    title: "Bài viết",
    subtitle: "Tra cứu, lọc và kiểm chứng bằng chứng",
  },
  analytics: {
    title: "Phân tích",
    subtitle: "Xu hướng sắc thái, từ khóa và nền tảng",
  },
  alerts: {
    title: "Báo cáo",
    subtitle: "Số liệu định kỳ và xuất báo cáo tham mưu",
  },
  rebuttals: {
    title: "Phản bác",
    subtitle: "Hồ sơ tin xấu độc và kết quả xử lý",
  },
  workflows: {
    title: "Tự động hóa",
    subtitle: "Luồng thu thập n8n và chụp bằng chứng",
  },
  sources: {
    title: "Nguồn tin",
    subtitle: "Trang báo, hội nhóm và kênh giám sát",
  },
};

const VIEW_ICONS: Record<
  ActiveViewId,
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  overview: LayoutDashboard,
  articles: FileText,
  analytics: Activity,
  alerts: FileSpreadsheet,
  rebuttals: ShieldAlert,
  workflows: Workflow,
  sources: Database,
};

function getSentimentBadgeClass(sentiment?: string): string {
  switch (sentiment) {
    case "Tích cực":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25";
    case "Tiêu cực":
      return "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25";
    default:
      return "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/25";
  }
}

function formatDateTimeVi(dateString: string): string {
  if (!dateString) return "N/A";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================================
// PostsList: High-density server-paginated article stream (preserves filter focus)
// ============================================================================
const PostsList: React.FC<{ channel: ChannelType }> = ({ channel }) => {
  const [posts, setPosts] = useState<NewsItem[]>([]);
  const [totalPostsCount, setTotalPostsCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [startDateStr, setStartDateStr] = useState("");
  const [endDateStr, setEndDateStr] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpPage, setJumpPage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [uniqueSources, setUniqueSources] = useState<string[]>([]);
  const postsPerPage = 10;

  useEffect(() => {
    const fetchSources = async () => {
      const sources = await sourcesService.getAllSources(channel);
      setUniqueSources(sources.map((s) => s.name).filter(Boolean));
    };
    fetchSources();
  }, [channel]);

  useEffect(() => {
    const fetchPosts = async () => {
      setIsLoading(true);
      try {
        const { data, count } = await newsService.getPaginatedNews(
          currentPage,
          postsPerPage,
          searchTerm,
          sentimentFilter === "all" ? undefined : sentimentFilter,
          sourceFilter === "all" ? undefined : sourceFilter,
          "custom",
          channel,
          topicFilter === "all" ? undefined : topicFilter,
          startDateStr,
          endDateStr
        );
        setPosts(data);
        setTotalPostsCount(count);
      } catch (error) {
        console.error("Lỗi khi tải dữ liệu bài viết:", error);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      fetchPosts();
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [
    currentPage,
    searchTerm,
    sentimentFilter,
    sourceFilter,
    topicFilter,
    startDateStr,
    endDateStr,
    channel,
  ]);

  const handleFilterChange = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    value: string
  ) => {
    setter(value);
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchTerm.trim() !== "" ||
    sentimentFilter !== "all" ||
    sourceFilter !== "all" ||
    topicFilter !== "all" ||
    startDateStr !== "" ||
    endDateStr !== "";

  const resetFilters = () => {
    setSearchTerm("");
    setSentimentFilter("all");
    setSourceFilter("all");
    setTopicFilter("all");
    setStartDateStr("");
    setEndDateStr("");
    setCurrentPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalPostsCount / postsPerPage));

  return (
    <div className="space-y-4">
      {/* Filter Command Toolbar */}
      <div className="surface-panel p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3">
          <div className="relative xl:col-span-4">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              strokeWidth={1.75}
            />
            <Input
              placeholder="Tìm theo nội dung, tóm tắt hoặc từ khóa..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleFilterChange(setSearchTerm, e.target.value)
              }
              className="pl-9 pr-8 h-9 text-sm bg-background"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => handleFilterChange(setSearchTerm, "")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Xóa từ khóa tìm kiếm"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 xl:col-span-3">
            <Input
              type="date"
              value={startDateStr}
              onChange={(e) => {
                setStartDateStr(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 text-xs font-mono tabular-nums bg-background"
              aria-label="Từ ngày"
            />
            <span className="text-muted-foreground text-xs shrink-0">đến</span>
            <Input
              type="date"
              value={endDateStr}
              onChange={(e) => {
                setEndDateStr(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 text-xs font-mono tabular-nums bg-background"
              aria-label="Đến ngày"
            />
          </div>

          <div className="xl:col-span-2">
            <Select
              value={sentimentFilter}
              onValueChange={(value: string) =>
                handleFilterChange(setSentimentFilter, value)
              }
            >
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="Sắc thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả sắc thái</SelectItem>
                <SelectItem value="Tích cực">Tích cực</SelectItem>
                <SelectItem value="Trung lập">Trung lập</SelectItem>
                <SelectItem value="Tiêu cực">Tiêu cực</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="xl:col-span-3 flex items-center gap-2">
            <Select
              value={sourceFilter}
              onValueChange={(value: string) =>
                handleFilterChange(setSourceFilter, value)
              }
            >
              <SelectTrigger className="h-9 text-xs bg-background flex-1">
                <SelectValue placeholder="Nguồn đăng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả nguồn ({uniqueSources.length})</SelectItem>
                {uniqueSources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={topicFilter}
              onValueChange={(value: string) =>
                handleFilterChange(setTopicFilter, value)
              }
            >
              <SelectTrigger className="h-9 text-xs bg-background flex-1">
                <SelectValue placeholder="Chủ đề" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả chủ đề</SelectItem>
                {NEWS_TOPICS.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              Hiển thị{" "}
              <strong className="font-mono text-foreground tabular-nums">
                {posts.length}
              </strong>{" "}
              /{" "}
              <strong className="font-mono text-foreground tabular-nums">
                {totalPostsCount.toLocaleString("vi-VN")}
              </strong>{" "}
              bản ghi
            </span>
            <span className="text-border">|</span>
            <span className="font-mono tabular-nums">
              Trang {currentPage}/{totalPages}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-7 px-2.5 text-xs text-primary hover:text-primary"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.75} />
                Đặt lại bộ lọc
              </Button>
            )}
            <div className="flex items-center gap-1.5 font-mono tabular-nums">
              <Calendar className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>Đồng bộ: {formatDateTimeVi(new Date().toISOString())}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Article Rows or Skeleton Placeholders */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div
              key={idx}
              className="surface-panel p-4 space-y-3 animate-pulse"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="h-3.5 w-52 rounded bg-muted" />
                <div className="h-5 w-20 rounded bg-muted" />
              </div>
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3.5 w-full rounded bg-muted/70" />
              <div className="flex gap-2">
                <div className="h-5 w-16 rounded bg-muted" />
                <div className="h-5 w-20 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="surface-panel p-12 text-center space-y-2">
          <FileText
            className="h-8 w-8 text-muted-foreground mx-auto"
            strokeWidth={1.75}
          />
          <p className="text-sm font-semibold text-foreground">
            Không tìm thấy bài viết phù hợp
          </p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Thử điều chỉnh từ khóa tìm kiếm, khoảng thời gian hoặc đặt lại bộ lọc để xem toàn bộ dữ liệu trên kênh {channel}.
          </p>
          {hasActiveFilters && (
            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetFilters}
              >
                Xóa bộ lọc hiện tại
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const parentInfo = getParentSourceInfo(post.source?.parent_id);
            const ParentIcon = parentInfo?.icon;
            const headline =
              post.content && post.content.trim()
                ? post.content.substring(0, 140) +
                  (post.content.length > 140 ? "..." : "")
                : post.summary && post.summary.trim()
                  ? post.summary.substring(0, 140) +
                    (post.summary.length > 140 ? "..." : "")
                  : "Không có tiêu đề nội dung";
            const sentimentName = post.sentiment?.name || "Trung lập";

            return (
              <article
                key={post.id}
                className="surface-panel p-4 hover:border-primary/40 transition-colors"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {parentInfo && ParentIcon && (
                        <span className="inline-flex items-center gap-1 font-medium text-foreground/85 bg-muted px-2 py-0.5 rounded">
                          <ParentIcon className="h-3 w-3 text-primary" />
                          <span>{parentInfo.name}</span>
                        </span>
                      )}
                      <span className="font-semibold text-foreground">
                        {post.source?.name || "Nguồn chưa định danh"}
                      </span>
                      <span className="text-border">•</span>
                      <span className="font-mono tabular-nums">
                        {formatDateTimeVi(post.publish_date)}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                      {headline}
                    </h3>

                    {post.summary && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {post.summary}
                      </p>
                    )}

                    {post.keywords && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {post.keywords
                          .split(",")
                          .map((kw) => kw.trim())
                          .filter(Boolean)
                          .slice(0, 5)
                          .map((keyword, idx) => (
                            <span
                              key={`${keyword}-${idx}`}
                              className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border/60"
                            >
                              #{keyword}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>

                  <div className="flex lg:flex-col items-center lg:items-end justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-semibold px-2.5 py-0.5 ${getSentimentBadgeClass(
                          sentimentName
                        )}`}
                      >
                        {sentimentName}
                      </Badge>

                      {post.link && (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="h-7 px-2.5 text-xs"
                        >
                          <a
                            href={post.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Mở liên kết gốc"
                          >
                            <span className="mr-1">Nguồn</span>
                            <ExternalLink
                              className="h-3.5 w-3.5"
                              strokeWidth={1.75}
                            />
                          </a>
                        </Button>
                      )}
                    </div>

                    {post.screenshot && post.screenshot.startsWith("http") && (
                      <button
                        type="button"
                        onClick={() => window.open(post.screenshot, "_blank")}
                        className="group relative overflow-hidden rounded-md border border-border w-36 h-20 bg-muted shrink-0"
                        title="Xem ảnh chụp bằng chứng kích thước đầy đủ"
                      >
                        <img
                          src={post.screenshot}
                          alt="Ảnh chụp bài viết"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          onError={(e) => {
                            e.currentTarget.parentElement?.classList.add("hidden");
                          }}
                        />
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-background/90 text-[10px] font-mono text-foreground border border-border">
                          Ảnh chụp
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Server Pagination Controls */}
      {totalPages > 1 && (
        <div className="surface-panel p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="h-8 px-2.5 text-xs"
            >
              Đầu
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="h-8 px-2.5 text-xs"
            >
              Trước
            </Button>

            <div className="flex items-center px-1.5 mx-1 border-x border-border">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = currentPage - 2 + i;
                if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                }
                pageNum = Math.max(1, Math.min(pageNum, totalPages));

                if (i > 0 && pageNum <= i) return null;
                if (totalPages < 5 && i >= totalPages) return null;

                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className="w-8 h-8 mx-0.5 p-0 font-mono text-xs tabular-nums"
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className="h-8 px-2.5 text-xs"
            >
              Sau
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="h-8 px-2.5 text-xs"
            >
              Cuối
            </Button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Chuyển tới trang</span>
            <Input
              type="number"
              min={1}
              max={totalPages}
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const page = parseInt(jumpPage, 10);
                  if (!Number.isNaN(page) && page >= 1 && page <= totalPages) {
                    setCurrentPage(page);
                    setJumpPage("");
                  }
                }
              }}
              className="w-14 h-8 text-center font-mono text-xs px-1 hide-arrows bg-background tabular-nums"
            />
            <span className="font-mono text-muted-foreground tabular-nums">
              / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const page = parseInt(jumpPage, 10);
                if (!Number.isNaN(page) && page >= 1 && page <= totalPages) {
                  setCurrentPage(page);
                  setJumpPage("");
                }
              }}
              className="h-8 px-3 text-xs"
            >
              Đi
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main Desktop Command Layout: Collapsible Rail + Slim Topbar + Bento Canvas
// ============================================================================
const Index: React.FC = () => {
  const [newsData, setNewsData] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [newArticlesCount, setNewArticlesCount] = useState(0);
  const [activeTab, setActiveTab] = useState<ActiveViewId>("overview");
  const CurrentViewIcon = VIEW_ICONS[activeTab] || LayoutDashboard;
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("cahy_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [channel, setChannel] = useState<ChannelType>(() => {
    return (localStorage.getItem("current_channel") as ChannelType) || "ANTT";
  });

  const navigate = useNavigate();
  const { theme, toggleTheme } = useAppTheme();
  const userRole = sessionStorage.getItem("userRole");
  const userEmail = sessionStorage.getItem("userEmail");
  const inDesktop = isDesktopApp();

  const [stats, setStats] = useState({
    totalNews: 0,
    todayNews: 0,
    thaibinh: 0,
    hungyen: 0,
    processed: 0,
  });
  const [sentimentData, setSentimentData] = useState<SentimentStat[]>([]);
  const [keywordData, setKeywordData] = useState<KeywordStat[]>([]);
  const [dailyTrends, setDailyTrends] = useState<DailyTrend[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRangeValue>("week");
  const [parentSourceData, setParentSourceData] = useState<
    { parent: string; count: number }[]
  >([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem("current_channel", channel);
  }, [channel]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "cahy_sidebar_collapsed",
        sidebarCollapsed ? "1" : "0"
      );
    } catch {
      // ignore storage errors
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const checkNewArticles = () => {
      try {
        const localDay = (v: string | Date) => {
          const d = new Date(v);
          return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        };
        const today = localDay(new Date());
        const todayNews = newsData.filter(
          (item) => localDay(item.publish_date) === today
        );
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const newCount = todayNews.filter(
          (article) => new Date(article.publish_date) > fiveMinutesAgo
        ).length;
        setNewArticlesCount(newCount);
      } catch (error) {
        console.error("Lỗi khi kiểm tra bài viết mới:", error);
      }
    };

    const interval = setInterval(checkNewArticles, 30000);
    checkNewArticles();
    return () => clearInterval(interval);
  }, [newsData]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const [
          recentNews,
          dashboardStats,
          sentimentStats,
          keywordStats,
          posts,
        ] = await Promise.all([
          newsService.getAllNews(50, channel),
          newsService.getDashboardStats(channel),
          newsService.getSentimentStats(timeRange, channel),
          newsService.getKeywordStats(timeRange, channel),
          newsService.getPostsByTimeRange(timeRange, channel),
        ]);

        setNewsData(recentNews);
        setStats(dashboardStats);
        setSentimentData(sentimentStats);
        setKeywordData(keywordStats.slice(0, 10));

        const localDateKey = (v: string | Date) => {
          const d = new Date(v);
          const p = (n: number) => String(n).padStart(2, "0");
          return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
        };
        const trendMap: Record<string, DailyTrend> = {};

        if (timeRange !== "all") {
          const end = new Date();
          const start =
            getStartDate(timeRange) ||
            new Date(end.getTime() - 7 * 86400000);

          for (
            let d = new Date(start);
            d <= end;
            d.setDate(d.getDate() + 1)
          ) {
            const k = localDateKey(d);
            trendMap[k] = {
              date: k,
              "Tích cực": 0,
              "Trung lập": 0,
              "Tiêu cực": 0,
            };
          }
        }

        posts.forEach((post) => {
          if (!post.publish_date || !post.sentiment?.name) return;
          const date = localDateKey(post.publish_date);
          if (!trendMap[date]) {
            trendMap[date] = {
              date,
              "Tích cực": 0,
              "Trung lập": 0,
              "Tiêu cực": 0,
            };
          }
          const s = post.sentiment.name as
            | "Tích cực"
            | "Trung lập"
            | "Tiêu cực";
          if (s in trendMap[date]) trendMap[date][s] += 1;
        });

        const trends = Object.values(trendMap)
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((t) => {
            const [, m, d] = t.date.split("-");
            return {
              ...t,
              date: `${d}/${m}`,
            };
          });
        setDailyTrends(trends);

        const counters: Record<string, number> = {
          Báo: 0,
          Facebook: 0,
          Telegram: 0,
          "Facebook Phản động": 0,
        };
        posts.forEach((post) => {
          const parentName =
            post.source?.parent?.name ||
            getParentSourceName(post.source?.parent_id) ||
            (["Báo", "Facebook", "Telegram", "Facebook Phản động"].includes(
              post.source?.name || ""
            )
              ? post.source?.name
              : undefined);
          if (parentName && counters[parentName] !== undefined) {
            counters[parentName] += 1;
          }
        });
        setParentSourceData(
          Object.keys(counters).map((key) => ({
            parent: key,
            count: counters[key],
          }))
        );
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [channel, timeRange]);

  const refreshData = async () => {
    try {
      setRefreshing(true);
      const [recentNews, dashboardStats, sentimentStats, keywordStats] =
        await Promise.all([
          newsService.getAllNews(50, channel),
          newsService.getDashboardStats(channel),
          newsService.getSentimentStats(timeRange, channel),
          newsService.getKeywordStats(timeRange, channel),
        ]);
      setNewsData(recentNews);
      setStats(dashboardStats);
      setSentimentData(sentimentStats);
      setKeywordData(keywordStats.slice(0, 10));
    } catch (error) {
      console.error("Error refreshing data:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };


  // Computed metrics for Executive Telemetry Strip & Sentiment Breakdown
  const sentimentSummary = useMemo(() => {
    const pos =
      sentimentData.find((s) => s.sentiment === "Tích cực")?.count || 0;
    const neu =
      sentimentData.find((s) => s.sentiment === "Trung lập")?.count || 0;
    const neg =
      sentimentData.find((s) => s.sentiment === "Tiêu cực")?.count || 0;
    const total = pos + neu + neg;
    const pct = (v: number) =>
      total > 0 ? Math.round((v / total) * 100) : 0;
    return {
      pos,
      neu,
      neg,
      total,
      posPct: pct(pos),
      neuPct: pct(neu),
      negPct: pct(neg),
    };
  }, [sentimentData]);

  const trendPeriodTotals = useMemo(() => {
    return dailyTrends.reduce(
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
    );
  }, [dailyTrends]);

  const processedPct =
    stats.totalNews > 0
      ? Math.min(100, Math.round((stats.processed / stats.totalNews) * 100))
      : 0;

  type NavItem = {
    id: ActiveViewId;
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    badge?: number;
  };

  const navGroups: { heading: string; items: NavItem[] }[] = [
    {
      heading: "Giám sát",
      items: [
        {
          id: "overview",
          label: "Tổng quan",
          icon: LayoutDashboard,
          badge: newArticlesCount > 0 ? newArticlesCount : undefined,
        },
        { id: "articles", label: "Bài viết", icon: FileText },
        { id: "analytics", label: "Phân tích", icon: Activity },
        { id: "alerts", label: "Báo cáo", icon: FileSpreadsheet },
      ],
    },
    {
      heading: "Tác nghiệp",
      items: [
        { id: "rebuttals", label: "Phản bác", icon: ShieldAlert },
        { id: "workflows", label: "Tự động hóa", icon: Workflow },
      ],
    },
    ...(userRole === "admin"
      ? [
          {
            heading: "Quản trị",
            items: [
              {
                id: "sources" as ActiveViewId,
                label: "Nguồn tin",
                icon: Database,
              },
            ],
          },
        ]
      : []),
  ];

  const selectView = (id: ActiveViewId) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
  };

  const renderSidebarContent = (collapsed: boolean, isMobileDrawer = false) => (
    <div className="flex flex-col h-full bg-[hsl(var(--chrome))] text-sidebar-foreground select-none">
      {/* Brand Header (desktop shell topbar already shows logo + app name) */}
      {(!inDesktop || isMobileDrawer) && (
        <div className="h-14 px-3.5 flex items-center justify-between gap-2 shrink-0 border-b border-border/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-card border border-border/80 flex items-center justify-center shrink-0 shadow-xs">
              <img
                src="/Logo-Bo-Cong-An.webp"
                alt="Logo Bộ Công an"
                className="w-6 h-6 object-contain drop-shadow-xs"
              />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold tracking-tight text-foreground truncate">
                    CAHY CyberWatch
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  Công an tỉnh Hưng Yên
                </p>
              </div>
            )}
          </div>

          {isMobileDrawer ? (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
              aria-label="Đóng bảng điều hướng"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors shrink-0"
              title={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4" strokeWidth={1.75} />
              ) : (
                <PanelLeftClose className="w-4 h-4" strokeWidth={1.75} />
              )}
            </button>
          )}
        </div>
      )}

      {/* Channel segmented switch */}
      {/* Desktop: band height = page header (56px + content border-t) so both bottom rules line up */}
      <div
        className={
          inDesktop && !isMobileDrawer
            ? "h-[57px] px-3 flex flex-col justify-center shrink-0 border-b border-border/70"
            : "px-3 pt-3 pb-1 shrink-0"
        }
      >
        <div
          role="radiogroup"
          aria-label="Kênh giám sát"
          className={
            collapsed
              ? "flex flex-col gap-1"
              : "grid grid-cols-2 p-0.5 rounded-lg bg-muted/70 ring-1 ring-border/60"
          }
        >
          {([
            { id: "ANTT", short: "AN", label: "ANTT", title: "Kênh An ninh trật tự", active: "text-foreground" },
            { id: "Phản Động", short: "PĐ", label: "Phản động", title: "Kênh theo dõi đối tượng phản động", active: "text-rose-600 dark:text-rose-400" },
          ] as const).map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={channel === c.id}
              onClick={() => setChannel(c.id)}
              title={c.title}
              className={`h-7 rounded-md text-xs font-medium transition-[background-color,color,box-shadow] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                channel === c.id
                  ? `bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.12)] ${c.active}`
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {collapsed ? c.short : c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped Navigation Items */}
      <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-3">
        {navGroups.map((group) => (
          <div key={group.heading} className="space-y-0.5">
            {!collapsed && (
              <div className="px-2.5 pt-1 pb-1 text-xs font-medium text-muted-foreground">
                {group.heading}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectView(item.id)}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={`w-full flex items-center ${
                    collapsed ? "justify-center px-0 h-9" : "justify-between px-2.5 h-8"
                  } rounded-lg text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    isActive
                      ? "bg-card text-foreground font-medium shadow-[0_1px_2px_hsl(var(--foreground)/0.08)] ring-1 ring-border/70"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                      strokeWidth={1.75}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </div>
                  {!collapsed && item.badge !== undefined && (
                    <span className="text-[11px] font-medium text-primary tabular-nums">+{item.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {inDesktop && !isMobileDrawer && (
        <div className="p-3 shrink-0 border-t border-border/50">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            className={`w-full h-8 flex items-center gap-2.5 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors duration-150 ${
              collapsed ? "justify-center px-0" : "px-2.5"
            }`}
            aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            aria-expanded={!collapsed}
            title={collapsed ? "Mở rộng thanh điều hướng" : undefined}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span>Thu gọn</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Sidebar Footer: Theme Switch & Operator Session (desktop shell avatar menu owns both) */}
      {!inDesktop && (
        <div className="p-2.5 border-t border-border/50 space-y-2 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            title={
              theme === "dark"
                ? "Chuyển sang giao diện Sáng"
                : "Chuyển sang giao diện Tối"
            }
            className={`w-full flex items-center ${
              collapsed ? "justify-center py-2" : "justify-between px-2.5 py-1.5"
            } rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors`}
          >
            <div className="flex items-center gap-2">
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-amber-400" strokeWidth={1.75} />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" strokeWidth={1.75} />
              )}
              {!collapsed && (
                <span>{theme === "dark" ? "Chế độ Sáng" : "Chế độ Tối"}</span>
              )}
            </div>
          </button>

          <div
            className={`rounded-xl bg-card/60 dark:bg-muted/30 border border-border/70 ${
              collapsed ? "p-1.5 flex flex-col items-center gap-1.5" : "p-2.5 space-y-2"
            }`}
          >
            {!collapsed && (
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck
                    className="w-4 h-4 text-primary shrink-0"
                    strokeWidth={1.75}
                  />
                  <span
                    className="text-xs font-semibold text-foreground truncate"
                    title={userEmail || "Phiên khách"}
                  >
                    {userEmail || "Phiên khách"}
                  </span>
                </div>
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-primary/10 text-primary shrink-0">
                  {userRole === "admin" ? "Quản trị" : !userRole || userRole === "guest" ? "Khách" : "Cán bộ"}
                </span>
              </div>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              title="Đăng xuất khỏi phiên làm việc"
              className={`w-full h-7 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:bg-rose-500/10 ${
                collapsed ? "px-0 justify-center" : "justify-start px-2"
              }`}
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
              {!collapsed && <span className="ml-2">Đăng xuất</span>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  const currentViewMeta = VIEW_META[activeTab];
  const showTimeRangeControl =
    activeTab === "overview" || activeTab === "analytics";

  return (
    <div className="min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden bg-[hsl(var(--chrome))] text-foreground flex">
      {/* Desktop Left Navigation Rail */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 h-[100dvh] z-30 transition-[width] duration-200 ${
          sidebarCollapsed ? "w-[68px]" : "w-60"
        }`}
      >
        {renderSidebarContent(sidebarCollapsed, false)}
      </aside>

      {/* Mobile Slide-Over Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 max-w-[82vw] h-full border-r border-sidebar-border z-10">
            {renderSidebarContent(false, true)}
          </div>
        </div>
      )}

      {/* Primary Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0 bg-background lg:h-[100dvh] lg:overflow-y-auto lg:rounded-tl-xl lg:border-l lg:border-t lg:border-border">
        {/* High-End Precision Page Header */}
        <header className="h-14 sticky top-0 z-20 bg-background/85 backdrop-blur-xl border-b border-border/70 px-4 lg:px-8 flex items-center justify-between gap-4 shrink-0">
          {/* Left: title, short context, channel switch */}
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Mở menu điều hướng"
            >
              <Menu className="w-4 h-4" strokeWidth={1.75} />
            </button>

            <div className="min-w-0 flex items-baseline gap-3">
              <h1 className="text-[17px] font-semibold tracking-tight text-foreground whitespace-nowrap">
                {currentViewMeta.title}
              </h1>
              <p className="hidden lg:block text-[13px] text-muted-foreground truncate">
                {currentViewMeta.subtitle}
              </p>
            </div>
            {/* Channel switch lives in the sidebar; no duplicate here */}
          </div>

          {/* Right: Tactical Command Console Controls & Live Telemetry */}
          <div className="flex items-center gap-2 shrink-0">
            {showTimeRangeControl && (
              <Select
                value={timeRange}
                onValueChange={(value: TimeRangeValue) => setTimeRange(value)}
              >
                <SelectTrigger
                  aria-label="Khoảng thời gian"
                  className="h-8 w-[132px] px-2.5 rounded-lg text-xs font-medium bg-card border border-border/80 focus:ring-1 focus:ring-primary/40"
                >
                  <Calendar
                    className="w-3.5 h-3.5 mr-1.5 text-muted-foreground shrink-0"
                    strokeWidth={1.75}
                  />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" className="rounded-xl border border-border shadow-2xl backdrop-blur-xl bg-popover/95">
                  <SelectItem value="day">24 giờ qua</SelectItem>
                  <SelectItem value="week">7 ngày qua</SelectItem>
                  <SelectItem value="month">30 ngày qua</SelectItem>
                  <SelectItem value="year">1 năm qua</SelectItem>
                  <SelectItem value="all">Toàn bộ</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Sync: standalone control; wall clock removed (it looked clickable and ticked every second) */}
              <button
                type="button"
                onClick={refreshData}
                disabled={refreshing || loading}
                aria-label="Đồng bộ dữ liệu"
                title="Đồng bộ dữ liệu"
                className="h-8 px-3 rounded-lg bg-card border border-border/80 inline-flex items-center gap-1.5 text-xs font-medium text-foreground hover:bg-muted/70 active:bg-muted transition-colors duration-150 disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-primary ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
                  strokeWidth={1.75}
                />
                <span className="hidden sm:inline">{refreshing ? "Đang đồng bộ" : "Đồng bộ"}</span>
              </button>

            {/* Quick Ambient Theme Toggle in Header (desktop shell avatar menu owns theme) */}
            {!inDesktop && <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
              className="h-9 w-9 rounded-xl flex items-center justify-center bg-card/70 hover:bg-card border border-border/80 text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 shadow-2xs"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-amber-400" strokeWidth={1.75} />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" strokeWidth={1.75} />
              )}
            </button>}
          </div>
        </header>

        {/* Fluid Operational Canvas */}
        {/* pb-24 keeps the floating AI assistant button off the last row */}
        <main className="flex-1 p-4 pb-24 lg:px-8 lg:pt-6 lg:pb-24 max-w-[1600px] w-full">
          {/* ================================================================
              VIEW 1: OVERVIEW (Awwwards-Tier Asymmetric Doppelrand Bento)
              ================================================================ */}
          {activeTab === "overview" && (
            <>
              {loading ? (
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
              ) : (
                <div className="space-y-6">
                  {/* KPI strip: label, value, one meta line */}
                  <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {[
                      {
                        label: "Tổng tin thu thập",
                        value: stats.totalNews,
                        icon: Database,
                        meta: `Kênh ${channel === "ANTT" ? "ANTT" : "Phản động"}`,
                      },
                      {
                        label: "Mới trong 24 giờ",
                        value: stats.todayNews,
                        icon: Radio,
                        meta: newArticlesCount > 0 ? `+${newArticlesCount} tin trong 5 phút qua` : "Chưa có tin mới trong 5 phút qua",
                      },
                      {
                        label: "Đã phân tích AI",
                        value: stats.processed,
                        icon: CheckCircle2,
                        meta: `${processedPct}% tổng số tin`,
                        progress: processedPct,
                      },
                      {
                        label: "Tin tiêu cực",
                        value: sentimentSummary.neg,
                        icon: AlertTriangle,
                        meta: `${sentimentSummary.negPct}% trong ${TIME_RANGE_LABELS[timeRange].toLowerCase()}`,
                        danger: true,
                      },
                    ].map(({ label, value, icon: Icon, meta, progress, danger }) => (
                      <div key={label} className="doppelrand-shell">
                        <div className="doppelrand-core gap-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-medium text-muted-foreground truncate">{label}</span>
                            <Icon
                              className={`w-4 h-4 shrink-0 ${danger ? "text-rose-500" : "text-muted-foreground"}`}
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          </div>
                          <div
                            className={`text-[28px] leading-none font-semibold tracking-tight tabular-nums ${
                              danger && value > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
                            }`}
                          >
                            {value.toLocaleString("vi-VN")}
                          </div>
                          <div className="space-y-2">
                            {/* Track on every card (invisible without progress) so values share one baseline */}
                            <div className={`h-1 w-full rounded-full bg-muted overflow-hidden ${progress === undefined ? "invisible" : ""}`} aria-hidden>
                              <div
                                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
                                style={{ width: `${progress ?? 0}%` }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{meta}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </section>

                  {/* Asymmetric 12-Col Bento Row 1: 8-Col Trend Chart + 4-Col Sentiment & Telemetry */}
                  <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                    {/* 8-Col Trend Chart */}
                    <div className="xl:col-span-8 doppelrand-shell">
                      <div className="doppelrand-core">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                          <div>
                            <h2 className="text-sm font-semibold text-foreground">Diễn biến sắc thái</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {TIME_RANGE_LABELS[timeRange]}, {dailyTrends.length} mốc ngày
                            </p>
                          </div>

                          {/* Legend doubles as period totals */}
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

                        <div className={`${trendPeriodTotals.pos + trendPeriodTotals.neu + trendPeriodTotals.neg === 0 ? "h-48" : "h-72"} w-full pt-2`}>
                          {trendPeriodTotals.pos + trendPeriodTotals.neu + trendPeriodTotals.neg === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center gap-1 text-center border border-dashed border-border rounded-lg px-4">
                              <Activity className="w-5 h-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                              <p className="mt-1 text-[13px] font-medium text-foreground">Chưa có dữ liệu trong {TIME_RANGE_LABELS[timeRange].toLowerCase()}</p>
                              <p className="text-xs text-muted-foreground">Đổi khoảng thời gian hoặc chạy luồng thu thập để có số liệu.</p>
                              <button
                                type="button"
                                onClick={() => setActiveTab("workflows")}
                                className="mt-3 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1.5 hover:bg-primary/90 active:scale-[0.98] transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
                              >
                                <Workflow className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
                                Chạy luồng thu thập
                              </button>
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart
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
                                <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                                <RechartsTooltip
                                  content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                      const total = payload.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
                                      return (
                                        <div className="bg-popover/95 backdrop-blur-xl text-popover-foreground p-3.5 border border-border/80 rounded-xl shadow-2xl text-xs space-y-2">
                                          <p className="font-mono font-bold text-foreground">Ngày {label}</p>
                                          {payload.map((entry, idx) => (
                                            <div key={idx} className="flex items-center justify-between gap-5 font-mono tabular-nums">
                                              <span style={{ color: entry.color }} className="font-bold">{String(entry.dataKey)}</span>
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
                                <Area type="monotone" dataKey="Tích cực" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#gradPos)" />
                                <Area type="monotone" dataKey="Trung lập" stroke="#64748b" strokeWidth={2.5} fillOpacity={1} fill="url(#gradNeu)" />
                                <Area type="monotone" dataKey="Tiêu cực" stroke="#ef4444" strokeWidth={2.5} fillOpacity={1} fill="url(#gradNeg)" />
                              </AreaChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 4-Col Sentiment share */}
                    <div className="xl:col-span-4 doppelrand-shell">
                      <div className="doppelrand-core gap-5">
                        <div className="space-y-4">
                          <div className="flex items-baseline justify-between gap-2">
                            <h2 className="text-sm font-semibold text-foreground">Tỷ trọng sắc thái</h2>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {sentimentSummary.total.toLocaleString("vi-VN")} bài
                            </span>
                          </div>

                          {sentimentSummary.total === 0 ? (
                            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                              <PieChartIcon className="w-5 h-5 mx-auto text-muted-foreground" strokeWidth={1.75} aria-hidden />
                              <p className="mt-2 text-[13px] font-medium text-foreground">Chưa có bài được phân loại</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Tỷ trọng hiện khi AI gán nhãn bài trong {TIME_RANGE_LABELS[timeRange].toLowerCase()}.
                              </p>
                            </div>
                          ) : (
                            <>
                              <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex gap-0.5" aria-hidden>
                                <div className="bg-emerald-500 h-full" style={{ width: `${sentimentSummary.posPct}%` }} />
                                <div className="bg-slate-400 dark:bg-slate-500 h-full" style={{ width: `${sentimentSummary.neuPct}%` }} />
                                <div className="bg-rose-500 h-full" style={{ width: `${sentimentSummary.negPct}%` }} />
                              </div>
                              <dl className="divide-y divide-border/60 text-[13px]">
                                {[
                                  { name: "Tích cực", n: sentimentSummary.pos, pct: sentimentSummary.posPct, dot: "bg-emerald-500" },
                                  { name: "Trung lập", n: sentimentSummary.neu, pct: sentimentSummary.neuPct, dot: "bg-slate-400 dark:bg-slate-500" },
                                  { name: "Tiêu cực", n: sentimentSummary.neg, pct: sentimentSummary.negPct, dot: "bg-rose-500" },
                                ].map(({ name, n, pct, dot }) => (
                                  <div key={name} className="flex items-center justify-between py-2.5">
                                    <dt className="flex items-center gap-2 text-foreground">
                                      <span className={`w-2 h-2 rounded-sm ${dot}`} aria-hidden />
                                      {name}
                                    </dt>
                                    <dd className="tabular-nums text-muted-foreground">
                                      <span className="font-medium text-foreground">{n.toLocaleString("vi-VN")}</span>
                                      <span className="ml-1.5 inline-block w-10 text-right">{pct}%</span>
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            </>
                          )}
                        </div>

                        <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground tabular-nums">
                            Cập nhật {currentTime.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <button
                            type="button"
                            onClick={() => setActiveTab("workflows")}
                            className="inline-flex items-center gap-1 h-8 -mr-2 px-2 rounded-md font-medium text-primary hover:bg-primary/10 transition-colors duration-150"
                          >
                            Luồng thu thập
                            <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Asymmetric 12-Col Bento Row 2: 7-Col Latest Signal Feed + 5-Col Top Keywords */}
                  <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                    {/* 7-Col Latest Signals */}
                    <div className="xl:col-span-7 doppelrand-shell">
                      <div className="doppelrand-core space-y-4">
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/60">
                          <div>
                            <h2 className="text-sm font-semibold text-foreground">Tin mới nhất</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">6 bài gần nhất</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab("articles")}
                            className="inline-flex items-center gap-1 h-8 -mr-2 px-2 rounded-md text-xs font-medium text-primary hover:bg-primary/10 transition-colors duration-150"
                          >
                            Xem tất cả
                            <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>
                        </div>

                        {newsData.length === 0 ? (
                          <div className="h-56 flex items-center justify-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                            Chưa có bài viết nào được ghi nhận trên kênh {channel}.
                          </div>
                        ) : (
                          <div className="divide-y divide-border/60">
                            {newsData.slice(0, 6).map((item) => {
                              const title =
                                item.content && item.content.trim()
                                  ? item.content.substring(0, 115) + (item.content.length > 115 ? "..." : "")
                                  : item.summary || "Không có nội dung tóm tắt";
                              const sName = item.sentiment?.name || "Trung lập";

                              return (
                                <div
                                  key={item.id}
                                  className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3 hover:bg-muted/40 rounded-xl px-2.5 -mx-2.5 transition-colors"
                                >
                                  <div className="min-w-0 flex-1 space-y-1.5">
                                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                      <span className="font-bold text-foreground truncate max-w-[200px]">
                                        {item.source?.name || "Nguồn tin"}
                                      </span>
                                      <span>•</span>
                                      <span className="font-mono tabular-nums shrink-0">
                                        {formatDateTimeVi(item.publish_date)}
                                      </span>
                                    </div>
                                    <p className="text-xs font-semibold text-foreground line-clamp-1 leading-snug">
                                      {title}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] px-2.5 py-0.5 rounded-md font-bold shadow-2xs ${getSentimentBadgeClass(
                                        sName
                                      )}`}
                                    >
                                      {sName}
                                    </Badge>
                                    {item.link && (
                                      <a
                                        href={item.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
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
                    </div>

                    {/* 5-Col Top Keywords */}
                    <div className="xl:col-span-5 doppelrand-shell">
                      <div className="doppelrand-core space-y-4">
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/60">
                          <div>
                            <h2 className="text-sm font-semibold text-foreground">Từ khóa nổi bật</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Xuất hiện nhiều nhất trong {TIME_RANGE_LABELS[timeRange].toLowerCase()}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab("analytics")}
                            className="inline-flex items-center gap-1 h-8 -mr-2 px-2 rounded-md text-xs font-medium text-primary hover:bg-primary/10 transition-colors duration-150"
                          >
                            Chi tiết
                            <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>
                        </div>

                        <KeywordChart data={keywordData.slice(0, 7)} />
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </>
          )}

          {/* ================================================================
              VIEW 2: ARTICLES STREAM
              ================================================================ */}
          {activeTab === "articles" && <PostsList channel={channel} />}

          {/* ================================================================
              VIEW 3: DEEP ANALYTICS
              ================================================================ */}
          {activeTab === "analytics" && (
            <div className="space-y-5">
              {/* Time-Series Sentiment Analysis */}
              <div className="surface-panel p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Activity
                        className="w-4 h-4 text-primary"
                        strokeWidth={1.75}
                      />
                      <span>Chuỗi Thời gian Sắc thái Dư luận</span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Phân tích biến động trong {TIME_RANGE_LABELS[timeRange].toLowerCase()} trên kênh {channel} ({dailyTrends.length} điểm dữ liệu)
                    </p>
                  </div>
                  <div className="text-left sm:text-right font-mono tabular-nums">
                    <div className="text-xl font-bold text-primary">
                      {trendPeriodTotals.total.toLocaleString("vi-VN")}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      bài viết trong kỳ
                    </div>
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
                        data={dailyTrends}
                        margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="hsl(var(--border))"
                        />
                        <XAxis
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
                              const total = payload.reduce(
                                (sum, entry) =>
                                  sum + (Number(entry.value) || 0),
                                0
                              );
                              return (
                                <div className="bg-popover text-popover-foreground p-3 border border-border rounded-lg shadow-md text-xs space-y-1.5">
                                  <p className="font-mono font-semibold">
                                    Ngày {label}
                                  </p>
                                  {payload.map((entry, index) => (
                                    <div
                                      key={index}
                                      className="flex items-center justify-between gap-4 font-mono tabular-nums"
                                    >
                                      <span style={{ color: entry.color }}>
                                        {String(entry.dataKey)}
                                      </span>
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
                        <Area
                          type="monotone"
                          dataKey="Tích cực"
                          stroke="#10b981"
                          strokeWidth={2.25}
                          fill="#10b981"
                          fillOpacity={0.12}
                        />
                        <Area
                          type="monotone"
                          dataKey="Trung lập"
                          stroke="#64748b"
                          strokeWidth={2.25}
                          fill="#64748b"
                          fillOpacity={0.1}
                        />
                        <Area
                          type="monotone"
                          dataKey="Tiêu cực"
                          stroke="#e11d48"
                          strokeWidth={2.25}
                          fill="#e11d48"
                          fillOpacity={0.14}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-6 pt-2 border-t border-border text-xs font-mono tabular-nums">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                    <span className="text-muted-foreground">Tích cực:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {trendPeriodTotals.pos}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-slate-500" />
                    <span className="text-muted-foreground">Trung lập:</span>
                    <span className="font-bold text-foreground">
                      {trendPeriodTotals.neu}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
                    <span className="text-muted-foreground">Tiêu cực:</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400">
                      {trendPeriodTotals.neg}
                    </span>
                  </div>
                </div>
              </div>

              {/* 12-Col Split: 7-Col Top Keywords + 5-Col Sentiment Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-7 surface-panel p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Hash
                        className="w-4 h-4 text-primary"
                        strokeWidth={1.75}
                      />
                      <span>Bảng Xếp hạng Từ khóa Nổi bật</span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Top {keywordData.length} cụm từ khóa có mật độ xuất hiện cao nhất
                    </p>
                  </div>
                  <KeywordChart data={keywordData} />
                </div>

                <div className="lg:col-span-5 surface-panel p-5 flex flex-col justify-between gap-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <PieChartIcon
                          className="w-4 h-4 text-primary"
                          strokeWidth={1.75}
                        />
                        <span>Phân bổ Sắc thái Toàn diện</span>
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Tỷ lệ phần trăm từng nhóm sắc thái trong khung thời gian đang chọn
                      </p>
                    </div>

                    <div className="space-y-4 pt-1">
                      {sentimentData.map((item) => {
                        const total = sentimentData.reduce(
                          (sum, s) => sum + s.count,
                          0
                        );
                        const percentage =
                          total > 0
                            ? Math.round((item.count / total) * 100)
                            : 0;
                        const barColor =
                          item.sentiment === "Tích cực"
                            ? "bg-emerald-500"
                            : item.sentiment === "Tiêu cực"
                              ? "bg-rose-500"
                              : "bg-slate-500";
                        return (
                          <div key={item.sentiment} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-foreground">
                                {item.sentiment}
                              </span>
                              <div className="flex items-center gap-2 font-mono tabular-nums">
                                <span className="text-muted-foreground">
                                  {item.count} bài
                                </span>
                                <span className="font-bold text-foreground w-10 text-right">
                                  {percentage}%
                                </span>
                              </div>
                            </div>
                            <div className="w-full bg-muted rounded-sm h-2 overflow-hidden">
                              <div
                                className={`h-full rounded-sm ${barColor} transition-all duration-300`}
                                style={{ width: `${percentage}%` }}
                              />
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
                      <div className="text-[11px] text-muted-foreground">
                        Tích cực
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-muted/60 border border-border">
                      <div className="font-mono text-lg font-bold text-foreground tabular-nums">
                        {sentimentSummary.neu}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Trung lập
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-rose-500/8 border border-rose-500/20">
                      <div className="font-mono text-lg font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                        {sentimentSummary.neg}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Tiêu cực
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Parent Source Distribution Donut */}
              <ParentSourceDonut data={parentSourceData} />
            </div>
          )}

          {/* ================================================================
              VIEWS 4-7: SUB-MODULES
              ================================================================ */}
          {activeTab === "alerts" && <ComprehensiveReport channel={channel} />}
          {activeTab === "rebuttals" && (
            <RebuttalManagement channel={channel} userRole={userRole} />
          )}
          {activeTab === "workflows" && (
            <WorkflowControlCenter channel={channel} userRole={userRole} />
          )}
          {activeTab === "sources" && userRole === "admin" && (
            <SourceManagement />
          )}
        </main>
      </div>
    </div>
  );
};

export default Index;
