import React, { useState, useEffect } from "react";
import {
  Clock,
  Send,
  Trash2,
  RefreshCw,
  Play,
  Settings2,
  FileText,
  MessageSquare,
  ExternalLink,
  Edit3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  rebuttalsService,
  settingsService,
  newsService,
  Rebuttal,
  Setting,
  NewsItem,
  n8nFetch,
} from "@/lib/supabase";
import { getN8nWebhookBaseSync } from "@/lib/desktopBridge";
import { toast } from "sonner";
import ManualPost from "./ManualPost";

interface RebuttalManagementProps {
  channel?: string;
  userRole?: string | null;
}

export const RebuttalManagement = ({
  channel = "Phản Động",
  userRole,
}: RebuttalManagementProps) => {
  const showControls = userRole === "admin" && channel === "Phản Động";
  const [rebuttals, setRebuttals] = useState<Rebuttal[]>([]);
  const [comments, setComments] = useState<NewsItem[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({
    comment_run_time: "22:00",
    post_run_time: "07:00",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("posts");
  const [selectedDate, setSelectedDate] = useState("all");

  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    rebuttal: Rebuttal | null;
  }>({ open: false, rebuttal: null });
  const [editForm, setEditForm] = useState({ title: "", content: "" });
  const [postingIds, setPostingIds] = useState<Set<string>>(new Set());
  const [commentingIds, setCommentingIds] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [rebuttalsData, settingsData, newsData] = await Promise.all([
        rebuttalsService.getAllRebuttals(),
        settingsService.getAllSettings(),
        newsService.getAllNews(100, "Phản Động"),
      ]);

      setRebuttals(rebuttalsData);
      setComments(newsData);

      const settingsObj: Record<string, string> = {};
      settingsData.forEach((s: Setting) => {
        settingsObj[s.key_name] = s.setting_value;
      });
      if (Object.keys(settingsObj).length > 0) {
        setSettings((prev) => ({ ...prev, ...settingsObj }));
      }
    } catch (error) {
      console.error("Lỗi lấy dữ liệu:", error);
      toast.error("Không thể tải dữ liệu phản bác.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await Promise.all([
        settingsService.updateSetting("comment_run_time", settings.comment_run_time),
        settingsService.updateSetting("post_run_time", settings.post_run_time),
      ]);
      toast.success("Đã cập nhật khung giờ tự động.");
    } catch {
      toast.error("Lỗi khi lưu thiết lập.");
    } finally {
      setIsSaving(false);
    }
  };

  const extractUrl = (data: unknown): string | undefined => {
    if (!data) return undefined;
    const rawObj = Array.isArray(data) ? (data[0] as unknown) : data;
    if (!rawObj || typeof rawObj !== "object") return undefined;
    const obj = rawObj as Record<string, unknown>;
    const keys = [
      "post_url",
      "postUrl",
      "url",
      "link",
      "comment_url",
      "commentUrl",
      "permalink",
      "permalink_url",
    ];
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.startsWith("http")) return v;
    }
    return undefined;
  };

  const handleApproveAndPost = async (id: string) => {
    setPostingIds((prev) => new Set(prev).add(id));
    const url = `${getN8nWebhookBaseSync()}post-rebuttal`;
    toast.info("Đang gửi lệnh đăng bài lên Fanpage qua n8n (tối đa 600s)...");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000);

    n8nFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rebuttalId: id }),
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(timeoutId);
        if (res.ok) {
          let postUrl: string | undefined;
          try {
            postUrl = extractUrl(await res.clone().json());
          } catch {
            // non-json response
          }
          setRebuttals((prev) =>
            prev.map((r) =>
              r.id === id
                ? { ...r, status: "published", ...(postUrl ? { post_url: postUrl } : {}) }
                : r
            )
          );
          toast.success("Đã đăng bài thành công.");
        } else {
          setRebuttals((prev) =>
            prev.map((r) => (r.id === id ? { ...r, status: "error" } : r))
          );
          toast.error("Webhook n8n phản hồi lỗi.");
        }
      })
      .catch((err: Error) => {
        clearTimeout(timeoutId);
        if (err.name === "AbortError") {
          toast.error("Yêu cầu quá hạn (600s). n8n có thể vẫn đang xử lý nền.");
        } else {
          toast.error("Không thể kết nối webhook n8n.");
        }
      })
      .finally(() => {
        setPostingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Xác nhận xóa bài viết phản biện này?")) return;
    try {
      const { error } = await rebuttalsService.deleteRebuttal(id);
      if (error) throw error;
      toast.success("Đã xóa bài viết.");
      setRebuttals(rebuttals.filter((r) => r.id !== id));
    } catch {
      toast.error("Lỗi khi xóa bài viết.");
    }
  };

  const handleOpenEdit = (rebuttal: Rebuttal) => {
    setEditForm({ title: rebuttal.title, content: rebuttal.content });
    setEditDialog({ open: true, rebuttal });
  };

  const handleSaveEdit = async () => {
    if (!editDialog.rebuttal) return;
    if (!editForm.title.trim()) {
      toast.error("Tiêu đề không được để trống.");
      return;
    }
    if (!editForm.content.trim()) {
      toast.error("Nội dung không được để trống.");
      return;
    }

    try {
      const { error } = await rebuttalsService.updateRebuttal(editDialog.rebuttal.id, {
        title: editForm.title,
        content: editForm.content,
      });
      if (error) throw error;
      toast.success("Đã cập nhật bài viết.");
      setEditDialog({ open: false, rebuttal: null });
      setRebuttals(
        rebuttals.map((r) =>
          r.id === editDialog.rebuttal!.id
            ? { ...r, title: editForm.title, content: editForm.content }
            : r
        )
      );
    } catch {
      toast.error("Lỗi khi lưu bài viết.");
    }
  };

  const handleRunNow = async (type: "comment" | "rebuttal") => {
    const base = getN8nWebhookBaseSync();
    const url = type === "comment" ? `${base}run-comment` : `${base}run-rebuttal`;

    toast.info(
      `Đang kích hoạt luồng ${type === "comment" ? "bình luận tự động" : "biên soạn bài phản bác"}...`
    );
    try {
      await n8nFetch(url, { method: "GET" });
      toast.success("Đã phát lệnh kích hoạt tới n8n.");
      setTimeout(() => void fetchData(), 8000);
    } catch (error) {
      toast.error("Kích hoạt thất bại. Kiểm tra lại webhook trên n8n.");
      console.error(error);
    }
  };

  const handleCommentSingle = async (id: string) => {
    setCommentingIds((prev) => new Set(prev).add(id));
    const url = `${getN8nWebhookBaseSync()}run-a-comment`;
    toast.info("Đang gửi lệnh bình luận phản bác bài viết này (tối đa 600s)...");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000);

    n8nFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newsId: id }),
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(timeoutId);
        if (res.ok) {
          let commentUrl: string | undefined;
          try {
            commentUrl = extractUrl(await res.clone().json());
          } catch {
            // non-json response
          }
          setComments((prev) =>
            prev.map((c) =>
              c.id === id ? { ...c, comment_status: commentUrl || "https://done" } : c
            )
          );
          toast.success("Đã thực thi bình luận thành công.");
        } else {
          toast.error("Webhook n8n phản hồi lỗi.");
        }
      })
      .catch((err: Error) => {
        clearTimeout(timeoutId);
        if (err.name === "AbortError") {
          toast.error("Yêu cầu quá hạn (600s). n8n có thể vẫn đang xử lý nền.");
        } else {
          toast.error("Không thể kết nối webhook n8n.");
        }
      })
      .finally(() => {
        setCommentingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
            Đã đăng
          </span>
        );
      case "error":
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25">
            Đăng lỗi
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-muted text-muted-foreground border border-border">
            Chờ duyệt
          </span>
        );
    }
  };

  const dateKey = (d?: string | null) => {
    if (!d) return "";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "";
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const formatDateLabel = (key: string) => {
    if (!key) return "Không rõ ngày";
    const [y, m, d] = key.split("-");
    return `${d}/${m}/${y}`;
  };

  const availableDates = Array.from(
    new Set(
      [
        ...rebuttals.map((r) => dateKey(r.created_at)),
        ...comments.map((c) => dateKey(c.publish_date)),
      ].filter(Boolean)
    )
  ).sort((a, b) => b.localeCompare(a));

  const filteredRebuttals =
    selectedDate === "all"
      ? rebuttals
      : rebuttals.filter((r) => dateKey(r.created_at) === selectedDate);

  const filteredComments =
    selectedDate === "all"
      ? comments
      : comments.filter((c) => dateKey(c.publish_date) === selectedDate);

  const groupByDate = <T,>(items: T[], getDate: (i: T) => string) => {
    const map = new Map<string, T[]>();
    items.forEach((i) => {
      const k = getDate(i);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(i);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  };

  const groupedRebuttals = groupByDate(filteredRebuttals, (r) => dateKey(r.created_at));
  const groupedComments = groupByDate(filteredComments, (c) => dateKey(c.publish_date));

  return (
    <div className="space-y-5">
      {showControls && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="surface-panel p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary" strokeWidth={1.75} />
                <span>Lịch Tự động Tác chiến</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Đồng bộ khung giờ chạy quy trình tự động trên n8n
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Giờ Auto Comment
                </label>
                <Input
                  type="time"
                  value={settings.comment_run_time}
                  onChange={(e) =>
                    setSettings({ ...settings, comment_run_time: e.target.value })
                  }
                  className="h-9 bg-background font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Giờ Sinh Bài Phản bác
                </label>
                <Input
                  type="time"
                  value={settings.post_run_time}
                  onChange={(e) =>
                    setSettings({ ...settings, post_run_time: e.target.value })
                  }
                  className="h-9 bg-background font-mono text-xs"
                />
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => void handleSaveSettings()}
              disabled={isSaving}
              className="w-full h-9 text-xs tactile-press"
            >
              {isSaving && <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              <span>Lưu khung giờ vận hành</span>
            </Button>
          </div>

          <div className="surface-panel p-5 flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Play className="w-4 h-4 text-primary" strokeWidth={1.75} />
                <span>Kích hoạt Tác chiến Tức thời</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Phát lệnh chạy ngay quy trình trên n8n không chờ lịch định kỳ
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Button
                variant="outline"
                size="sm"
                className="h-10 justify-start text-xs gap-2 tactile-press"
                onClick={() => void handleRunNow("comment")}
              >
                <MessageSquare className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                <span>Chạy Auto Comment</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-10 justify-start text-xs gap-2 tactile-press"
                onClick={() => void handleRunNow("rebuttal")}
              >
                <FileText className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                <span>Sinh Bài Phản bác</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="surface-panel p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">
              Quản lý Đấu tranh & Phản bác Thông tin Xấu độc
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kiểm duyệt bài viết phản biện AI, theo dõi bình luận tự động và biên soạn kịch bản thủ công
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger className="h-9 w-36 text-xs bg-background font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Tất cả ngày</SelectItem>
                {availableDates.map((d) => (
                  <SelectItem key={d} value={d}>
                    {formatDateLabel(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchData()}
              disabled={isLoading}
              className="h-9 text-xs gap-1.5 tactile-press"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
                strokeWidth={1.75}
              />
              <span>Làm mới</span>
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-lg grid-cols-3 bg-muted p-1 rounded-lg h-9">
            <TabsTrigger value="posts" className="text-xs gap-1.5 rounded-md">
              <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Bài phản biện</span>
            </TabsTrigger>
            <TabsTrigger value="comments" className="text-xs gap-1.5 rounded-md">
              <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Nhật ký bình luận</span>
            </TabsTrigger>
            <TabsTrigger value="manual" className="text-xs gap-1.5 rounded-md">
              <Edit3 className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Soạn thủ công</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab === "posts" && (
          <div className="space-y-5">
            {isLoading && rebuttals.length === 0 ? (
              <div className="space-y-3">
                {[1, 2].map((k) => (
                  <div key={k} className="p-4 rounded-xl border border-border space-y-3">
                    <div className="h-4 w-64 rounded bg-muted animate-pulse" />
                    <div className="h-24 w-full rounded bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            ) : filteredRebuttals.length === 0 ? (
              <div className="text-center py-10 text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                Chưa có bài viết phản biện nào
                {selectedDate !== "all" ? " trong ngày đã chọn." : "."}
              </div>
            ) : (
              groupedRebuttals.map(([dateK, items]) => (
                <div key={dateK} className="space-y-3">
                  <div className="flex items-center gap-2 py-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-muted border border-border font-mono text-xs font-semibold text-foreground tabular-nums">
                      <Clock className="w-3 h-3 text-primary" strokeWidth={1.75} />
                      {formatDateLabel(dateK)}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground tabular-nums">
                      {items.length} bài viết
                    </span>
                  </div>

                  {items.map((rebuttal) => (
                    <div
                      key={rebuttal.id}
                      className="border border-border rounded-xl p-4 bg-card hover:border-primary/35 transition-colors space-y-3"
                    >
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <h3 className="font-bold text-sm text-foreground">
                            {rebuttal.title}
                          </h3>
                          <div className="text-[11px] font-mono text-muted-foreground tabular-nums mt-1 flex items-center gap-1.5">
                            <Clock className="w-3 h-3" strokeWidth={1.75} />
                            <span>
                              Khởi tạo: {new Date(rebuttal.created_at).toLocaleString("vi-VN")}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0">{getStatusBadge(rebuttal.status)}</div>
                      </div>

                      <div className="bg-muted/35 p-3.5 rounded-lg text-xs text-foreground/90 whitespace-pre-wrap border border-border max-h-56 overflow-y-auto leading-relaxed">
                        {rebuttal.content}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {rebuttal.status === "published" && rebuttal.post_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="h-8 text-xs text-primary gap-1.5"
                          >
                            <a
                              href={rebuttal.post_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                              <span>Xem bài đăng</span>
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(rebuttal)}
                          className="h-8 text-xs gap-1.5 tactile-press"
                        >
                          <Edit3 className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>Chỉnh sửa</span>
                        </Button>
                        {(rebuttal.status === "draft" || rebuttal.status === "error") && (
                          <Button
                            size="sm"
                            disabled={postingIds.has(rebuttal.id)}
                            onClick={() => void handleApproveAndPost(rebuttal.id)}
                            className="h-8 text-xs gap-1.5 tactile-press"
                          >
                            {postingIds.has(rebuttal.id) ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
                            )}
                            <span>
                              {rebuttal.status === "error" ? "Đăng lại" : "Duyệt & Đăng"}
                            </span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDelete(rebuttal.id)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Xóa bài viết"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "manual" && <ManualPost />}

        {activeTab === "comments" && (
          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[145px] text-xs">Thời gian</TableHead>
                  <TableHead className="text-xs">Nội dung bài viết mục tiêu</TableHead>
                  <TableHead className="w-[115px] text-xs">Trạng thái</TableHead>
                  <TableHead className="text-right w-[130px] text-xs">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && comments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredComments.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-10 text-xs text-muted-foreground"
                    >
                      Không có dữ liệu bình luận
                      {selectedDate !== "all" ? " trong ngày đã chọn." : "."}
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedComments.flatMap(([dateK, items]) => [
                    <TableRow
                      key={`hdr-${dateK}`}
                      className="bg-muted/40 hover:bg-muted/40"
                    >
                      <TableCell
                        colSpan={4}
                        className="py-2 font-mono text-xs font-semibold text-foreground tabular-nums"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-primary" strokeWidth={1.75} />
                          {formatDateLabel(dateK)}
                        </span>
                        <span className="ml-2 font-normal text-muted-foreground">
                          ({items.length} mục)
                        </span>
                      </TableCell>
                    </TableRow>,
                    ...items.map((item) => {
                      const done =
                        item.comment_status &&
                        typeof item.comment_status === "string" &&
                        item.comment_status.startsWith("http");
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs font-mono text-muted-foreground tabular-nums">
                            {new Date(item.publish_date).toLocaleString("vi-VN", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[560px] space-y-1">
                              <p
                                className="text-xs text-foreground line-clamp-2 leading-relaxed"
                                title={item.content || item.summary}
                              >
                                {item.content || item.summary || "Không có nội dung"}
                              </p>
                              {item.link && (
                                <a
                                  href={item.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                                >
                                  <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
                                  <span>Mở bài gốc</span>
                                </a>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {done ? (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                                Đã bình luận
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                                Đang chờ
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {done ? (
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                                className="h-7 text-xs gap-1"
                              >
                                <a
                                  href={item.comment_status as string}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <MessageSquare className="w-3 h-3" strokeWidth={1.75} />
                                  <span>Xem</span>
                                </a>
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 text-xs gap-1 tactile-press"
                                disabled={commentingIds.has(item.id)}
                                onClick={() => void handleCommentSingle(item.id)}
                              >
                                {commentingIds.has(item.id) ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Send className="w-3 h-3" strokeWidth={1.75} />
                                )}
                                <span>Phản bác</span>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    }),
                  ])
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog
        open={editDialog.open}
        onOpenChange={(open) => {
          if (!open) setEditDialog({ open: false, rebuttal: null });
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Chỉnh sửa bài viết phản biện
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Tiêu đề</label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Nhập tiêu đề bài viết"
                className="bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nội dung</label>
              <textarea
                value={editForm.content}
                onChange={(e) => setEditForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Nhập nội dung"
                rows={14}
                className="flex min-h-[280px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring leading-relaxed"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditDialog({ open: false, rebuttal: null })}
            >
              Hủy
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSaveEdit()}
              className="tactile-press"
            >
              Lưu thay đổi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RebuttalManagement;
