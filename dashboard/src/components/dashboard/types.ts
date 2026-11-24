export type ActiveViewId =
  | "overview"
  | "articles"
  | "analytics"
  | "alerts"
  | "rebuttals"
  | "workflows"
  | "sources";

export type TimeRangeValue = "day" | "week" | "month" | "year" | "all";

export type SentimentStat = { sentiment: string; count: number };
export type KeywordStat = { keyword: string; count: number };
export type DailyTrend = {
  date: string;
  "Tích cực": number;
  "Trung lập": number;
  "Tiêu cực": number;
  "Chưa phân loại"?: number;
};

export interface DashboardStats {
  totalNews: number;
  todayNews: number;
  thaibinh: number;
  hungyen: number;
  processed: number;
}

export const TIME_RANGE_LABELS: Record<TimeRangeValue, string> = {
  day: "Hôm nay",
  week: "7 ngày qua",
  month: "30 ngày qua",
  year: "365 ngày qua",
  all: "Toàn thời gian",
};

export const VIEW_META: Record<ActiveViewId, { title: string; subtitle: string }> = {
  overview: {
    title: "Tổng quan",
    subtitle: "Lưu lượng tin, sắc thái và tín hiệu mới",
  },
  articles: {
    title: "Bài viết",
    subtitle: "Tra cứu, lọc và kiểm chứng bằng chứng",
  },
  analytics: {
    title: "Phân tích",
    subtitle: "Xu hướng sắc thái, từ khóa và nền tảng",
  },
  alerts: {
    title: "Báo cáo",
    subtitle: "Số liệu định kỳ và xuất báo cáo tham mưu",
  },
  rebuttals: {
    title: "Phản bác",
    subtitle: "Hồ sơ tin xấu độc và kết quả xử lý",
  },
  workflows: {
    title: "Tự động hóa",
    subtitle: "Luồng thu thập n8n và chụp bằng chứng",
  },
  sources: {
    title: "Nguồn tin",
    subtitle: "Trang báo, hội nhóm và kênh giám sát",
  },
};

export function getSentimentBadgeClass(sentiment?: string): string {
  switch (sentiment) {
    case "Tích cực":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25";
    case "Tiêu cực":
      return "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25";
    default:
      return "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/25";
  }
}

export function formatDateTimeVi(dateString: string): string {
  if (!dateString) return "N/A";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
