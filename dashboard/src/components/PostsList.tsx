import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  newsService,
  sourcesService,
  NEWS_TOPICS,
  type NewsItem,
  type ChannelType,
} from "@/lib/supabase";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm min-w-0";
const dateText = (value?: string) =>
  value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleString("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Chưa có";
const safeUrl = (value?: string) => {
  try {
    const u = new URL(value || "");
    return ["http:", "https:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
};
function Sentiment({ post }: { post: NewsItem }) {
  const name = ["Tích cực", "Trung lập", "Tiêu cực"].includes(
    post.sentiment?.name,
  )
    ? post.sentiment.name
    : "Chưa phân loại";
  return (
    <Badge
      variant="outline"
      className={`whitespace-nowrap ${name === "Tiêu cực" ? "text-rose-500 border-rose-500/30" : name === "Tích cực" ? "text-emerald-500 border-emerald-500/30" : "text-muted-foreground"}`}
    >
      {name}
    </Badge>
  );
}

export default function PostsList({
  channel,
  refreshVersion = 0,
}: {
  channel: ChannelType;
  refreshVersion?: number;
}) {
  const [params, setParams] = useSearchParams();
  const get = (key: string, fallback = "") =>
    params.get(`articles_${key}`) ?? fallback;
  const search = get("search"),
    sentiment = get("sentiment", "all"),
    source = get("source", "all"),
    topic = get("topic", "all");
  const start = get("start"),
    end = get("end"),
    view = get("view", "table");
  const sort = get("sort") === "oldest" ? "oldest" : "newest";
  const requestedPage = Number(get("page", "1"));
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.floor(requestedPage) || 1)
    : 1;
  const requestedSize = Number(get("size", "20")),
    size = [20, 50, 100].includes(requestedSize) ? requestedSize : 20;
  const [posts, setPosts] = useState<NewsItem[]>([]),
    [count, setCount] = useState(0);
  const [sources, setSources] = useState<string[]>([]),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const invalidDates = Boolean(start && end && start > end);
  const requestScope = JSON.stringify([
    page,
    size,
    search,
    sentiment,
    source,
    topic,
    start,
    end,
    channel,
    sort,
  ]);
  const previousScope = useRef(requestScope);
  const tableScroll = useRef<HTMLDivElement>(null);
  const successfulScope = useRef<string | null>(null);
  const update = (key: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set("articles_channel", channel);
        if (value) next.set(`articles_${key}`, value);
        else next.delete(`articles_${key}`);
        if (!["page", "view"].includes(key)) next.delete("articles_page");
        return next;
      },
      { replace: true },
    );
  const clear = () =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set("articles_channel", channel);
        [
          "search",
          "sentiment",
          "source",
          "topic",
          "start",
          "end",
          "page",
        ].forEach((k) => next.delete(`articles_${k}`));
        return next;
      },
      { replace: true },
    );
  useEffect(() => {
    let active = true;
    setSources([]);
    sourcesService
      .getAllSources(channel)
      .then((data) => {
        if (active)
          setSources(
            [...new Set(data.map((s) => s.name).filter(Boolean))].sort(),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [channel]);
  useEffect(() => {
    let active = true;
    setSelected(null);
    setLoading(true);
    setError("");
    if (previousScope.current !== requestScope) {
      setPosts([]);
      setCount(0);
      successfulScope.current = null;
      tableScroll.current?.scrollTo({ top: 0, left: 0 });
      previousScope.current = requestScope;
    }
    if (invalidDates) {
      setLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await newsService.getPaginatedNews(
          page,
          size,
          search,
          sentiment === "all" ? undefined : sentiment,
          source === "all" ? undefined : source,
          "custom",
          channel,
          topic === "all" ? undefined : topic,
          start,
          end,
          sort,
        );
        if (!active) return;
        const last = Math.max(1, Math.ceil(result.count / size));
        if (page > last)
          setParams(
            (previous) => {
              const next = new URLSearchParams(previous);
              next.set("articles_page", String(last));
              return next;
            },
            { replace: true },
          );
        setPosts(result.data);
        setCount(result.count);
        successfulScope.current = requestScope;
      } catch {
        if (active)
          setError(
            successfulScope.current === requestScope
              ? "Không tải được bài viết. Dữ liệu bên dưới chưa được cập nhật; hãy thử lại."
              : "Không tải được bài viết cho bộ lọc này. Hãy thử lại.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    page,
    size,
    search,
    sentiment,
    source,
    topic,
    start,
    end,
    channel,
    sort,
    requestScope,
    retry,
    refreshVersion,
    invalidDates,
    setParams,
  ]);
  const totalPages = Math.max(1, Math.ceil(count / size));
  const headline = (post: NewsItem) =>
    post.content?.trim() || post.summary?.trim() || "Chưa có nội dung";
  const sourceLink = (post: NewsItem) =>
    safeUrl(post.link) && (
      <a
        href={safeUrl(post.link)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-primary hover:underline"
      >
        Nguồn ↗
      </a>
    );
  const cards = (
    <div className="grid gap-3">
      {posts.map((post) => (
        <article key={post.id} className="surface-panel p-4 space-y-3">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-sm font-medium">
              {post.source?.name || "Nguồn chưa định danh"}
            </span>
            <Sentiment post={post} />
          </div>
          <button
            className="text-left text-sm font-semibold line-clamp-2 hover:text-primary"
            onClick={() => setSelected(post)}
          >
            {headline(post)}
          </button>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {post.summary || "Chưa có tóm tắt"}
          </p>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Đăng: {dateText(post.publish_date)} · Thu thập:{" "}
              {dateText(post.created_at)}
            </span>
            {sourceLink(post)}
          </div>
        </article>
      ))}
    </div>
  );
  return (
    <section className="space-y-4" aria-label="Danh sách bài viết">
      <div className="surface-panel p-4 space-y-3">
        <label className="block text-sm font-medium">
          Tìm nội dung, tóm tắt hoặc từ khóa
          <Input
            className="mt-2"
            value={search}
            onChange={(e) => update("search", e.target.value)}
            placeholder="Nhập từ khóa…"
          />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Sắc thái
            <select
              className={selectClass}
              value={sentiment}
              onChange={(e) => update("sentiment", e.target.value)}
            >
              <option value="all">Tất cả sắc thái</option>
              {["Tích cực", "Trung lập", "Tiêu cực"].map((s) => (
                <option key={s}>{s}</option>
              ))}
              <option value="Unknown">Chưa phân loại</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Nguồn
            <select
              className={selectClass}
              value={source}
              onChange={(e) => update("source", e.target.value)}
            >
              <option value="all">Tất cả nguồn</option>
              {source !== "all" && !sources.includes(source) && (
                <option>{source}</option>
              )}
              {sources.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Chủ đề
            <select
              className={selectClass}
              value={topic}
              onChange={(e) => update("topic", e.target.value)}
            >
              <option value="all">Tất cả chủ đề</option>
              {NEWS_TOPICS.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Ngày đăng từ
            <Input
              type="date"
              value={start}
              onChange={(e) => update("start", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Đến ngày
            <Input
              type="date"
              value={end}
              min={start || undefined}
              onChange={(e) => update("end", e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap justify-between items-center gap-2">
          <Button variant="ghost" size="sm" onClick={clear}>
            Xóa bộ lọc
          </Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Sắp xếp theo thu thập
            <select
              className={selectClass}
              value={sort}
              onChange={(e) => update("sort", e.target.value)}
            >
              <option value="newest">Mới nhất trước</option>
              <option value="oldest">Cũ nhất trước</option>
            </select>
          </label>
        </div>
      </div>
      {invalidDates && (
        <p role="alert" className="text-sm text-destructive">
          Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm"
        >
          {error}
          <Button
            variant="outline"
            size="sm"
            className="ml-3"
            onClick={() => setRetry((n) => n + 1)}
          >
            Thử lại
          </Button>
        </div>
      )}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <p role="status" className="text-sm text-muted-foreground">
          {loading
            ? "Đang tải bài viết…"
            : `${count.toLocaleString("vi-VN")} bài viết · Kênh ${channel}`}
        </p>
        <div className="flex items-center gap-2">
          <label className="text-xs">
            Số bài/trang{" "}
            <select
              className={selectClass}
              value={size}
              onChange={(e) => update("size", e.target.value)}
            >
              {[20, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <div className="hidden md:flex gap-1">
            <Button
              size="sm"
              variant={view === "table" ? "secondary" : "ghost"}
              aria-pressed={view === "table"}
              onClick={() => update("view", "table")}
            >
              Bảng
            </Button>
            <Button
              size="sm"
              variant={view === "cards" ? "secondary" : "ghost"}
              aria-pressed={view === "cards"}
              onClick={() => update("view", "cards")}
            >
              Thẻ
            </Button>
          </div>
        </div>
      </div>
      <div
        aria-busy={loading}
        className={
          loading || invalidDates ? "opacity-50 pointer-events-none" : ""
        }
      >
        {!loading && !error && !invalidDates && posts.length === 0 ? (
          <div className="surface-panel p-10 text-center text-muted-foreground">
            Không có bài viết phù hợp. Thử đổi hoặc xóa bộ lọc.
          </div>
        ) : (
          <>
            <div className={view === "cards" ? "" : "md:hidden"}>{cards}</div>
            {view !== "cards" && (
              <div
                ref={tableScroll}
                className="hidden md:block surface-panel overflow-auto max-h-[65vh]"
              >
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="sticky top-0 bg-background z-10">
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      {[
                        "Thời gian đăng / thu thập",
                        "Nội dung",
                        "Nguồn",
                        "Sắc thái",
                        "Tóm tắt",
                        "Thao tác",
                      ].map((h) => (
                        <th key={h} className="p-3 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((post) => (
                      <tr
                        key={post.id}
                        className="border-b last:border-0 hover:bg-muted/40"
                      >
                        <td className="p-3 whitespace-nowrap text-xs tabular-nums">
                          {dateText(post.publish_date)}
                          <span
                            className="block mt-1 text-muted-foreground"
                            title="Ngày thu thập"
                          >
                            {dateText(post.created_at)}
                          </span>
                        </td>
                        <td className="p-3 min-w-[250px] max-w-lg">
                          <button
                            onClick={() => setSelected(post)}
                            className="text-left font-medium line-clamp-2 hover:text-primary"
                          >
                            {headline(post)}
                          </button>
                        </td>
                        <td className="p-3 max-w-40">
                          <span className="line-clamp-2">
                            {post.source?.name || "Chưa định danh"}
                          </span>
                        </td>
                        <td className="p-3">
                          <Sentiment post={post} />
                        </td>
                        <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                          {post.summary?.trim() ? "Đã có" : "Chưa có"}
                        </td>
                        <td className="p-3">
                          <button
                            className="text-xs text-primary hover:underline block mb-2"
                            onClick={() => setSelected(post)}
                          >
                            Chi tiết
                          </button>
                          {sourceLink(post)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          Trang {page} / {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => update("page", String(page - 1))}
          >
            Trước
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages || loading}
            onClick={() => update("page", String(page + 1))}
          >
            Sau
          </Button>
        </div>
      </div>
      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Chi tiết bài viết</SheetTitle>
            <SheetDescription>
              {selected?.source?.name || "Nguồn chưa định danh"}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="space-y-5 mt-5">
              <div className="flex justify-between items-center">
                <Sentiment post={selected} />
                {sourceLink(selected)}
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Ngày đăng: {dateText(selected.publish_date)}</p>
                <p>Ngày thu thập: {dateText(selected.created_at)}</p>
              </div>
              <section>
                <h3 className="font-semibold mb-2">Tóm tắt</h3>
                <p className="text-sm whitespace-pre-wrap">
                  {selected.summary || "Chưa có tóm tắt"}
                </p>
              </section>
              <section>
                <h3 className="font-semibold mb-2">Nội dung gốc</h3>
                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                  {selected.content || "Chưa có nội dung"}
                </p>
              </section>
              {selected.keywords && (
                <p className="text-xs text-muted-foreground">
                  Từ khóa: {selected.keywords}
                </p>
              )}
              {safeUrl(selected.screenshot) && (
                <a
                  href={safeUrl(selected.screenshot)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    loading="lazy"
                    src={safeUrl(selected.screenshot)}
                    alt="Ảnh chụp bài viết"
                    className="rounded-lg border mt-4"
                  />
                </a>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
