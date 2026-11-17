import React, { useState, useEffect, useCallback } from "react";
import {
  Workflow,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Camera,
  KeyRound,
  Terminal,
  Plus,
  Power,
  ExternalLink,
  FolderOpen,
  Settings,
  ShieldAlert,
  FileSearch,
  Send,
  Sparkles,
  Server,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ChannelType, n8nFetch, settingsService, Setting, TrendPeriod, POSTGRES_DB_INFO } from "@/lib/supabase";
import {
  callN8nPublicApiViaDesktop,
  controlFoxProfile,
  createFoxProfileFromDashboard,
  DesktopStatusResponse,
  exportLocalFacebookCookie,
  fetchDesktopStatus,
  getN8nWebhookBaseSync,
  isDesktopApp,
  N8nExecutionSummary,
  N8nWorkflowSummary,
  restartLocalFoxProfile,
  testLocalScreenshotCapture,
} from "@/lib/desktopBridge";

interface WorkflowControlCenterProps {
  channel: ChannelType;
  userRole: string | null;
}

interface ActionAuditEntry {
  id: string;
  time: string;
  workflowName: string;
  endpoint: string;
  status: "running" | "success" | "error";
  httpCode?: number;
  durationMs?: number;
  summary: string;
}

const WorkflowControlCenter: React.FC<WorkflowControlCenterProps> = ({ channel, userRole }) => {
  const isAdmin = userRole === "admin";
  const inDesktop = isDesktopApp();

  const [desktopStatus, setDesktopStatus] = useState<DesktopStatusResponse | null>(null);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);

  const [batchUrlsText, setBatchUrlsText] = useState("");
  const [isQueuingUrls, setIsQueuingUrls] = useState(false);
  const [extractUrlInput, setExtractUrlInput] = useState("");
  const [extractedPreview, setExtractedPreview] = useState<string>("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [collectionTarget, setCollectionTarget] = useState<
    "all" | "news" | "facebook" | "phandong"
  >("all");
  const [reportPeriod, setReportPeriod] = useState<TrendPeriod>("day");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<ActionAuditEntry[]>([]);

  const [scheduleSettings, setScheduleSettings] = useState<Record<string, string>>({
    comment_run_time: "22:00",
    post_run_time: "07:00",
    news_scan_interval: "60",
    trend_report_time: "23:30",
  });
  const [webhookBaseInput, setWebhookBaseInput] = useState<string>(() => getN8nWebhookBaseSync());
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const [n8nApiKeyInput, setN8nApiKeyInput] = useState("");
  const [n8nWorkflows, setN8nWorkflows] = useState<N8nWorkflowSummary[]>([]);
  const [n8nExecutions, setN8nExecutions] = useState<N8nExecutionSummary[]>([]);
  const [n8nApiError, setN8nApiError] = useState<string>("");
  const [isLoadingN8nApi, setIsLoadingN8nApi] = useState(false);
  const [togglingWfId, setTogglingWfId] = useState<string | null>(null);

  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileProxy, setNewProfileProxy] = useState("");
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [busyProfileName, setBusyProfileName] = useState<string | null>(null);
  const [shotType, setShotType] = useState<"news" | "fb" | "fbpđ" | "tiktok">("news");
  const [shotProfile, setShotProfile] = useState<string>("auto");
  const [shotUrl, setShotUrl] = useState<string>("https://vnexpress.net");
  const [isCapturing, setIsCapturing] = useState(false);
  const [shotOutput, setShotOutput] = useState<{ path: string; previewUrl?: string } | null>(null);
  const [cookieResult, setCookieResult] = useState<string>("");

  const pushAudit = (entry: Omit<ActionAuditEntry, "id" | "time">): string => {
    const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const record: ActionAuditEntry = {
      id,
      time: new Date().toLocaleTimeString("vi-VN"),
      ...entry,
    };
    setAuditLogs((prev) => [record, ...prev].slice(0, 25));
    return id;
  };

  const updateAudit = (id: string, patch: Partial<ActionAuditEntry>) => {
    setAuditLogs((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const refreshInfrastructure = useCallback(async () => {
    setIsRefreshingStatus(true);
    try {
      const [desk, dbSettings] = await Promise.all([
        fetchDesktopStatus(),
        settingsService.getAllSettings(),
      ]);
      setDesktopStatus(desk);

      const mapped: Record<string, string> = {};
      dbSettings.forEach((s: Setting) => {
        mapped[s.key_name] = s.setting_value;
      });
      if (Object.keys(mapped).length > 0) {
        setScheduleSettings((prev) => ({ ...prev, ...mapped }));
      }
    } catch (error) {
      console.error("Lỗi tải trạng thái hạ tầng:", error);
    } finally {
      setIsRefreshingStatus(false);
    }
  }, []);

  const loadN8nServerWorkflows = useCallback(
    async (explicitKey?: string) => {
      setIsLoadingN8nApi(true);
      setN8nApiError("");
      try {
        const keyToUse = explicitKey !== undefined ? explicitKey : n8nApiKeyInput;
        const [wfRes, exRes] = await Promise.all([
          callN8nPublicApiViaDesktop<{ data?: N8nWorkflowSummary[] }>({
            endpoint: "/workflows?limit=50",
            method: "GET",
            apiKey: keyToUse || undefined,
          }),
          callN8nPublicApiViaDesktop<{ data?: N8nExecutionSummary[] }>({
            endpoint: "/executions?limit=15",
            method: "GET",
            apiKey: keyToUse || undefined,
          }),
        ]);

        if (!wfRes.ok) {
          setN8nApiError(wfRes.error || "Không thể truy vấn n8n Public API.");
          return;
        }
        setN8nWorkflows(Array.isArray(wfRes.data?.data) ? wfRes.data.data : []);
        setN8nExecutions(Array.isArray(exRes.data?.data) ? exRes.data.data : []);
      } finally {
        setIsLoadingN8nApi(false);
      }
    },
    [n8nApiKeyInput]
  );

  useEffect(() => {
    void refreshInfrastructure();
    const timer = setInterval(() => {
      void fetchDesktopStatus().then((st) => {
        if (st) setDesktopStatus(st);
      });
    }, 8000);
    return () => clearInterval(timer);
  }, [refreshInfrastructure]);

  useEffect(() => {
    if (desktopStatus?.services.n8n.hasApiKey && n8nWorkflows.length === 0 && !n8nApiError) {
      void loadN8nServerWorkflows();
    }
  }, [desktopStatus, n8nWorkflows.length, n8nApiError, loadN8nServerWorkflows]);

  const triggerWebhookAction = async (opts: {
    actionKey: string;
    title: string;
    path: string;
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
  }) => {
    const base = getN8nWebhookBaseSync();
    const fullUrl = `${base}${opts.path}`;
    const auditId = pushAudit({
      workflowName: opts.title,
      endpoint: `${opts.method || "POST"} /webhook/${opts.path}`,
      status: "running",
      summary: "Đang gửi lệnh điều khiển tới máy chủ n8n...",
    });
    setBusyAction(opts.actionKey);
    const t0 = Date.now();

    try {
      const res = await n8nFetch(fullUrl, {
        method: opts.method || "POST",
        headers: opts.method === "GET" ? undefined : { "Content-Type": "application/json" },
        body: opts.method === "GET" ? undefined : JSON.stringify(opts.body || {}),
        signal: AbortSignal.timeout(120000),
      });
      const durationMs = Date.now() - t0;
      const rawText = await res.text();
      const shortBody = rawText.length > 220 ? `${rawText.slice(0, 220)}...` : rawText || "OK";

      if (res.ok) {
        updateAudit(auditId, {
          status: "success",
          httpCode: res.status,
          durationMs,
          summary: `Thành công (${res.status}): ${shortBody}`,
        });
        toast.success(`Đã thực thi workflow: ${opts.title}`);
      } else {
        updateAudit(auditId, {
          status: "error",
          httpCode: res.status,
          durationMs,
          summary: `HTTP ${res.status}: ${shortBody}`,
        });
        toast.error(`n8n phản hồi mã ${res.status} cho ${opts.title}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Lỗi kết nối n8n";
      updateAudit(auditId, {
        status: "error",
        durationMs: Date.now() - t0,
        summary: msg,
      });
      toast.error(`Không thể gọi workflow ${opts.title}: ${msg}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleBatchEnqueue = async () => {
    const lines = batchUrlsText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      toast.error("Vui lòng nhập ít nhất 1 đường dẫn bài viết.");
      return;
    }

    const invalid = lines.find((u) => !/^https?:\/\//i.test(u));
    if (invalid) {
      toast.error(`Đường dẫn không hợp lệ: ${invalid}`);
      return;
    }

    setIsQueuingUrls(true);
    const base = getN8nWebhookBaseSync();
    let okCount = 0;
    const t0 = Date.now();
    const auditId = pushAudit({
      workflowName: "Nạp hàng đợi thu thập URL",
      endpoint: "POST /webhook/add-link-to-pending-queue",
      status: "running",
      summary: `Đang nạp ${lines.length} URL...`,
    });

    try {
      for (const url of lines) {
        const res = await n8nFetch(`${base}add-link-to-pending-queue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, channel }),
        });
        if (res.ok) okCount++;
      }

      const summary = `Đã nạp ${okCount}/${lines.length} đường dẫn vào hàng đợi xử lý n8n.`;
      updateAudit(auditId, {
        status: okCount > 0 ? "success" : "error",
        durationMs: Date.now() - t0,
        summary,
      });

      if (okCount === lines.length) {
        toast.success(summary);
        setBatchUrlsText("");
      } else {
        toast.warning(summary);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Lỗi kết nối";
      updateAudit(auditId, { status: "error", durationMs: Date.now() - t0, summary: msg });
      toast.error("Lỗi khi nạp hàng đợi URL: " + msg);
    } finally {
      setIsQueuingUrls(false);
    }
  };

  const handleExtractPostContent = async () => {
    if (!/^https?:\/\//i.test(extractUrlInput.trim())) {
      toast.error("Vui lòng nhập URL hợp lệ (http/https).");
      return;
    }
    setIsExtracting(true);
    setExtractedPreview("");
    const base = getN8nWebhookBaseSync();
    const t0 = Date.now();
    const auditId = pushAudit({
      workflowName: "Bóc tách nội dung bài viết",
      endpoint: "POST /webhook/get-post-content",
      status: "running",
      summary: extractUrlInput.trim(),
    });

    try {
      const res = await n8nFetch(`${base}get-post-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: extractUrlInput.trim(), link: extractUrlInput.trim() }),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw}`);

      let formatted = raw;
      try {
        const parsed = JSON.parse(raw) as unknown;
        const first = Array.isArray(parsed)
          ? (parsed[0] as Record<string, unknown>)
          : (parsed as Record<string, unknown>);
        const text =
          (typeof first?.content === "string" && first.content) ||
          (typeof first?.text === "string" && first.text) ||
          (typeof first?.summary === "string" && first.summary) ||
          JSON.stringify(parsed, null, 2);
        formatted = text;
      } catch {
        // Keep raw text
      }

      setExtractedPreview(formatted);
      updateAudit(auditId, {
        status: "success",
        httpCode: res.status,
        durationMs: Date.now() - t0,
        summary: `Đã trích xuất (${formatted.length} ký tự)`,
      });
      toast.success("Đã trích xuất nội dung bài viết.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Lỗi trích xuất";
      updateAudit(auditId, { status: "error", durationMs: Date.now() - t0, summary: msg });
      toast.error("Không thể bóc tách nội dung: " + msg);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveSchedule = async () => {
    setIsSavingSchedule(true);
    try {
      if (webhookBaseInput.trim().startsWith("http")) {
        const normalized = webhookBaseInput.trim().endsWith("/")
          ? webhookBaseInput.trim()
          : `${webhookBaseInput.trim()}/`;
        localStorage.setItem("cahy_n8n_webhook_base", normalized);
        setWebhookBaseInput(normalized);
      }

      await Promise.all([
        settingsService.updateSetting("comment_run_time", scheduleSettings.comment_run_time),
        settingsService.updateSetting("post_run_time", scheduleSettings.post_run_time),
        settingsService.updateSetting("news_scan_interval", scheduleSettings.news_scan_interval),
        settingsService.updateSetting("trend_report_time", scheduleSettings.trend_report_time),
      ]);
      toast.success("Đã lưu cấu hình lịch chạy và endpoint n8n.");
    } catch {
      toast.error("Không thể lưu thiết lập lịch chạy.");
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleToggleWorkflow = async (wf: N8nWorkflowSummary) => {
    setTogglingWfId(wf.id);
    const action = wf.active ? "deactivate" : "activate";
    try {
      const res = await callN8nPublicApiViaDesktop({
        endpoint: `/workflows/${encodeURIComponent(wf.id)}/${action}`,
        method: "POST",
        apiKey: n8nApiKeyInput || undefined,
      });
      if (!res.ok) {
        toast.error(res.error || "Không thể thay đổi trạng thái workflow.");
        return;
      }
      setN8nWorkflows((prev) =>
        prev.map((item) => (item.id === wf.id ? { ...item, active: !wf.active } : item))
      );
      toast.success(`Đã ${wf.active ? "tạm dừng" : "kích hoạt"} workflow "${wf.name}"`);
    } finally {
      setTogglingWfId(null);
    }
  };

  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) {
      toast.error("Vui lòng nhập tên Profile mới (ví dụ: fb-antt-02).");
      return;
    }
    setIsCreatingProfile(true);
    try {
      await createFoxProfileFromDashboard({
        name: newProfileName.trim(),
        proxy: newProfileProxy.trim(),
      });
      toast.success(`Đã tạo Profile Antidetect "${newProfileName.trim()}"`);
      setNewProfileName("");
      setNewProfileProxy("");
      await refreshInfrastructure();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể tạo Profile");
    } finally {
      setIsCreatingProfile(false);
    }
  };

  const handleProfileBrowserAction = async (name: string, action: "launch" | "stop") => {
    setBusyProfileName(name);
    try {
      await controlFoxProfile(name, action);
      toast.success(
        action === "launch" ? `Đã mở trình duyệt Profile "${name}"` : `Đã đóng Profile "${name}"`
      );
      await refreshInfrastructure();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Lỗi ${action} profile`);
    } finally {
      setBusyProfileName(null);
    }
  };

  const handleCheckProfileCookie = async (name?: string) => {
    const target = name || (shotProfile === "auto" ? "" : shotProfile);
    setBusyProfileName(target || "cookie");
    try {
      const res = await exportLocalFacebookCookie(target);
      if (res.ok) {
        const msg = `Profile "${res.profile_id}" hợp lệ - UID Facebook (c_user): ${res.c_user} (${res.total_cookies || 0} cookies)`;
        setCookieResult(msg);
        toast.success(msg);
      } else {
        const msg = `Profile "${res.profile_id || "N/A"}" chưa có phiên đăng nhập FB hợp lệ: ${res.error}`;
        setCookieResult(msg);
        toast.warning(msg);
      }
      await refreshInfrastructure();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi kiểm tra cookie");
    } finally {
      setBusyProfileName(null);
    }
  };

  const handleRunTestScreenshot = async () => {
    if (!/^https?:\/\//i.test(shotUrl.trim())) {
      toast.error("Đường dẫn chụp bằng chứng phải bắt đầu bằng http:// hoặc https://");
      return;
    }
    setIsCapturing(true);
    setShotOutput(null);
    try {
      const res = await testLocalScreenshotCapture({
        type: shotType,
        url: shotUrl.trim(),
        profileId: shotProfile === "auto" ? "" : shotProfile,
      });
      setShotOutput({
        path: res.outputFilePath,
        previewUrl: res.previewUrl ? `${res.previewUrl}?t=${Date.now()}` : undefined,
      });
      toast.success("Đã chụp bằng chứng số thành công.");
      await refreshInfrastructure();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi chụp màn hình");
    } finally {
      setIsCapturing(false);
    }
  };

  const foxOnline = Boolean(desktopStatus?.services.foxprofile.online);
  const hookOnline = Boolean(desktopStatus?.services.webhook.online);
  const n8nOrigin = (() => {
    try {
      return new URL(getN8nWebhookBaseSync()).origin;
    } catch {
      return "http://localhost:5678";
    }
  })();

  return (
    <div className="space-y-5">
      {/* Unified Infrastructure Command Panel (Cohesive with Page Theme Lock) */}
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
              onClick={() => void refreshInfrastructure()}
              disabled={isRefreshingStatus}
              className="h-8 text-xs gap-1.5 tactile-press"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshingStatus ? "animate-spin" : ""}`}
                strokeWidth={1.75}
              />
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
            <div className="text-xs font-mono font-semibold text-foreground truncate">
              {n8nOrigin}
            </div>
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
                  foxOnline
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    foxOnline ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
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
                  hookOnline
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    hookOnline ? "bg-emerald-500" : "bg-slate-400"
                  }`}
                />
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
            <div className="text-[11px] font-mono text-muted-foreground">
              screenshot_* & export_fb_cookie
            </div>
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <Tabs defaultValue="dispatch" className="w-full">
        <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 h-auto bg-muted p-1 rounded-lg">
          <TabsTrigger value="dispatch" className="py-2 rounded-md text-xs font-semibold gap-1.5">
            <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Kích hoạt & Điều phối Workflows</span>
          </TabsTrigger>
          <TabsTrigger value="server" className="py-2 rounded-md text-xs font-semibold gap-1.5">
            <Server className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Máy chủ n8n & Lịch tự động</span>
          </TabsTrigger>
          <TabsTrigger value="antidetect" className="py-2 rounded-md text-xs font-semibold gap-1.5">
            <Camera className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Antidetect, Cookie FB & Bằng chứng</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: WORKFLOW DISPATCHERS */}
        <TabsContent value="dispatch" className="mt-4 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="surface-panel p-5 space-y-3.5">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary" strokeWidth={1.75} />
                  <span>Nạp URL Hàng loạt vào Hàng đợi Thu thập</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Gửi danh sách bài viết tới workflow{" "}
                  <code className="font-mono text-foreground">add-link-to-pending-queue</code> để bóc tách và chụp bằng chứng.
                </p>
              </div>
              <Textarea
                rows={4}
                value={batchUrlsText}
                onChange={(e) => setBatchUrlsText(e.target.value)}
                placeholder={"https://www.facebook.com/share/p/...\nhttps://vnexpress.net/..."}
                className="font-mono text-xs bg-background"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Mỗi dòng 1 đường dẫn URL (http/https)
                </span>
                <Button
                  size="sm"
                  onClick={() => void handleBatchEnqueue()}
                  disabled={isQueuingUrls}
                  className="h-9 text-xs gap-1.5 tactile-press"
                >
                  {isQueuingUrls ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang nạp...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>Đưa vào hàng đợi xử lý</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="surface-panel p-5 space-y-3.5">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <FileSearch className="w-4 h-4 text-primary" strokeWidth={1.75} />
                  <span>Bóc tách Nhanh Nội dung Bài viết</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Kiểm tra trực tiếp workflow{" "}
                  <code className="font-mono text-foreground">get-post-content</code> trên n8n.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  value={extractUrlInput}
                  onChange={(e) => setExtractUrlInput(e.target.value)}
                  placeholder="Nhập link bài viết Facebook hoặc Báo điện tử..."
                  className="h-9 text-xs font-mono bg-background"
                />
                <Button
                  size="sm"
                  onClick={() => void handleExtractPostContent()}
                  disabled={isExtracting}
                  variant="secondary"
                  className="shrink-0 h-9 text-xs tactile-press"
                >
                  {isExtracting ? "Đang tách..." : "Trích xuất"}
                </Button>
              </div>
              {extractedPreview && (
                <div className="p-3 rounded-lg bg-muted/45 border border-border max-h-36 overflow-y-auto text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                  {extractedPreview}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="surface-panel p-5 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-primary" strokeWidth={1.75} />
                  <span>Quét Nguồn Chủ động</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Phát lệnh quét tức thời tới workflow thu thập nguồn trên n8n.
                </p>
              </div>
              <div className="space-y-2.5">
                <Select
                  value={collectionTarget}
                  onValueChange={(v: "all" | "news" | "facebook" | "phandong") =>
                    setCollectionTarget(v)
                  }
                >
                  <SelectTrigger className="h-9 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toàn bộ nguồn (Báo + FB)</SelectItem>
                    <SelectItem value="news">Báo điện tử</SelectItem>
                    <SelectItem value="facebook">Facebook ANTT</SelectItem>
                    <SelectItem value="phandong">Nguồn Phản động</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="w-full h-9 text-xs gap-1.5 tactile-press"
                  disabled={busyAction === "scan" || !isAdmin}
                  onClick={() =>
                    void triggerWebhookAction({
                      actionKey: "scan",
                      title: `Quét nguồn (${collectionTarget})`,
                      path: "trigger-collection",
                      method: "POST",
                      body: { target: collectionTarget, channel },
                    })
                  }
                >
                  <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>{busyAction === "scan" ? "Đang phát lệnh..." : "Kích hoạt Quét ngay"}</span>
                </Button>
              </div>
            </div>

            <div className="surface-panel p-5 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-primary" strokeWidth={1.75} />
                  <span>Tác chiến & Phản bác AI</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Điều khiển trực tiếp luồng Auto Comment và Sinh bài phản bác.
                </p>
              </div>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 justify-start text-xs gap-2 tactile-press"
                  disabled={busyAction === "run-comment" || !isAdmin}
                  onClick={() =>
                    void triggerWebhookAction({
                      actionKey: "run-comment",
                      title: "Chạy Auto Comment Phản bác",
                      path: "run-comment",
                      method: "GET",
                    })
                  }
                >
                  <Play className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                  <span>Auto Comment (run-comment)</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 justify-start text-xs gap-2 tactile-press"
                  disabled={busyAction === "run-rebuttal" || !isAdmin}
                  onClick={() =>
                    void triggerWebhookAction({
                      actionKey: "run-rebuttal",
                      title: "Sinh Bài Phản bác Tự động",
                      path: "run-rebuttal",
                      method: "GET",
                    })
                  }
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                  <span>Sinh Bài Ngày (run-rebuttal)</span>
                </Button>
              </div>
            </div>

            <div className="surface-panel p-5 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" strokeWidth={1.75} />
                  <span>Tổng hợp Báo cáo Xu hướng</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Yêu cầu n8n tổng hợp báo cáo AI lưu vào bảng{" "}
                  <code className="font-mono text-foreground">trend_reports</code>.
                </p>
              </div>
              <div className="space-y-2.5">
                <Select
                  value={reportPeriod}
                  onValueChange={(v: TrendPeriod) => setReportPeriod(v)}
                >
                  <SelectTrigger className="h-9 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Báo cáo Ngày (24h)</SelectItem>
                    <SelectItem value="week">Báo cáo Tuần (7 ngày)</SelectItem>
                    <SelectItem value="month">Báo cáo Tháng (30 ngày)</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full h-9 text-xs gap-1.5 tactile-press"
                  disabled={busyAction === "trend"}
                  onClick={() =>
                    void triggerWebhookAction({
                      actionKey: "trend",
                      title: `Tổng hợp Báo cáo (${reportPeriod} - ${channel})`,
                      path: "run-trend-report",
                      method: "POST",
                      body: { period: reportPeriod, channel },
                    })
                  }
                >
                  <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>
                    {busyAction === "trend" ? "Đang tổng hợp..." : "Sinh Báo cáo Xu hướng"}
                  </span>
                </Button>
              </div>
            </div>
          </div>

          {/* Live Execution Audit Console */}
          <div className="surface-panel p-5 space-y-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Nhật ký Điều hành & Phản hồi từ n8n</span>
            </h3>
            {auditLogs.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center bg-muted/30 rounded-lg border border-dashed border-border">
                Chưa có lệnh điều khiển workflow nào được phát trong phiên làm việc hiện tại.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-24 text-xs">Thời gian</TableHead>
                      <TableHead className="text-xs">Workflow</TableHead>
                      <TableHead className="text-xs">Endpoint</TableHead>
                      <TableHead className="w-32 text-xs">Trạng thái</TableHead>
                      <TableHead className="text-xs">Kết quả phản hồi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log) => (
                      <TableRow key={log.id} className="text-xs">
                        <TableCell className="font-mono text-muted-foreground tabular-nums">
                          {log.time}
                        </TableCell>
                        <TableCell className="font-semibold text-foreground">
                          {log.workflowName}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {log.endpoint}
                        </TableCell>
                        <TableCell>
                          {log.status === "success" && (
                            <span className="px-2 py-0.5 rounded-md font-mono text-[11px] tabular-nums bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                              OK ({log.durationMs}ms)
                            </span>
                          )}
                          {log.status === "error" && (
                            <span className="px-2 py-0.5 rounded-md font-mono text-[11px] bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25">
                              Lỗi
                            </span>
                          )}
                          {log.status === "running" && (
                            <span className="px-2 py-0.5 rounded-md font-mono text-[11px] bg-primary/10 text-primary border border-primary/25">
                              Đang xử lý
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-md truncate font-mono text-muted-foreground">
                          {log.summary}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 2: N8N SERVER WORKFLOWS & SCHEDULES */}
        <TabsContent value="server" className="mt-4 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="surface-panel p-5 space-y-4 lg:col-span-1">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" strokeWidth={1.75} />
                  <span>Cấu hình Lịch chạy & Webhook Base</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Đồng bộ trực tiếp với bảng{" "}
                  <code className="font-mono text-foreground">settings</code> trên PostgreSQL.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    n8n Webhook Base URL
                  </label>
                  <Input
                    value={webhookBaseInput}
                    onChange={(e) => setWebhookBaseInput(e.target.value)}
                    disabled={!isAdmin}
                    className="h-9 font-mono text-xs bg-background"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Giờ Auto Comment
                    </label>
                    <Input
                      type="time"
                      value={scheduleSettings.comment_run_time}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        setScheduleSettings((s) => ({ ...s, comment_run_time: e.target.value }))
                      }
                      className="h-9 font-mono text-xs bg-background"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Giờ Đăng Phản bác
                    </label>
                    <Input
                      type="time"
                      value={scheduleSettings.post_run_time}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        setScheduleSettings((s) => ({ ...s, post_run_time: e.target.value }))
                      }
                      className="h-9 font-mono text-xs bg-background"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Chu kỳ Quét Báo (phút)
                    </label>
                    <Input
                      type="number"
                      min={5}
                      value={scheduleSettings.news_scan_interval}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        setScheduleSettings((s) => ({ ...s, news_scan_interval: e.target.value }))
                      }
                      className="h-9 font-mono text-xs bg-background tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Giờ Báo cáo Ngày
                    </label>
                    <Input
                      type="time"
                      value={scheduleSettings.trend_report_time}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        setScheduleSettings((s) => ({ ...s, trend_report_time: e.target.value }))
                      }
                      className="h-9 font-mono text-xs bg-background"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => void handleSaveSchedule()}
                  disabled={isSavingSchedule || !isAdmin}
                  className="w-full h-9 text-xs tactile-press"
                >
                  {isSavingSchedule ? "Đang lưu..." : "Lưu lịch trình hệ thống"}
                </Button>
              </div>
            </div>

            <div className="surface-panel p-5 space-y-4 lg:col-span-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Server className="w-4 h-4 text-primary" strokeWidth={1.75} />
                    <span>Danh sách Workflows trên Máy chủ n8n (/api/v1/workflows)</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Bật hoặc tạm dừng trực tiếp các luồng tự động hóa thông qua Desktop API Proxy.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void loadN8nServerWorkflows()}
                  disabled={isLoadingN8nApi}
                  className="h-8 text-xs gap-1.5 tactile-press"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isLoadingN8nApi ? "animate-spin" : ""}`}
                    strokeWidth={1.75}
                  />
                  <span>Tải danh sách</span>
                </Button>
              </div>

              {!desktopStatus?.services.n8n.hasApiKey && (
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={n8nApiKeyInput}
                    onChange={(e) => setN8nApiKeyInput(e.target.value)}
                    placeholder="Nhập X-N8N-API-KEY (hoặc lưu cố định trong Quản trị Trạm Desktop)..."
                    className="h-9 text-xs font-mono bg-background"
                  />
                  <Button
                    size="sm"
                    onClick={() => void loadN8nServerWorkflows(n8nApiKeyInput)}
                    disabled={isLoadingN8nApi || !n8nApiKeyInput.trim()}
                    className="h-9 text-xs shrink-0 tactile-press"
                  >
                    Kết nối API
                  </Button>
                </div>
              )}

              {n8nApiError && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                  <span>{n8nApiError}</span>
                </div>
              )}

              {n8nWorkflows.length > 0 ? (
                <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="text-xs">Tên Workflow</TableHead>
                        <TableHead className="w-28 text-xs">ID</TableHead>
                        <TableHead className="w-28 text-xs">Trạng thái</TableHead>
                        <TableHead className="w-28 text-right text-xs">Điều khiển</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {n8nWorkflows.map((wf) => (
                        <TableRow key={wf.id} className="text-xs">
                          <TableCell className="font-semibold text-foreground">
                            {wf.name}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            {wf.id}
                          </TableCell>
                          <TableCell>
                            {wf.active ? (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                                Đang chạy
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
                                Tạm dừng
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Switch
                              checked={wf.active}
                              disabled={!isAdmin || togglingWfId === wf.id}
                              onCheckedChange={() => void handleToggleWorkflow(wf)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                !n8nApiError && (
                  <div className="text-xs text-muted-foreground py-8 text-center bg-muted/30 rounded-lg border border-dashed border-border">
                    Nhấn &ldquo;Tải danh sách&rdquo; sau khi cấu hình n8n Public API Key để quản lý toàn bộ workflows trực tiếp.
                  </div>
                )
              )}

              {n8nExecutions.length > 0 && (
                <div className="pt-1">
                  <div className="text-xs font-semibold text-foreground mb-2">
                    Lịch sử thực thi gần nhất trên n8n:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {n8nExecutions.slice(0, 8).map((ex) => (
                      <span
                        key={ex.id}
                        className={`px-2 py-0.5 rounded-md font-mono text-[11px] tabular-nums border ${
                          ex.status === "success" || ex.finished
                            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                        }`}
                      >
                        #{ex.id} • WF:{ex.workflowId} •{" "}
                        {ex.status || (ex.finished ? "done" : "error")}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: FOXPROFILE ANTIDETECT & LOCAL EVIDENCE ENGINE */}
        <TabsContent value="antidetect" className="mt-4 space-y-5">
          {!hookOnline ? (
            <div className="surface-panel p-6 flex items-center gap-4 border-amber-500/30 bg-amber-500/5">
              <AlertCircle className="w-6 h-6 text-amber-500 shrink-0" strokeWidth={1.75} />
              <div className="text-xs space-y-1">
                <p className="font-bold text-foreground">
                  Chưa phát hiện Dịch vụ Trạm CAHY CyberWatch Desktop (127.0.0.1:5680)
                </p>
                <p className="text-muted-foreground">
                  Khi vận hành bên trong ứng dụng CAHY CyberWatch Desktop, bạn có thể quản lý trực tiếp trình duyệt Antidetect FoxProfile, kiểm tra Cookie Facebook và chụp bằng chứng số ngay tại đây.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* FoxProfile Manager Card */}
              <div className="surface-panel p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary" strokeWidth={1.75} />
                      <span>Tài khoản Trình duyệt Antidetect (FoxProfile)</span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Mở trình duyệt đăng nhập tài khoản nuôi hoặc trích xuất Cookie Facebook phục vụ n8n.
                    </p>
                  </div>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1 shrink-0 tactile-press"
                      onClick={() =>
                        void restartLocalFoxProfile()
                          .then(() => {
                            toast.success("Đã khởi động lại FoxProfile.");
                            return refreshInfrastructure();
                          })
                          .catch((e: unknown) =>
                            toast.error(e instanceof Error ? e.message : "Lỗi khởi động lại")
                          )
                      }
                    >
                      <Power className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>Restart</span>
                    </Button>
                  )}
                </div>

                {isAdmin && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      placeholder="Tên profile mới (vd: fb-cahy-01)"
                      className="h-9 text-xs font-mono bg-background"
                    />
                    <Input
                      value={newProfileProxy}
                      onChange={(e) => setNewProfileProxy(e.target.value)}
                      placeholder="Proxy tùy chọn (http://user:pass@ip:port)"
                      className="h-9 text-xs font-mono bg-background"
                    />
                    <Button
                      size="sm"
                      onClick={() => void handleCreateProfile()}
                      disabled={isCreatingProfile}
                      className="shrink-0 h-9 text-xs gap-1 tactile-press"
                    >
                      <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>Tạo Profile</span>
                    </Button>
                  </div>
                )}

                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="text-xs">Profile</TableHead>
                        <TableHead className="text-xs">Trạng thái</TableHead>
                        <TableHead className="text-right text-xs">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(desktopStatus?.profiles || []).map((p) => {
                        const running = Boolean(
                          p.is_running || p.running || p.status === "running"
                        );
                        return (
                          <TableRow key={p.name} className="text-xs">
                            <TableCell className="font-mono font-semibold text-foreground">
                              {p.name}
                              <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                                ({p.engine || "camoufox"})
                              </span>
                            </TableCell>
                            <TableCell>
                              {running ? (
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                                  Đang mở
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
                                  Đã dừng
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right space-x-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs tactile-press"
                                disabled={!isAdmin || busyProfileName === p.name}
                                onClick={() =>
                                  void handleProfileBrowserAction(
                                    p.name,
                                    running ? "stop" : "launch"
                                  )
                                }
                              >
                                {running ? "Đóng" : "Mở Browser"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1 tactile-press"
                                disabled={!isAdmin || running || busyProfileName === p.name}
                                title={
                                  running
                                    ? "Đóng trình duyệt trước khi trích xuất cookie"
                                    : "Kiểm tra & trích xuất Cookie Facebook"
                                }
                                onClick={() => void handleCheckProfileCookie(p.name)}
                              >
                                <KeyRound className="w-3 h-3" strokeWidth={1.75} />
                                <span>Cookie FB</span>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {cookieResult && (
                  <div className="p-3 rounded-lg bg-muted/45 border border-border text-xs font-mono text-foreground">
                    {cookieResult}
                  </div>
                )}
              </div>

              {/* Screenshot Evidence Tester & Recent Queue */}
              <div className="surface-panel p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Camera className="w-4 h-4 text-primary" strokeWidth={1.75} />
                      <span>Chụp Bằng chứng số & Hàng đợi (:5680)</span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Kiểm thử trực tiếp các endpoint{" "}
                      <code className="font-mono text-foreground">/webhook/screenshot_*</code>.
                    </p>
                  </div>
                  {inDesktop && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1 shrink-0 tactile-press"
                      onClick={() => void window.cyberwatchDesktop?.openScreenshotFolder()}
                    >
                      <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>Thư mục ảnh</span>
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <Select
                    value={shotType}
                    onValueChange={(v: "news" | "fb" | "fbpđ" | "tiktok") => setShotType(v)}
                  >
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="news">Báo điện tử (screenshot_news)</SelectItem>
                      <SelectItem value="fb">Facebook ANTT (screenshot_fb)</SelectItem>
                      <SelectItem value="fbpđ">FB Phản động (screenshot_fbpđ)</SelectItem>
                      <SelectItem value="tiktok">TikTok (screenshot_tiktok)</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={shotProfile} onValueChange={setShotProfile}>
                    <SelectTrigger className="h-9 text-xs bg-background font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Tự động chọn Profile</SelectItem>
                      {(desktopStatus?.profiles || []).map((p) => (
                        <SelectItem key={p.name} value={p.name}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Input
                    value={shotUrl}
                    onChange={(e) => setShotUrl(e.target.value)}
                    placeholder="https://..."
                    className="h-9 text-xs font-mono bg-background"
                  />
                  <Button
                    size="sm"
                    onClick={() => void handleRunTestScreenshot()}
                    disabled={isCapturing || !isAdmin}
                    className="shrink-0 h-9 text-xs tactile-press"
                  >
                    {isCapturing ? "Đang chụp..." : "Chụp bằng chứng"}
                  </Button>
                </div>

                {shotOutput && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 space-y-2">
                    <div className="text-xs text-emerald-800 dark:text-emerald-300 font-mono break-all flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                      <span>{shotOutput.path}</span>
                    </div>
                    {shotOutput.previewUrl && (
                      <img
                        src={shotOutput.previewUrl}
                        alt="Bằng chứng số vừa chụp"
                        className="max-h-52 rounded-md border border-border"
                      />
                    )}
                  </div>
                )}

                <div className="pt-1 space-y-1.5">
                  <div className="text-xs font-semibold text-foreground font-mono tabular-nums">
                    Hàng đợi gần đây ({desktopStatus?.captureStats.recentJobs.length || 0}):
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
                    <Table>
                      <TableBody>
                        {(desktopStatus?.captureStats.recentJobs || []).slice(0, 6).map((j) => (
                          <TableRow key={j.id} className="text-[11px]">
                            <TableCell className="font-mono text-muted-foreground tabular-nums">
                              {new Date(j.startedAt).toLocaleTimeString("vi-VN")}
                            </TableCell>
                            <TableCell className="font-semibold text-foreground">
                              {j.type}
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground">
                              {j.profile_id}
                            </TableCell>
                            <TableCell className="text-right">
                              <span
                                className={`px-2 py-0.5 rounded-md font-mono tabular-nums border ${
                                  j.status === "success"
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25"
                                    : j.status === "error"
                                      ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25"
                                      : "bg-primary/10 text-primary border-primary/25"
                                }`}
                              >
                                {j.status} ({j.durationMs}ms)
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WorkflowControlCenter;
