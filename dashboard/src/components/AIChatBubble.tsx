import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  X,
  Send,
  Bot,
  User,
  Minimize2,
  Database,
  FileText,
  Plus,
  History,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { n8nFetch, onAuthChange } from "@/lib/supabase";
import { getN8nWebhookBaseSync } from "@/lib/desktopBridge";
import {
  sendChatMessage,
  StatusCallback,
  resetSessionId,
  getSessionId,
  setSessionId,
} from "@/lib/aiChat";

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
}

const AIChatBubble = () => {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("isAuthenticated") === "true";
  });

  useEffect(() => {
    const updateAuth = () => {
      setIsAuthenticated(sessionStorage.getItem("isAuthenticated") === "true");
    };
    updateAuth();
    const unsub = onAuthChange(updateAuth);
    return () => unsub();
  }, [location.pathname]);

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleOpenChat = () => setIsOpen(true);
    const handleToggleChat = () => setIsOpen((prev) => !prev);
    window.addEventListener("cahy-open-ai-chat", handleOpenChat);
    window.addEventListener("cahy-toggle-ai-chat", handleToggleChat);
    return () => {
      window.removeEventListener("cahy-open-ai-chat", handleOpenChat);
      window.removeEventListener("cahy-toggle-ai-chat", handleToggleChat);
    };
  }, []);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [hasApiKey, setHasApiKey] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatHistoryRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState<
    { session_id: string; preview: string; updated_at?: string }[]
  >([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const loadHistory = useCallback(
    async (targetSessionId: string) => {
      try {
        const webhookBase = getN8nWebhookBaseSync();
        const res = await n8nFetch(`${webhookBase}get_n8n_dashboard_chat_histories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: targetSessionId }),
        });
        if (res.ok) {
          const textData = await res.text();
          if (!textData) return;
          const responseData = JSON.parse(textData);
          const dataList = Array.isArray(responseData) ? responseData : responseData.messages || [];

          if (dataList && dataList.length > 0) {
            const loaded: DisplayMessage[] = [];
            for (const m of dataList) {
              const msgObj = m.message
                ? typeof m.message === "string"
                  ? JSON.parse(m.message)
                  : m.message
                : m;

              let roleStr = msgObj.type || msgObj.role || "";
              let content = msgObj.content || "";

              if (msgObj.id && Array.isArray(msgObj.id)) {
                if (msgObj.id.includes("HumanMessage")) roleStr = "user";
                if (msgObj.id.includes("AIMessage") || msgObj.id.includes("SystemMessage"))
                  roleStr = "assistant";
              }
              if (msgObj.kwargs && msgObj.kwargs.content) content = msgObj.kwargs.content;
              if (msgObj.data && msgObj.data.content) content = msgObj.data.content;

              const role =
                roleStr === "assistant" ||
                roleStr === "ai" ||
                roleStr.toLowerCase().includes("ai")
                  ? "assistant"
                  : "user";

              if (content && typeof content === "string") {
                loaded.push({ role, content });
              }
            }

            if (loaded.length > 0) {
              setMessages(loaded);
              chatHistoryRef.current = loaded;
              setTimeout(() => scrollToBottom(), 100);
            }
          }
        }
      } catch (err) {
        console.error("Không thể tải lịch sử chat từ Webhook:", err);
      }
    },
    [scrollToBottom]
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    setHasApiKey(true);
    void loadHistory(getSessionId());
  }, [loadHistory, isAuthenticated]);

  const fetchHistoryList = async () => {
    setIsHistoryLoading(true);
    try {
      const webhookBase = getN8nWebhookBaseSync();
      const res = await n8nFetch(`${webhookBase}get_n8n_dashboard_chat_sessions`, {
        method: "GET",
      });
      if (res.ok) {
        const textData = await res.text();
        if (!textData) return;
        const responseData = JSON.parse(textData);
        const dataList = Array.isArray(responseData) ? responseData : responseData.data || [];

        const sessionGroups = new Map<string, Record<string, unknown>[]>();
        for (const item of dataList) {
          const sId = (item.session_id || item.sessionId) as string | undefined;
          if (!sId) continue;
          if (!sessionGroups.has(sId)) {
            sessionGroups.set(sId, []);
          }
          sessionGroups.get(sId)!.push(item);
        }

        const finalArray: {
          session_id: string;
          preview: string;
          updated_at: string;
          latest_id: number;
          latest_time: number;
        }[] = [];

        for (const [sId, items] of sessionGroups.entries()) {
          items.sort((a, b) => {
            if (a.id && b.id && typeof a.id === "number" && typeof b.id === "number") {
              return a.id - b.id;
            }
            const timeA = new Date((a.created_at as string) || 0).getTime();
            const timeB = new Date((b.created_at as string) || 0).getTime();
            return timeA - timeB;
          });

          const firstItem = items[0];
          const lastItem = items[items.length - 1];

          let preview = "";
          try {
            const rawMsg = firstItem.message || firstItem.content || "";
            const m = typeof rawMsg === "string" ? JSON.parse(rawMsg) : rawMsg;
            if (m && m.kwargs && m.kwargs.content) preview = m.kwargs.content;
            else if (m && m.data && m.data.content) preview = m.data.content;
            else if (m && m.content) preview = m.content;
            else if (typeof rawMsg === "string" && !rawMsg.startsWith("{")) preview = rawMsg;
          } catch {
            preview = String(firstItem.message || firstItem.content || "");
          }

          if (!preview || preview.trim() === "" || preview.startsWith("Phiên hội thoại")) {
            if (items.length > 1) {
              try {
                const rawMsg = items[1].message || items[1].content || "";
                const m = typeof rawMsg === "string" ? JSON.parse(rawMsg) : rawMsg;
                if (m && m.kwargs && m.kwargs.content) preview = m.kwargs.content;
                else if (typeof rawMsg === "string" && !rawMsg.startsWith("{")) preview = rawMsg;
              } catch {
                // ignore fallback error
              }
            }
          }

          if (!preview || preview.trim() === "") {
            preview = `Phiên hội thoại ${sId.substring(0, 8)}`;
          } else {
            preview = preview.toString().trim();
            if (preview.length > 44) {
              preview = preview.substring(0, 44) + "...";
            }
          }

          const latestId = typeof lastItem.id === "number" ? lastItem.id : 0;
          const latestTime = new Date(
            ((lastItem.created_at || lastItem.updated_at) as string) || 0
          ).getTime();

          finalArray.push({
            session_id: sId,
            preview,
            updated_at: String(lastItem.created_at || lastItem.updated_at || ""),
            latest_id: latestId,
            latest_time: latestTime,
          });
        }

        finalArray.sort((a, b) => {
          if (a.latest_id && b.latest_id) return b.latest_id - a.latest_id;
          return b.latest_time - a.latest_time;
        });

        setHistoryList(finalArray);
      }
    } catch (err) {
      console.error("Error fetching session list:", err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const toggleHistoryList = () => {
    if (!showHistory) {
      setShowHistory(true);
      void fetchHistoryList();
    } else {
      setShowHistory(false);
    }
  };

  const selectSessionAndLoad = (sId: string) => {
    setSessionId(sId);
    setMessages([]);
    chatHistoryRef.current = [];
    setShowHistory(false);
    void loadHistory(sId);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, statusText, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    const userMessage: DisplayMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    chatHistoryRef.current = [...chatHistoryRef.current, { role: "user", content: trimmed }];
    setInputValue("");
    setIsLoading(true);
    setStreamingText("");
    setStatusText("");

    try {
      const onStatus: StatusCallback = (status) => {
        setStatusText(status);
      };

      const result = await sendChatMessage(
        chatHistoryRef.current,
        (chunk) => {
          setStreamingText((prev) => prev + chunk);
        },
        onStatus
      );

      chatHistoryRef.current = [...chatHistoryRef.current, { role: "assistant", content: result }];
      setMessages((prev) => [...prev, { role: "assistant", content: result }]);
      setStreamingText("");
      setStatusText("");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định";
      const errorContent = `**Lỗi truy vấn:** ${errorMsg}`;
      setMessages((prev) => [...prev, { role: "assistant", content: errorContent }]);
      setStreamingText("");
      setStatusText("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const clearChat = () => {
    resetSessionId();
    setMessages([]);
    chatHistoryRef.current = [];
    setStreamingText("");
    setStatusText("");
    toast.success("Đã khởi tạo phiên phân tích mới.");
  };

  const inlineFormat = (text: string): string => {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, '<code class="ai-chat-code">$1</code>')
      .replace(
        /(https?:\/\/[^\s<>"')\]]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="ai-chat-link">$1</a>'
      );
  };

  const formatMessageContent = (content: string): string => {
    let processedContent = content;

    if (processedContent.includes("<thinking>") && !processedContent.includes("</thinking>")) {
      processedContent += "</thinking>";
    }

    processedContent = processedContent.replace(
      /<thinking>([\s\S]*?)<\/thinking>/g,
      (_, p1) => {
        return `\n<details class="ai-md-thinking"><summary>Quá trình suy luận</summary><div class="content">${p1
          .trim()
          .replace(/\n/g, "<br/>")}</div></details>\n`;
      }
    );

    const lines = processedContent.split("\n");
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.trim().startsWith('<details class="ai-md-thinking">')) {
        result.push(line);
        i++;
        continue;
      }

      if (/^\|.*\|$/.test(line) && i + 1 < lines.length && /^\|[-:| ]+\|$/.test(lines[i + 1])) {
        result.push('<div class="ai-md-table-wrapper"><table class="ai-md-table">');
        const headers = line
          .split("|")
          .filter(Boolean)
          .map((h) => h.trim());
        result.push("<thead><tr>");
        headers.forEach((h) => result.push(`<th>${inlineFormat(h)}</th>`));
        result.push("</tr></thead>");
        i += 2;
        result.push("<tbody>");
        while (i < lines.length && /^\|.*\|$/.test(lines[i])) {
          const cells = lines[i]
            .split("|")
            .filter(Boolean)
            .map((c) => c.trim());
          result.push("<tr>");
          cells.forEach((c) => result.push(`<td>${inlineFormat(c)}</td>`));
          result.push("</tr>");
          i++;
        }
        result.push("</tbody></table></div>");
        continue;
      }

      if (/^#{1,6}\s/.test(line)) {
        const level = line.match(/^(#+)/)?.[1].length || 1;
        const text = line.replace(/^#+\s+/, "");
        const tag = level <= 2 ? "h2" : level === 3 ? "h3" : "h4";
        const cls = level <= 2 ? "ai-md-h2" : level === 3 ? "ai-md-h3" : "ai-md-h4";
        result.push(`<${tag} class="${cls}">${inlineFormat(text)}</${tag}>`);
        i++;
        continue;
      }

      if (/^[-*]{3,}\s*$/.test(line)) {
        result.push('<hr class="ai-md-hr" />');
        i++;
        continue;
      }

      if (/^[-*+]\s/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
          items.push(`<li>${inlineFormat(lines[i].replace(/^[-*+]\s+/, ""))}</li>`);
          i++;
        }
        result.push(`<ul class="ai-md-ul">${items.join("")}</ul>`);
        continue;
      }

      if (/^\d+\.\s/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
          items.push(`<li>${inlineFormat(lines[i].replace(/^\d+\.\s+/, ""))}</li>`);
          i++;
        }
        result.push(`<ol class="ai-md-ol">${items.join("")}</ol>`);
        continue;
      }

      if (/^>\s/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^>\s/.test(lines[i])) {
          items.push(inlineFormat(lines[i].replace(/^>\s*/, "")));
          i++;
        }
        result.push(`<blockquote class="ai-md-blockquote">${items.join("<br/>")}</blockquote>`);
        continue;
      }

      if (line.trim() === "") {
        result.push('<div class="ai-md-spacer"></div>');
        i++;
        continue;
      }

      result.push(`<p class="ai-md-p">${inlineFormat(line)}</p>`);
      i++;
    }

    return result.join("");
  };

  const exportToPDF = () => {
    if (messages.length === 0) return;

    const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistantMessage) return;

    const formatted = formatMessageContent(lastAssistantMessage.content);
    const reportContent = `
      <div class="pdf-message pdf-assistant">
        <div class="pdf-content">${formatted}</div>
      </div>`;

    const html = `
      <!DOCTYPE html><html lang="vi">
      <head>
        <meta charset="UTF-8">
        <title>Báo cáo phân tích - CAHY CyberWatch</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #0f172a; background: #fff; }
          .pdf-body { padding: 28px 36px; }
          .pdf-message { margin-bottom: 20px; }
          .pdf-content { line-height: 1.7; padding: 14px 18px; border-radius: 8px; background: #f8fafc; border-left: 3px solid #2563eb; color: #0f172a; }
          .ai-md-h2 { font-size: 16px; font-weight: 700; margin: 14px 0 8px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
          .ai-md-h3 { font-size: 14px; font-weight: 700; margin: 12px 0 6px; color: #1e3a8a; }
          .ai-md-h4 { font-size: 13px; font-weight: 600; margin: 10px 0 4px; color: #1e40af; }
          .ai-md-hr { border: none; border-top: 1px solid #cbd5e1; margin: 14px 0; }
          .ai-md-ul, .ai-md-ol { padding-left: 20px; margin: 6px 0; }
          .ai-md-ul li, .ai-md-ol li { margin-bottom: 3px; }
          .ai-md-p { margin: 4px 0; }
          .ai-md-spacer { height: 6px; }
          code { background: #eff6ff; padding: 1px 5px; border-radius: 3px; font-size: 0.85em; color: #1d4ed8; }
          a { color: #2563eb; }
          strong { font-weight: 700; }
          .pdf-footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #64748b; text-align: center; }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="pdf-body">
          ${reportContent}
          <div class="pdf-footer">Tài liệu được trích xuất từ Trợ lý Phân tích AI - CAHY CyberWatch</div>
        </div>
      </body></html>`;

    const printWin = window.open("", "_blank", "width=900,height=700");
    if (!printWin) return;
    printWin.document.write(html);
    printWin.document.close();
    printWin.onload = () => {
      printWin.focus();
      printWin.print();
    };
  };

  const suggestedQuestions = [
    "Tổng quan tình hình tin tức hôm nay?",
    "Các chủ đề có tần suất xuất hiện cao trong tuần?",
    "Phân tích tỷ trọng sắc thái bài viết gần đây?",
    "Liệt kê các bài viết tiêu cực cần chú ý?",
  ];

  if (location.pathname === "/login") return null;

  return (
    <>
      {/* Tactical Floating Circular AI Chat Bubble */}
      {/* Icon-only FAB: the old label pill covered card headers; name lives in title/aria-label */}
      <div className="fixed bottom-6 right-6 z-50 select-none">
        <button
          id="ai-chat-toggle"
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-[transform,background-color] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95 motion-reduce:transition-none ${
            isOpen
              ? "bg-card text-foreground border border-border hover:bg-muted shadow-lg"
              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_4px_14px_hsl(var(--primary)/0.35)]"
          }`}
          aria-label={isOpen ? "Đóng Trợ lý Phân tích AI" : "Mở Trợ lý Phân tích AI"}
          title={isOpen ? "Đóng Trợ lý Phân tích AI" : "Mở Trợ lý Phân tích AI"}
        >
          {isOpen ? (
            <X className="w-6 h-6 transition-transform duration-200" strokeWidth={2} />
          ) : (
            <Bot className="w-6 h-6" strokeWidth={1.75} />
          )}
        </button>
      </div>

      {/* Chat Drawer Panel */}
      <div
        ref={chatContainerRef}
        className={`fixed bottom-24 right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] origin-bottom-right ${
          isOpen
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 translate-y-3 pointer-events-none"
        }`}
        style={{ height: "min(620px, calc(100dvh - 7.5rem))" }}
      >
        <div className="flex flex-col h-full rounded-xl overflow-hidden relative bg-card text-card-foreground border border-border shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/35 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="relative w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 text-primary flex items-center justify-center">
                <Bot className="w-4 h-4" strokeWidth={1.75} />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-card" />
              </div>
              <div>
                <h3 className="font-bold text-xs text-foreground">Trợ lý Phân tích Dữ liệu</h3>
                <p className="text-[11px] text-muted-foreground">Truy vấn trực tiếp kho tin tức</p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={exportToPDF}
                disabled={messages.length === 0}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                title="Xuất báo cáo PDF"
              >
                <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={toggleHistoryList}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Lịch sử phiên"
              >
                <History className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={clearChat}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Phiên mới"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Thu nhỏ"
              >
                <Minimize2 className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {/* History Overlay */}
          {showHistory && (
            <div className="absolute inset-x-0 bottom-0 top-[57px] bg-card/98 backdrop-blur-sm z-40 p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-border shrink-0">
                <h4 className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                  <span>Lịch sử hội thoại</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {isHistoryLoading ? (
                  <div className="space-y-2 py-2">
                    {[1, 2, 3].map((k) => (
                      <div key={k} className="h-12 rounded-lg bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : historyList.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8 text-xs">
                    Chưa có phiên hội thoại nào được lưu.
                  </div>
                ) : (
                  historyList.map((item, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => selectSessionAndLoad(item.session_id)}
                      className="w-full text-left p-3 rounded-lg bg-muted/45 hover:bg-muted border border-border transition-colors flex flex-col gap-1"
                    >
                      <div className="text-xs text-foreground truncate font-medium">
                        {item.preview}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground tabular-nums">
                        {item.updated_at
                          ? new Date(item.updated_at).toLocaleString("vi-VN")
                          : `ID: ${item.session_id.substring(0, 8)}`}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {!hasApiKey && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/25 text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span>Chưa cấu hình khóa truy vấn trợ lý AI.</span>
              </div>
            )}

            {messages.length === 0 && hasApiKey && (
              <div className="flex flex-col justify-center h-full gap-4 py-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wider font-mono text-primary">
                    CAHY Intelligence Assistant
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    Đặt câu hỏi để tổng hợp nhanh số liệu hoặc tra cứu bài viết
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Hệ thống truy vấn trực tiếp dữ liệu kênh hiện tại qua luồng phân tích n8n.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full">
                  {suggestedQuestions.map((q, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => {
                        setInputValue(q);
                        inputRef.current?.focus();
                      }}
                      className="text-left px-3 py-2.5 rounded-lg text-xs text-foreground bg-muted/45 hover:bg-muted border border-border transition-colors flex items-center justify-between gap-2 group"
                    >
                      <span>{q}</span>
                      <ArrowUpRight
                        className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0"
                        strokeWidth={1.75}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                <div
                  className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 border ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground border-primary/40"
                      : "bg-muted text-foreground border-border"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User className="w-3.5 h-3.5" strokeWidth={1.75} />
                  ) : (
                    <Bot className="w-3.5 h-3.5" strokeWidth={1.75} />
                  )}
                </div>

                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-xs leading-relaxed border break-words ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground border-primary/30 rounded-tr-sm"
                      : "bg-muted/50 text-foreground border-border rounded-tl-sm"
                  }`}
                  dangerouslySetInnerHTML={{
                    __html: formatMessageContent(msg.content),
                  }}
                />
              </div>
            ))}

            {streamingText && (
              <div className="flex gap-2.5 flex-row">
                <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 bg-muted text-foreground border border-border">
                  <Bot className="w-3.5 h-3.5" strokeWidth={1.75} />
                </div>
                <div
                  className="max-w-[85%] px-3.5 py-2.5 rounded-xl rounded-tl-sm text-xs leading-relaxed bg-muted/50 text-foreground border border-border break-words"
                  dangerouslySetInnerHTML={{
                    __html: formatMessageContent(streamingText),
                  }}
                />
              </div>
            )}

            {isLoading && statusText && !streamingText && (
              <div className="flex gap-2.5 flex-row">
                <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 bg-primary/10 text-primary border border-primary/20">
                  <Database className="w-3.5 h-3.5 animate-pulse" strokeWidth={1.75} />
                </div>
                <div className="px-3.5 py-2.5 rounded-xl rounded-tl-sm bg-muted/45 border border-border text-xs text-muted-foreground">
                  {statusText}
                </div>
              </div>
            )}

            {isLoading && !statusText && !streamingText && (
              <div className="flex gap-2.5 flex-row">
                <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 bg-muted text-foreground border border-border">
                  <Bot className="w-3.5 h-3.5 animate-pulse" strokeWidth={1.75} />
                </div>
                <div className="px-3.5 py-2.5 rounded-xl rounded-tl-sm bg-muted/45 border border-border text-xs text-muted-foreground">
                  Đang truy vấn dữ liệu...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="shrink-0 p-3 border-t border-border bg-muted/25">
            <div className="flex items-end gap-2 rounded-lg p-1.5 bg-background border border-border focus-within:border-primary">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nhập câu hỏi phân tích..."
                disabled={!hasApiKey || isLoading}
                rows={1}
                className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-xs resize-none outline-none px-2 py-1.5 max-h-24"
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = Math.min(target.scrollHeight, 96) + "px";
                }}
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!inputValue.trim() || isLoading || !hasApiKey}
                className="shrink-0 w-8 h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                title="Gửi truy vấn"
              >
                <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .ai-chat-code {
          background: hsl(var(--muted));
          padding: 1px 5px;
          border-radius: 4px;
          font-size: 0.9em;
          font-family: 'JetBrains Mono', Consolas, monospace;
        }
        .ai-chat-link {
          text-decoration: underline;
          text-underline-offset: 2px;
          word-break: break-all;
        }
        .ai-md-thinking {
          margin: 6px 0;
          background: hsl(var(--background));
          border: 1px solid hsl(var(--border));
          border-radius: 6px;
          overflow: hidden;
        }
        .ai-md-thinking summary {
          padding: 6px 10px;
          cursor: pointer;
          font-size: 0.9em;
          color: hsl(var(--muted-foreground));
          font-weight: 600;
          user-select: none;
        }
        .ai-md-thinking .content {
          padding: 8px 10px;
          font-size: 0.9em;
          color: hsl(var(--muted-foreground));
          border-top: 1px solid hsl(var(--border));
          white-space: pre-wrap;
        }
        .ai-md-h2 {
          font-size: 1.05em;
          font-weight: 700;
          margin: 8px 0 4px;
          padding-bottom: 3px;
          border-bottom: 1px solid hsl(var(--border));
        }
        .ai-md-h3 {
          font-size: 0.98em;
          font-weight: 700;
          margin: 6px 0 3px;
        }
        .ai-md-h4 {
          font-size: 0.94em;
          font-weight: 600;
          margin: 5px 0 2px;
        }
        .ai-md-hr {
          border: none;
          border-top: 1px solid hsl(var(--border));
          margin: 8px 0;
        }
        .ai-md-ul {
          list-style: disc;
          margin: 4px 0;
          padding-left: 16px;
        }
        .ai-md-ol {
          list-style: decimal;
          margin: 4px 0;
          padding-left: 16px;
        }
        .ai-md-ul li, .ai-md-ol li {
          margin-bottom: 2px;
          line-height: 1.5;
        }
        .ai-md-p {
          margin: 2px 0;
          line-height: 1.55;
        }
        .ai-md-spacer { height: 5px; }
        .ai-md-table-wrapper {
          overflow-x: auto;
          margin: 8px 0;
          border-radius: 6px;
          border: 1px solid hsl(var(--border));
        }
        .ai-md-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.92em;
          text-align: left;
        }
        .ai-md-table th, .ai-md-table td {
          padding: 6px 10px;
          border-bottom: 1px solid hsl(var(--border));
        }
        .ai-md-table th {
          background: hsl(var(--muted));
          font-weight: 600;
        }
        .ai-md-blockquote {
          margin: 8px 0;
          padding: 6px 12px;
          border-left: 2px solid hsl(var(--primary));
          background: hsl(var(--muted) / 0.5);
          border-radius: 0 6px 6px 0;
        }
      `}</style>
    </>
  );
};

export default AIChatBubble;
