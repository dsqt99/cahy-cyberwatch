import React from "react";
import { ExternalLink, Layers, RefreshCw, Settings, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChannelType, POSTGRES_DB_INFO } from "@/lib/supabase";
import type { DesktopStatusResponse } from "@/lib/desktopBridge";

interface InfrastructureHeaderProps {
  channel: ChannelType;
  isAdmin: boolean;
  inDesktop: boolean;
  n8nOrigin: string;
  desktopStatus: DesktopStatusResponse | null;
  isRefreshingStatus: boolean;
  onRefresh: () => void;
}

const InfrastructureHeader: React.FC<InfrastructureHeaderProps> = ({
  channel,
  isAdmin,
  inDesktop,
  n8nOrigin,
  desktopStatus,
  isRefreshingStatus,
  onRefresh,
}) => {
  const foxOnline = Boolean(desktopStatus?.services.foxprofile.online);
  const hookOnline = Boolean(desktopStatus?.services.webhook.online);

  return (
    <div className="surface-panel p-5 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Workflow className="w-4 h-4 text-primary" strokeWidth={1.75} />
            <h2 className="text-base font-bold tracking-tight text-foreground">
              Trung tâm Điều phối Tự động hóa n8n & Antidetect
            </h2>
            <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
              Kênh: {channel}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Điều khiển tập trung luồng thu thập dữ liệu, tác chiến phản bác AI, báo cáo xu hướng, trình duyệt FoxProfile và chụp bằng chứng số.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshingStatus}
            className="h-8 text-xs gap-1.5 tactile-press"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingStatus ? "animate-spin" : ""}`} strokeWidth={1.75} />
            <span>Làm mới</span>
          </Button>
          {inDesktop && isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void window.cyberwatchDesktop?.switchWorkspace("foxprofile")}
                className="h-8 text-xs gap-1.5 tactile-press"
              >
                <Layers className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                <span>FoxProfile</span>
              </Button>
              <Button
                size="sm"
                onClick={() => void window.cyberwatchDesktop?.switchWorkspace("n8n")}
                className="h-8 text-xs gap-1.5 tactile-press"
              >
                <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Mở n8n Studio</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void window.cyberwatchDesktop?.switchWorkspace("settings")}
                className="h-8 text-xs gap-1.5 tactile-press"
              >
                <Settings className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Cấu hình Trạm</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 4 Service Health Telemetry Nodes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="p-3.5 rounded-lg bg-muted/40 border border-border space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">n8n Orchestrator</span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Trực tuyến
            </span>
          </div>
          <div className="text-xs font-mono font-semibold text-foreground truncate">{n8nOrigin}</div>
          <div className="text-[11px] text-muted-foreground">Webhook & Public REST API v1</div>
        </div>

        <div className="p-3.5 rounded-lg bg-muted/40 border border-border space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">PostgreSQL Data Core</span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Đồng bộ
            </span>
          </div>
          <div className="text-xs font-mono font-semibold text-foreground truncate">
            {`postgresql://${POSTGRES_DB_INFO}`}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Phiên: {isAdmin ? "Quản trị viên (Admin)" : "Theo dõi (Guest)"}
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-muted/40 border border-border space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">FoxProfile Antidetect</span>
            <span
              className={`inline-flex items-center gap-1 font-mono text-[11px] ${
                foxOnline ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${foxOnline ? "bg-emerald-500" : "bg-amber-500"}`} />
              {foxOnline ? "Trực tuyến" : "Chưa kết nối"}
            </span>
          </div>
          <div className="text-xs font-mono font-semibold text-foreground tabular-nums">
            {foxOnline
              ? `${desktopStatus?.services.foxprofile.profilesCount || 0} profiles (${
                  desktopStatus?.services.foxprofile.runningCount || 0
                } đang mở)`
              : "127.0.0.1:8010"}
          </div>
          <div className="text-[11px] text-muted-foreground">Camoufox Fingerprint Engine</div>
        </div>

        <div className="p-3.5 rounded-lg bg-muted/40 border border-border space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Webhook Bằng chứng số</span>
            <span
              className={`inline-flex items-center gap-1 font-mono text-[11px] ${
                hookOnline ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${hookOnline ? "bg-emerald-500" : "bg-slate-400"}`} />
              {hookOnline ? ":5680" : "Web Mode"}
            </span>
          </div>
          <div className="text-xs font-mono font-semibold text-foreground tabular-nums">
            {hookOnline
              ? `${desktopStatus?.captureStats.totalSuccess || 0} ảnh / ${
                  desktopStatus?.captureStats.activeJobs || 0
                } hàng đợi`
              : "Chạy trên CAHY Desktop"}
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">screenshot_* & export_fb_cookie</div>
        </div>
      </div>
    </div>
  );
};

export default InfrastructureHeader;
