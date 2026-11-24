import React, { useState } from "react";
import { FileSearch, Play, Plus, RefreshCw, Send, ShieldAlert, Sparkles, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ChannelType, TrendPeriod, n8nFetch } from "@/lib/supabase";
import { getN8nWebhookBaseSync } from "@/lib/desktopBridge";

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

interface DispatchTabProps {
  channel: ChannelType;
  isAdmin: boolean;
}

const DispatchTab: React.FC<DispatchTabProps> = ({ channel, isAdmin }) => {
  const [batchUrlsText, setBatchUrlsText] = useState("");
  const [isQueuingUrls, setIsQueuingUrls] = useState(false);
  const [extractUrlInput, setExtractUrlInput] = useState("");
  const [extractedPreview, setExtractedPreview] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [collectionTarget, setCollectionTarget] = useState<"all" | "news" | "facebook" | "phandong">("all");
  const [reportPeriod, setReportPeriod] = useState<TrendPeriod>("day");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<ActionAuditEntry[]>([]);

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
      updateAudit(auditId, { status: "error", durationMs: Date.now() - t0, summary: msg });
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
        formatted =
          (typeof first?.content === "string" && first.content) ||
          (typeof first?.text === "string" && first.text) ||
          (typeof first?.summary === "string" && first.summary) ||
          JSON.stringify(parsed, null, 2);
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

  return (
    <div className="space-y-5">
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
            <span className="text-[11px] text-muted-foreground">Mỗi dòng 1 đường dẫn URL (http/https)</span>
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
              Kiểm tra trực tiếp workflow <code className="font-mono text-foreground">get-post-content</code> trên n8n.
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
              onValueChange={(v: "all" | "news" | "facebook" | "phandong") => setCollectionTarget(v)}
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
            <Select value={reportPeriod} onValueChange={(v: TrendPeriod) => setReportPeriod(v)}>
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
              <span>{busyAction === "trend" ? "Đang tổng hợp..." : "Sinh Báo cáo Xu hướng"}</span>
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
                    <TableCell className="font-mono text-muted-foreground tabular-nums">{log.time}</TableCell>
                    <TableCell className="font-semibold text-foreground">{log.workflowName}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{log.endpoint}</TableCell>
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
                    <TableCell className="max-w-md truncate font-mono text-muted-foreground">{log.summary}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DispatchTab;
