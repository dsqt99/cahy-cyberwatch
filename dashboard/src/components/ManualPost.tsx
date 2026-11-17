import { useState } from "react";
import {
  Sparkles,
  Wand2,
  CheckCircle2,
  Send,
  Loader2,
  PencilLine,
  Copy,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { rebuttalsService, createRebuttal, n8nFetch } from "@/lib/supabase";
import { getN8nWebhookBaseSync } from "@/lib/desktopBridge";

const POST_TIMEOUT = 600_000;
const GET_CONTENT_TIMEOUT = 60_000;

interface Scenario {
  title: string;
  content: string;
  imageBase64?: string;
  imageLoading?: boolean;
  posting?: boolean;
  postUrl?: string;
}

const extractUrlFromResponse = (data: unknown): string | undefined => {
  if (!data) return undefined;
  if (typeof data === "string") {
    return data.startsWith("http") ? data.trim() : undefined;
  }

  const obj = Array.isArray(data) ? data[0] : data;
  if (!obj || typeof obj !== "object" || obj === null) return undefined;

  const record = obj as Record<string, unknown>;
  const keys = ["post_url"];

  for (const k of keys) {
    const val = record[k];
    if (typeof val === "string" && val.startsWith("http")) {
      return val.trim();
    }
  }

  for (const subKey of ["json", "data", "body", "result", "output"]) {
    if (
      record[subKey] &&
      (typeof record[subKey] === "object" || typeof record[subKey] === "string")
    ) {
      const nested = extractUrlFromResponse(record[subKey]);
      if (nested) return nested;
    }
  }

  return undefined;
};

const extractContentFromResponse = (data: unknown): string => {
  if (!data) return "";

  if (typeof data === "string") {
    try {
      const parsed: unknown = JSON.parse(data);
      if (parsed && typeof parsed === "object") {
        return extractContentFromResponse(parsed);
      }
    } catch {
      return data;
    }
    return data;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const extracted = extractContentFromResponse(item);
      if (extracted) return extracted;
    }
    return "";
  }

  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;

    if (typeof obj.content === "string" && obj.content.trim()) {
      return obj.content.trim();
    }

    if (obj.content && typeof obj.content === "object") {
      const nested = extractContentFromResponse(obj.content);
      if (nested) return nested;
    }

    if (obj.json && typeof obj.json === "object") {
      const jsonContent = extractContentFromResponse(obj.json);
      if (jsonContent) return jsonContent;
    }

    for (const key of ["data", "body", "result", "payload", "output", "item"]) {
      if (obj[key] && (typeof obj[key] === "object" || Array.isArray(obj[key]))) {
        const nested = extractContentFromResponse(obj[key]);
        if (nested) return nested;
      }
    }

    for (const altKey of ["text", "message", "post_content", "body_text"]) {
      if (typeof obj[altKey] === "string" && (obj[altKey] as string).trim()) {
        return (obj[altKey] as string).trim();
      }
    }
  }

  return "";
};

