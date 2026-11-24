import { Link, useSearchParams } from "react-router-dom";
import PostsList from "@/components/PostsList";
import type { ChannelType } from "@/lib/supabase";
export default function Posts() {
  const saved = localStorage.getItem("current_channel");
  const [params] = useSearchParams();
  const requested = params.get("articles_channel");
  const channel: ChannelType =
    requested === "ANTT" || requested === "Phản Động" || requested === "all"
      ? requested
      : saved === "Phản Động" || saved === "all"
        ? saved
        : "ANTT";
  return (
    <main className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto space-y-5">
        <Link className="text-sm text-primary hover:underline" to="/">
          ← Tổng quan
        </Link>
        <h1 className="text-2xl font-semibold">Bài viết</h1>
        <PostsList channel={channel} />
      </div>
    </main>
  );
}
