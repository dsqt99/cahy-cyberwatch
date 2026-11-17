"use client";

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { newsService, NewsItem, NEWS_TOPICS } from "@/lib/supabase";
import { ArrowLeft, Calendar, ExternalLink, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TimeRangeOption = "day" | "week" | "month" | "year" | "all";

const Posts = () => {
  const [posts, setPosts] = useState<NewsItem[]>([]);
  const [totalPostsCount, setTotalPostsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<TimeRangeOption>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const postsPerPage = 10;

  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      try {
        const { data, count } = await newsService.getPaginatedNews(
          currentPage,
          postsPerPage,
          search,
          sentimentFilter === "all" ? undefined : sentimentFilter,
          undefined,
          timeRange,
          undefined,
          topicFilter === "all" ? undefined : topicFilter
        );
        setPosts(data);
        setTotalPostsCount(count);
      } catch (error) {
        console.error("Error fetching posts:", error);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      void fetchPosts();
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [timeRange, search, sentimentFilter, topicFilter, currentPage]);

  const handleFilterChange = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    setter(value);
    setCurrentPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalPostsCount / postsPerPage));

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getSentimentBadgeClass = (sentiment: string) => {
    switch (sentiment) {
      case "Tích cực":
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25";
      case "Tiêu cực":
        return "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="max-w-[1360px] mx-auto p-6 space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <Link
                to="/"
                className="inline-flex items-center gap-1 text-primary hover:underline font-sans font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Trung tâm Điều hành</span>
              </Link>
              <span>/</span>
              <span>KHO DỮ LIỆU BÀI VIẾT</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Tra cứu Dữ liệu Bài viết</h1>
          </div>
          <div className="font-mono text-xs text-muted-foreground tabular-nums">
            Tổng bản ghi: <strong className="text-foreground">{totalPostsCount}</strong>
          </div>
        </header>

        {/* Filter Bar */}
        <div className="surface-panel p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              strokeWidth={1.75}
            />
            <Input
              type="text"
              placeholder="Tìm kiếm theo nội dung hoặc tóm tắt bài viết..."
              value={search}
              onChange={(e) => handleFilterChange(setSearch, e.target.value)}
              className="pl-9 h-9 bg-background"
            />
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Select
              value={timeRange}
              onValueChange={(v) => handleFilterChange(setTimeRange, v as TimeRangeOption)}
            >
              <SelectTrigger className="w-40 h-9 bg-background text-xs">
                <Calendar className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" strokeWidth={1.75} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toàn bộ thời gian</SelectItem>
                <SelectItem value="day">24 giờ qua</SelectItem>
                <SelectItem value="week">7 ngày qua</SelectItem>
                <SelectItem value="month">30 ngày qua</SelectItem>
                <SelectItem value="year">1 năm qua</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sentimentFilter}
              onValueChange={(v) => handleFilterChange(setSentimentFilter, v)}
            >
              <SelectTrigger className="w-40 h-9 bg-background text-xs">
                <SelectValue placeholder="Sắc thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả sắc thái</SelectItem>
                <SelectItem value="Tích cực">Tích cực</SelectItem>
                <SelectItem value="Trung lập">Trung lập</SelectItem>
                <SelectItem value="Tiêu cực">Tiêu cực</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={topicFilter}
              onValueChange={(v) => handleFilterChange(setTopicFilter, v)}
            >
              <SelectTrigger className="w-44 h-9 bg-background text-xs">
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

        {/* Loading Skeleton or Results */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="surface-panel p-5 space-y-3">
                <div className="flex justify-between">
                  <div className="h-3.5 w-48 rounded bg-muted animate-pulse" />
                  <div className="h-5 w-20 rounded bg-muted animate-pulse" />
                </div>
                <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                <div className="h-3.5 w-1/2 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : posts.length > 0 ? (
          <div className="space-y-3">
            {posts.map((post) => (
              <article
                key={post.id}
                className="surface-panel p-5 hover:border-primary/40 transition-colors"
              >
                <div className="flex flex-col lg:flex-row justify-between items-start gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {post.source?.name || "Nguồn chưa định danh"}
                      </span>
                      <span>•</span>
                      <span className="font-mono tabular-nums">{formatDate(post.publish_date)}</span>
                    </div>

                    <h2 className="text-[15px] font-semibold text-foreground leading-snug line-clamp-2">
                      {post.content
                        ? post.content.slice(0, 160) + (post.content.length > 160 ? "..." : "")
                        : post.summary || "Không có tiêu đề nội dung"}
                    </h2>

                    {post.summary && (
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 max-w-[85ch]">
                        {post.summary}
                      </p>
                    )}

                    {post.keywords && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {post.keywords
                          .split(",")
                          .map((k) => k.trim())
                          .filter(Boolean)
                          .slice(0, 5)
                          .map((kw, i) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="rounded-md font-normal text-xs"
                            >
                              {kw}
                            </Badge>
                          ))}
                      </div>
                    )}
                  </div>

                  <div className="flex lg:flex-col items-center lg:items-end gap-2 shrink-0">
                    <span
                      className={cn(
                        "px-2.5 py-0.5 rounded-md text-xs font-semibold border",
                        getSentimentBadgeClass(post.sentiment?.name || "Trung lập")
                      )}
                    >
                      {post.sentiment?.name || "Trung lập"}
                    </span>

                    {post.link && (
                      <Button variant="outline" size="sm" asChild className="h-8 text-xs gap-1.5">
                        <a href={post.link} target="_blank" rel="noopener noreferrer">
                          <span>Bài gốc</span>
                          <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="surface-panel p-12 text-center space-y-2">
            <p className="text-sm font-semibold text-foreground">
              Không tìm thấy bài viết phù hợp với bộ lọc hiện tại
            </p>
            <p className="text-xs text-muted-foreground">
              Hãy điều chỉnh từ khóa tìm kiếm hoặc mở rộng khung thời gian truy vấn.
            </p>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-mono text-muted-foreground tabular-nums">
              Trang {currentPage} / {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="h-8 text-xs gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Trước</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="h-8 text-xs gap-1"
              >
                <span>Sau</span>
                <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Posts;
