import React from "react";

interface KeywordData {
  keyword: string;
  count: number;
  color?: string;
}

interface KeywordChartProps {
  data: KeywordData[];
  onSelect?: (keyword: string) => void;
  width?: number;
  height?: number;
}

const KeywordChart: React.FC<KeywordChartProps> = ({ data, onSelect }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-56 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
        Chưa có dữ liệu từ khóa trong khung thời gian này.
      </div>
    );
  }

  const maxCount = Math.max(1, ...data.map((item) => item.count));
  const totalMentions = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-3">
      {data.map((item, index) => {
        const widthPct = Math.max(4, Math.round((item.count / maxCount) * 100));
        const sharePct =
          totalMentions > 0 ? ((item.count / totalMentions) * 100).toFixed(1) : "0.0";
        const rank = String(index + 1).padStart(2, "0");
        const barOpacity =
          index === 0
            ? "bg-primary"
            : index < 3
              ? "bg-primary/85"
              : index < 6
                ? "bg-primary/70"
                : "bg-primary/55";

        return (
          <button type="button" onClick={() => onSelect?.(item.keyword)} key={`${item.keyword}-${index}`} className="group block w-full text-left space-y-1.5 rounded focus-visible:outline focus-visible:outline-primary">
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums w-5 shrink-0">
                  {rank}
                </span>
                <span
                  className="font-medium text-foreground truncate"
                  title={item.keyword}
                >
                  {item.keyword}
                </span>
              </div>
              <div className="flex items-center gap-2.5 shrink-0 font-mono tabular-nums">
                <span className="font-semibold text-foreground">{item.count}</span>
                <span className="text-[11px] text-muted-foreground w-12 text-right">
                  lượt
                </span>
              </div>
            </div>
            <div className="h-2 w-full rounded-sm bg-muted overflow-hidden">
              <div
                className={`h-full rounded-sm ${barOpacity} transition-all duration-300 group-hover:brightness-110`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default KeywordChart;