const base64ToBlob = (base64Data: string, defaultType = "image/png"): Blob => {
  const cleanB64 = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  const match = base64Data.match(/^data:(image\/[a-zA-Z]+);base64,/);
  const mimeType = match ? match[1] : defaultType;

  const byteCharacters = atob(cleanB64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

export const ManualPost = () => {
  const [linkUrl, setLinkUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [isFetchingContent, setIsFetchingContent] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const handleFetchContent = async () => {
    if (!linkUrl.trim()) {
      toast.error("Vui lòng nhập đường dẫn bài viết trước.");
      return;
    }

    setIsFetchingContent(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GET_CONTENT_TIMEOUT);

      const res = await n8nFetch(`${getN8nWebhookBaseSync()}get-post-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: linkUrl.trim(),
          link: linkUrl.trim(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      let content = "";
      const raw = await res.text();
      if (raw) {
        try {
          const data: unknown = JSON.parse(raw);
          content = extractContentFromResponse(data);
        } catch {
          content = raw;
        }
      }

      if (!content.trim()) {
        throw new Error("Nội dung rỗng hoặc không tìm thấy trường văn bản");
      }

      setSourceText(content.trim());
      toast.success("Đã trích xuất nội dung bài viết từ URL.");
    } catch (err) {
      console.error("Lỗi lấy nội dung:", err);
      toast.error("Không lấy được nội dung tự động, vui lòng dán văn bản thủ công.");
    } finally {
      setIsFetchingContent(false);
    }
  };

  const updateScenario = (idx: number, patch: Partial<Scenario>) => {
    setScenarios((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const handleGenerate = async () => {
    if (!sourceText.trim()) {
      toast.error("Vui lòng nhập nội dung bài viết cần đấu tranh phản bác.");
      return;
    }

    setIsGenerating(true);
    setScenarios([]);

    try {
      const res = await n8nFetch(`${getN8nWebhookBaseSync()}generate-rebuttals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaries: [sourceText.trim()] }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: unknown = await res.json();

      const items = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
      const nested =
        items[0] && typeof items[0] === "object"
          ? (items[0] as Record<string, unknown>).rebuttals
          : undefined;
      const sourceList = Array.isArray(nested)
        ? nested
        : items.flatMap((it) => (it && typeof it === "object" ? [it as Record<string, unknown>] : []));

      const parsed: Scenario[] = sourceList
        .map((item, index) => ({
          title:
            typeof item.title === "string" && item.title.trim()
              ? item.title.trim()
              : `Phương án ${index + 1}`,
          content: typeof item.content === "string" ? item.content : "",
        }))
        .filter((s) => s.content.trim());

      if (parsed.length === 0) {
        toast.error("Luồng AI không trả về kịch bản nào. Vui lòng thử lại.");
        return;
      }

      setScenarios(parsed.slice(0, 3));
      setSelectedIdx(0);
      toast.success(`Đã biên soạn ${Math.min(parsed.length, 3)} phương án phản bác.`);
    } catch (err) {
      console.error("Lỗi tạo kịch bản:", err);
      toast.error("Không thể gọi webhook tạo kịch bản trên n8n.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateImage = async (idx: number) => {
    const scenario = scenarios[idx];
    if (!scenario?.content.trim()) {
      toast.error("Phương án chưa có nội dung, chưa thể tạo ảnh.");
      return;
    }

    updateScenario(idx, { imageLoading: true });
    try {
      const res = await n8nFetch(`${getN8nWebhookBaseSync()}generate-rebuttal-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: scenario.content }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get("content-type") || "";
      let b64 = "";

      if (contentType.includes("image/") || contentType.includes("application/octet-stream")) {
        const arrayBuffer = await res.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        b64 = btoa(binary);
      } else {
        const rawText = await res.text();
        try {
          const data: unknown = JSON.parse(rawText);
          const obj = Array.isArray(data) ? data[0] : data;
          if (obj && typeof obj === "object") {
            const record = obj as Record<string, unknown>;
            b64 =
              (typeof record.image_base64 === "string" && record.image_base64) ||
              (typeof record.imageBase64 === "string" && record.imageBase64) ||
              (typeof record.image === "string" && record.image) ||
              "";
          }
        } catch {
          b64 = rawText.trim();
        }
      }

      if (!b64) {
        throw new Error("Thiếu dữ liệu ảnh trong phản hồi");
      }

      updateScenario(idx, { imageBase64: b64 });
      toast.success("Đã tạo ảnh minh họa cho phương án.");
    } catch (err) {
      console.error("Lỗi tạo ảnh:", err);
      toast.error("Không thể tạo ảnh minh họa qua n8n.");
    } finally {
      updateScenario(idx, { imageLoading: false });
    }
  };

  const handlePublish = async (idx: number) => {
    const scenario = scenarios[idx];
    if (!scenario?.title.trim() || !scenario.content.trim()) {
      toast.error("Phương án cần có đủ tiêu đề và nội dung trước khi đăng.");
      return;
    }

    updateScenario(idx, { posting: true });

    try {
      const { id, error } = await createRebuttal({
        title: scenario.title,
        content: scenario.content,
        status: "draft",
      });

      if (error || !id) throw new Error("Không tạo được bản ghi rebuttal");

      if (scenario.imageBase64) {
        await rebuttalsService.updateRebuttal(id, { image_base64: scenario.imageBase64 });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), POST_TIMEOUT);

      let res: Response;

      if (scenario.imageBase64) {
        const imageBlob = base64ToBlob(scenario.imageBase64);
        const formData = new FormData();
        formData.append("content", scenario.content);
        formData.append("title", scenario.title);
        formData.append("rebuttalId", id);
        formData.append("text", scenario.content);
        formData.append("image_base64", scenario.imageBase64);
        formData.append("data", imageBlob, "rebuttal_image.png");
        formData.append("image", imageBlob, "rebuttal_image.png");
        formData.append("file", imageBlob, "rebuttal_image.png");

        res = await n8nFetch(`${getN8nWebhookBaseSync()}post-rebuttal-manual`, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
      } else {
        res = await n8nFetch(`${getN8nWebhookBaseSync()}post-rebuttal-manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: scenario.content,
            title: scenario.title,
            rebuttalId: id,
          }),
          signal: controller.signal,
        });
      }

      clearTimeout(timeoutId);

      if (res.status === 401) {
        toast.error("Lỗi xác thực (HTTP 401): Phiên làm việc hết hạn hoặc không đủ quyền.");
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      let postUrl: string | undefined;
      try {
        const rawText = await res.text();
        if (rawText) {
          try {
            const data: unknown = JSON.parse(rawText);
            postUrl = extractUrlFromResponse(data);
          } catch {
            if (rawText.trim().startsWith("http")) {
              postUrl = rawText.trim();
            }
          }
        }
      } catch (e) {
        console.warn("Không đọc được body phản hồi:", e);
      }

      if (postUrl) {
        updateScenario(idx, { postUrl });
        await rebuttalsService.updateRebuttal(id, { post_url: postUrl, status: "published" });
      }

      toast.success("Đã đăng bài phản bác lên Fanpage.");
    } catch (err) {
      console.error("Lỗi đăng bài:", err);
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.error("Yêu cầu quá hạn (10 phút). n8n có thể vẫn đang xử lý nền.");
      } else {
        toast.error("Đăng bài thất bại. Kiểm tra lại webhook post-rebuttal-manual.");
      }
    } finally {
      updateScenario(idx, { posting: false });
    }
  };

  const handleCopy = async (idx: number) => {
    try {
      await navigator.clipboard.writeText(scenarios[idx].content);
      toast.success("Đã sao chép nội dung kịch bản.");
    } catch {
      toast.error("Không thể sao chép nội dung.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-xl bg-muted/35 border border-border space-y-4">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <PencilLine className="h-4 w-4 text-primary" strokeWidth={1.75} />
            <span>Biên soạn Kịch bản Phản bác Chủ động</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Trích xuất nội dung từ đường dẫn mục tiêu hoặc nhập trực tiếp luận điệu sai trái để AI đề xuất 3 phương án đấu tranh.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Dán đường dẫn bài viết mục tiêu (Facebook, Báo điện tử...)"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isFetchingContent) void handleFetchContent();
            }}
            className="h-9 bg-background text-xs font-mono"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleFetchContent()}
            disabled={isFetchingContent}
            className="shrink-0 h-9 gap-1.5 text-xs tactile-press"
          >
            {isFetchingContent ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            <span>{isFetchingContent ? "Đang trích xuất..." : "Trích xuất từ URL"}</span>
          </Button>
        </div>

        <Textarea
          placeholder="Nội dung bài viết cần phản bác..."
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          className="min-h-[160px] bg-background text-sm leading-relaxed"
        />

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => void handleGenerate()}
            disabled={isGenerating}
            className="h-9 gap-1.5 text-xs tactile-press"
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            <span>{isGenerating ? "Đang sinh kịch bản..." : "Sinh 3 phương án phản bác"}</span>
          </Button>
        </div>
      </div>

      {!isGenerating && scenarios.length > 0 && (
        <Tabs value={String(selectedIdx)} onValueChange={(v) => setSelectedIdx(Number(v))}>
          <TabsList className="grid w-full max-w-md grid-cols-3 bg-muted p-1 rounded-lg h-9">
            {scenarios.map((s, i) => (
              <TabsTrigger key={i} value={String(i)} className="text-xs rounded-md">
                Phương án {i + 1}
                {s.imageBase64 && (
                  <CheckCircle2
                    className="ml-1.5 h-3.5 w-3.5 text-emerald-500"
                    strokeWidth={1.75}
                  />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {scenarios.map((scenario, i) => (
            <TabsContent key={i} value={String(i)} className="mt-4">
              <div className="p-4 rounded-xl bg-muted/25 border border-border space-y-4">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold">Tiêu đề bài phản biện</Label>
                  <Input
                    value={scenario.title}
                    onChange={(e) => updateScenario(i, { title: e.target.value })}
                    className="bg-background h-9 text-sm"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold">Nội dung chi tiết</Label>
                  <Textarea
                    value={scenario.content}
                    onChange={(e) => updateScenario(i, { content: e.target.value })}
                    className="min-h-[220px] bg-background text-sm leading-relaxed"
                  />
                </div>

                {scenario.imageBase64 ? (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Ảnh minh họa đính kèm</Label>
                    <img
                      src={`data:image/png;base64,${scenario.imageBase64}`}
                      alt="Minh họa kịch bản phản bác"
                      className="max-w-sm rounded-lg border border-border"
                    />
                  </div>
                ) : (
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleGenerateImage(i)}
                      disabled={scenario.imageLoading || !scenario.content.trim()}
                      className="h-9 gap-1.5 text-xs tactile-press"
                    >
                      {scenario.imageLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      )}
                      <span>
                        {scenario.imageLoading ? "Đang dựng ảnh..." : "Tạo ảnh minh họa AI"}
                      </span>
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  <Button
                    size="sm"
                    onClick={() => void handlePublish(i)}
                    disabled={scenario.posting}
                    className="h-9 gap-1.5 text-xs tactile-press"
                  >
                    {scenario.posting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
                    )}
                    <span>{scenario.posting ? "Đang xuất bản..." : "Phê duyệt & Đăng bài"}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCopy(i)}
                    className="h-9 gap-1.5 text-xs tactile-press"
                  >
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>Sao chép</span>
                  </Button>
                  {scenario.postUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="h-9 gap-1.5 text-xs text-primary"
                    >
                      <a href={scenario.postUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                        <span>Mở bài trên Fanpage</span>
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
};

export default ManualPost;
