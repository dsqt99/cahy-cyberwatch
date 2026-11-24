"use client";

import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Calendar, Menu, Moon, RefreshCw, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChannelType, getStartDate, signOut } from "@/lib/supabase";
import { useAppTheme } from "@/lib/theme";
import { isDesktopApp } from "@/lib/desktopBridge";
import { useDashboardData } from "@/hooks/useDashboardData";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import OverviewTab from "@/components/dashboard/OverviewTab";
import AnalyticsTab from "@/components/dashboard/AnalyticsTab";
import { ActiveViewId, TimeRangeValue, VIEW_META } from "@/components/dashboard/types";
import PostsList from "@/components/PostsList";
import ComprehensiveReport from "@/components/AlertReport";
import SourceManagement from "@/components/SourceManagement";
import RebuttalManagement from "@/components/RebuttalManagement";
import WorkflowControlCenter from "@/components/WorkflowControlCenter";

const Index: React.FC = () => {
  const [urlParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<ActiveViewId>(() =>
    [...urlParams.keys()].some((key) => key.startsWith("articles_")) ? "articles" : "overview"
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("cahy_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [channel, setChannel] = useState<ChannelType>(() => {
    const requested = urlParams.get("articles_channel");
    return requested === "ANTT" || requested === "Phản Động"
      ? requested
      : (localStorage.getItem("current_channel") as ChannelType) || "ANTT";
  });
  const [timeRange, setTimeRange] = useState<TimeRangeValue>("week");

  const navigate = useNavigate();
  const { theme, toggleTheme } = useAppTheme();
  const userRole = sessionStorage.getItem("userRole");
  const userEmail = sessionStorage.getItem("userEmail");
  const inDesktop = isDesktopApp();

  const {
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
  } = useDashboardData(channel, timeRange);

  useEffect(() => {
    localStorage.setItem("current_channel", channel);
  }, [channel]);

  useEffect(() => {
    try {
      localStorage.setItem("cahy_sidebar_collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [sidebarCollapsed]);

  const openArticles = (date?: string, sentiment?: string, keyword?: string) => {
    const query = new URLSearchParams({ articles_channel: channel });
    const start = getStartDate(timeRange);
    const localKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (date) {
      query.set("articles_start", date);
      query.set("articles_end", date);
    } else if (start) {
      query.set("articles_start", localKey(start));
      query.set("articles_end", localKey(new Date()));
    }
    if (sentiment) query.set("articles_sentiment", sentiment);
    if (keyword) query.set("articles_search", keyword);
    navigate(`/?${query}`);
    setActiveTab("articles");
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const selectView = (id: ActiveViewId) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
  };

  const currentViewMeta = VIEW_META[activeTab];
  const showTimeRangeControl = activeTab === "overview" || activeTab === "analytics";

  return (
    <div className="min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden bg-[hsl(var(--chrome))] text-foreground flex">
      {/* Desktop Left Navigation Rail */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 h-[100dvh] z-30 transition-[width] duration-200 ${
          sidebarCollapsed ? "w-[68px]" : "w-60"
        }`}
      >
        <DashboardSidebar
          collapsed={sidebarCollapsed}
          inDesktop={inDesktop}
          activeTab={activeTab}
          channel={channel}
          userRole={userRole}
          userEmail={userEmail}
          theme={theme}
          onSelectView={selectView}
          onChannelChange={setChannel}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          onCloseMobile={() => setMobileMenuOpen(false)}
          onToggleTheme={toggleTheme}
          onLogout={handleLogout}
        />
      </aside>

      {/* Mobile Slide-Over Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-64 max-w-[82vw] h-full border-r border-sidebar-border z-10">
            <DashboardSidebar
              collapsed={false}
              isMobileDrawer
              inDesktop={inDesktop}
              activeTab={activeTab}
              channel={channel}
              userRole={userRole}
              userEmail={userEmail}
              theme={theme}
              onSelectView={selectView}
              onChannelChange={setChannel}
              onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
              onCloseMobile={() => setMobileMenuOpen(false)}
              onToggleTheme={toggleTheme}
              onLogout={handleLogout}
            />
          </div>
        </div>
      )}

      {/* Primary Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0 bg-background lg:h-[100dvh] lg:overflow-y-auto lg:rounded-tl-xl lg:border-l lg:border-t lg:border-border">
        <header className="h-14 sticky top-0 z-20 bg-background/85 backdrop-blur-xl border-b border-border/70 px-4 lg:px-8 flex items-center justify-between gap-4 shrink-0">
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
              <p className="hidden lg:block text-[13px] text-muted-foreground truncate">{currentViewMeta.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {showTimeRangeControl && (
              <Select value={timeRange} onValueChange={(value: TimeRangeValue) => setTimeRange(value)}>
                <SelectTrigger
                  aria-label="Khoảng thời gian"
                  className="h-8 w-[132px] px-2.5 rounded-lg text-xs font-medium bg-card border border-border/80 focus:ring-1 focus:ring-primary/40"
                >
                  <Calendar className="w-3.5 h-3.5 mr-1.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" className="rounded-xl border border-border shadow-2xl backdrop-blur-xl bg-popover/95">
                  <SelectItem value="day">Hôm nay</SelectItem>
                  <SelectItem value="week">7 ngày qua</SelectItem>
                  <SelectItem value="month">30 ngày qua</SelectItem>
                  <SelectItem value="year">1 năm qua</SelectItem>
                  <SelectItem value="all">Toàn bộ</SelectItem>
                </SelectContent>
              </Select>
            )}

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

            {!inDesktop && (
              <button
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
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 lg:px-8 lg:pt-6 lg:pb-24 max-w-[1600px] w-full">
          {dataError && (
            <div role="alert" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              {dataError}{" "}
              <Button variant="outline" size="sm" onClick={refreshData}>
                Thử lại
              </Button>
            </div>
          )}
          {!lastUpdated && dataError && (
            <p className="mb-4 text-sm text-muted-foreground">
              Số liệu chưa sẵn sàng; không dùng giá trị trống để kết luận không có bài.
            </p>
          )}

          {activeTab === "overview" && (!dataError || lastUpdated) && (
            <OverviewTab
              loading={loading}
              channel={channel}
              timeRange={timeRange}
              stats={stats}
              processedPct={processedPct}
              sentimentSummary={sentimentSummary}
              trendPeriodTotals={trendPeriodTotals}
              dailyTrends={dailyTrends}
              newsData={newsData}
              keywordData={keywordData}
              onSetTimeRange={setTimeRange}
              onSetActiveTab={setActiveTab}
              onOpenArticles={openArticles}
            />
          )}

          {activeTab === "articles" && <PostsList channel={channel} refreshVersion={refreshVersion} />}

          {activeTab === "analytics" && (!dataError || lastUpdated) && (
            <AnalyticsTab
              loading={loading}
              channel={channel}
              timeRange={timeRange}
              analytics={analytics}
              dailyTrends={dailyTrends}
              trendPeriodTotals={trendPeriodTotals}
              keywordData={keywordData}
              sentimentData={sentimentData}
              sentimentSummary={sentimentSummary}
              parentSourceData={parentSourceData}
              onOpenArticles={openArticles}
            />
          )}

          {activeTab === "alerts" && <ComprehensiveReport channel={channel} />}
          {activeTab === "rebuttals" && <RebuttalManagement channel={channel} userRole={userRole} />}
          {activeTab === "workflows" && <WorkflowControlCenter channel={channel} userRole={userRole} />}
          {activeTab === "sources" && userRole === "admin" && <SourceManagement />}
        </main>
      </div>
    </div>
  );
};

export default Index;
