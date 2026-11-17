import React from "react";
import { Layers } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

type ParentSourceDatum = { parent: string; count: number };

const COLORS: Record<string, string> = {
  "Báo": "#2563eb",
  "Facebook": "#0284c7",
  "Telegram": "#0d9488",
  "Facebook Phản động": "#e11d48",
};

export interface ParentSourceDonutProps {
  data: ParentSourceDatum[];
}

const ParentSourceDonut: React.FC<ParentSourceDonutProps> = ({ data }) => {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="surface-panel p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" strokeWidth={1.75} />
            <span>Cơ cấu Nguồn Thu thập</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tỷ trọng bài viết theo nhóm nền tảng gốc trong khung thời gian đang chọn
          </p>
        </div>
        <div className="text-right font-mono tabular-nums">
          <div className="text-lg font-bold text-foreground">{total}</div>
          <div className="text-[11px] text-muted-foreground">tổng bản ghi</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-5 h-60">
          {total === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
              Chưa có dữ liệu trong khoảng thời gian đã chọn.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="parent"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={88}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {data.map((entry) => (
                    <Cell key={entry.parent} fill={COLORS[entry.parent] || "#64748b"} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const p = payload[0];
                      const val = Number(p.value) || 0;
                      const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
                      return (
                        <div className="bg-popover text-popover-foreground px-3 py-2 border border-border rounded-lg shadow-md text-xs">
                          <p className="font-semibold mb-0.5">{p.name}</p>
                          <p className="font-mono tabular-nums text-muted-foreground">
                            {val} bài ({pct}%)
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.map((d) => {
            const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
            const dotColor = COLORS[d.parent] || "#64748b";
            return (
              <div
                key={d.parent}
                className="p-3.5 rounded-lg bg-muted/45 border border-border space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: dotColor }}
                    />
                    <span className="text-xs font-semibold text-foreground truncate">
                      {d.parent}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-foreground tabular-nums">
                    {d.count}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-sm bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-sm transition-all duration-300"
                      style={{ width: `${pct}%`, backgroundColor: dotColor }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums w-9 text-right">
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ParentSourceDonut;
