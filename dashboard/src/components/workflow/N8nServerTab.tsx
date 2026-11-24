import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Clock, RefreshCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { settingsService } from "@/lib/supabase";
import {
  N8nExecutionSummary,
  N8nWorkflowSummary,
  callN8nPublicApiViaDesktop,
  getN8nWebhookBaseSync,
} from "@/lib/desktopBridge";

interface N8nServerTabProps {
  isAdmin: boolean;
  hasApiKey: boolean;
  scheduleSettings: Record<string, string>;
  onScheduleSettingsChange: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

const N8nServerTab: React.FC<N8nServerTabProps> = ({
  isAdmin,
  hasApiKey,
  scheduleSettings,
  onScheduleSettingsChange,
}) => {
  const [webhookBaseInput, setWebhookBaseInput] = useState<string>(() => getN8nWebhookBaseSync());
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const [n8nApiKeyInput, setN8nApiKeyInput] = useState("");
  const [n8nWorkflows, setN8nWorkflows] = useState<N8nWorkflowSummary[]>([]);
  const [n8nExecutions, setN8nExecutions] = useState<N8nExecutionSummary[]>([]);
  const [n8nApiError, setN8nApiError] = useState("");
  const [isLoadingN8nApi, setIsLoadingN8nApi] = useState(false);
  const [togglingWfId, setTogglingWfId] = useState<string | null>(null);

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
    if (hasApiKey && n8nWorkflows.length === 0 && !n8nApiError) {
      void loadN8nServerWorkflows();
    }
  }, [hasApiKey, n8nWorkflows.length, n8nApiError, loadN8nServerWorkflows]);

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="surface-panel p-5 space-y-4 lg:col-span-1">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" strokeWidth={1.75} />
            <span>Cấu hình Lịch chạy & Webhook Base</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Đồng bộ trực tiếp với bảng <code className="font-mono text-foreground">settings</code> trên PostgreSQL.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">n8n Webhook Base URL</label>
            <Input
              value={webhookBaseInput}
              onChange={(e) => setWebhookBaseInput(e.target.value)}
              disabled={!isAdmin}
              className="h-9 font-mono text-xs bg-background"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Giờ Auto Comment</label>
              <Input
                type="time"
                value={scheduleSettings.comment_run_time}
                disabled={!isAdmin}
                onChange={(e) =>
                  onScheduleSettingsChange((s) => ({ ...s, comment_run_time: e.target.value }))
                }
                className="h-9 font-mono text-xs bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Giờ Đăng Phản bác</label>
              <Input
                type="time"
                value={scheduleSettings.post_run_time}
                disabled={!isAdmin}
                onChange={(e) => onScheduleSettingsChange((s) => ({ ...s, post_run_time: e.target.value }))}
                className="h-9 font-mono text-xs bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Chu kỳ Quét Báo (phút)</label>
              <Input
                type="number"
                min={5}
                value={scheduleSettings.news_scan_interval}
                disabled={!isAdmin}
                onChange={(e) =>
                  onScheduleSettingsChange((s) => ({ ...s, news_scan_interval: e.target.value }))
                }
                className="h-9 font-mono text-xs bg-background tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Giờ Báo cáo Ngày</label>
              <Input
                type="time"
                value={scheduleSettings.trend_report_time}
                disabled={!isAdmin}
                onChange={(e) =>
                  onScheduleSettingsChange((s) => ({ ...s, trend_report_time: e.target.value }))
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
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingN8nApi ? "animate-spin" : ""}`} strokeWidth={1.75} />
            <span>Tải danh sách</span>
          </Button>
        </div>

        {!hasApiKey && (
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
                    <TableCell className="font-semibold text-foreground">{wf.name}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{wf.id}</TableCell>
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
            <div className="text-xs font-semibold text-foreground mb-2">Lịch sử thực thi gần nhất trên n8n:</div>
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
                  #{ex.id} • WF:{ex.workflowId} • {ex.status || (ex.finished ? "done" : "error")}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default N8nServerTab;
