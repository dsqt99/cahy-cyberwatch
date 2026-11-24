import React from "react";
import {
  Activity,
  Database,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChannelType } from "@/lib/supabase";
import type { ActiveViewId } from "./types";

interface NavItem {
  id: ActiveViewId;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: string | number }>;
  badge?: number;
}

interface DashboardSidebarProps {
  collapsed: boolean;
  isMobileDrawer?: boolean;
  inDesktop: boolean;
  activeTab: ActiveViewId;
  channel: ChannelType;
  userRole: string | null;
  userEmail: string | null;
  theme: "light" | "dark";
  onSelectView: (id: ActiveViewId) => void;
  onChannelChange: (channel: ChannelType) => void;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
}

const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  collapsed,
  isMobileDrawer = false,
  inDesktop,
  activeTab,
  channel,
  userRole,
  userEmail,
  theme,
  onSelectView,
  onChannelChange,
  onToggleCollapse,
  onCloseMobile,
  onToggleTheme,
  onLogout,
}) => {
  const navGroups: { heading: string; items: NavItem[] }[] = [
    {
      heading: "Giám sát",
      items: [
        { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
        { id: "articles", label: "Bài viết", icon: FileText },
        { id: "analytics", label: "Phân tích", icon: Activity },
        { id: "alerts", label: "Báo cáo", icon: FileSpreadsheet },
      ],
    },
    {
      heading: "Tác nghiệp",
      items: [
        { id: "rebuttals", label: "Phản bác", icon: ShieldAlert },
        { id: "workflows", label: "Tự động hóa", icon: Workflow },
      ],
    },
    ...(userRole === "admin"
      ? [
          {
            heading: "Quản trị",
            items: [{ id: "sources" as ActiveViewId, label: "Nguồn tin", icon: Database }],
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--chrome))] text-sidebar-foreground select-none">
      {(!inDesktop || isMobileDrawer) && (
        <div className="h-14 px-3.5 flex items-center justify-between gap-2 shrink-0 border-b border-border/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-card border border-border/80 flex items-center justify-center shrink-0 shadow-xs">
              <img
                src="/Logo-Bo-Cong-An.webp"
                alt="Logo Bộ Công an"
                className="w-6 h-6 object-contain drop-shadow-xs"
              />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold tracking-tight text-foreground truncate">
                    CAHY CyberWatch
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">Công an tỉnh Hưng Yên</p>
              </div>
            )}
          </div>

          {isMobileDrawer ? (
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
              aria-label="Đóng bảng điều hướng"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors shrink-0"
              title={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4" strokeWidth={1.75} />
              ) : (
                <PanelLeftClose className="w-4 h-4" strokeWidth={1.75} />
              )}
            </button>
          )}
        </div>
      )}

      {/* Channel segmented switch */}
      <div
        className={
          inDesktop && !isMobileDrawer
            ? "h-[57px] px-3 flex flex-col justify-center shrink-0 border-b border-border/70"
            : "px-3 pt-3 pb-1 shrink-0"
        }
      >
        <div
          role="radiogroup"
          aria-label="Kênh giám sát"
          className={
            collapsed
              ? "flex flex-col gap-1"
              : "grid grid-cols-2 p-0.5 rounded-lg bg-muted/70 ring-1 ring-border/60"
          }
        >
          {(
            [
              { id: "ANTT", short: "AN", label: "ANTT", title: "Kênh An ninh trật tự", active: "text-foreground" },
              {
                id: "Phản Động",
                short: "PĐ",
                label: "Phản động",
                title: "Kênh theo dõi đối tượng phản động",
                active: "text-rose-600 dark:text-rose-400",
              },
            ] as const
          ).map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={channel === c.id}
              onClick={() => onChannelChange(c.id)}
              title={c.title}
              className={`h-7 rounded-md text-xs font-medium transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                channel === c.id
                  ? `bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.12)] ${c.active}`
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {collapsed ? c.short : c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped Navigation Items */}
      <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-3">
        {navGroups.map((group) => (
          <div key={group.heading} className="space-y-0.5">
            {!collapsed && (
              <div className="px-2.5 pt-1 pb-1 text-xs font-medium text-muted-foreground">{group.heading}</div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectView(item.id)}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={`w-full flex items-center ${
                    collapsed ? "justify-center px-0 h-9" : "justify-between px-2.5 h-8"
                  } rounded-lg text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    isActive
                      ? "bg-card text-foreground font-medium shadow-[0_1px_2px_hsl(var(--foreground)/0.08)] ring-1 ring-border/70"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                      strokeWidth={1.75}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </div>
                  {!collapsed && item.badge !== undefined && (
                    <span className="text-[11px] font-medium text-primary tabular-nums">+{item.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {inDesktop && !isMobileDrawer && (
        <div className="p-3 shrink-0 border-t border-border/50">
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`w-full h-8 flex items-center gap-2.5 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors duration-150 ${
              collapsed ? "justify-center px-0" : "px-2.5"
            }`}
            aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            aria-expanded={!collapsed}
            title={collapsed ? "Mở rộng thanh điều hướng" : undefined}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span>Thu gọn</span>
              </>
            )}
          </button>
        </div>
      )}

      {!inDesktop && (
        <div className="p-2.5 border-t border-border/50 space-y-2 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === "dark" ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
            className={`w-full flex items-center ${
              collapsed ? "justify-center py-2" : "justify-between px-2.5 py-1.5"
            } rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors`}
          >
            <div className="flex items-center gap-2">
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-amber-400" strokeWidth={1.75} />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" strokeWidth={1.75} />
              )}
              {!collapsed && <span>{theme === "dark" ? "Chế độ Sáng" : "Chế độ Tối"}</span>}
            </div>
          </button>

          <div
            className={`rounded-xl bg-card/60 dark:bg-muted/30 border border-border/70 ${
              collapsed ? "p-1.5 flex flex-col items-center gap-1.5" : "p-2.5 space-y-2"
            }`}
          >
            {!collapsed && (
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0" strokeWidth={1.75} />
                  <span className="text-xs font-semibold text-foreground truncate" title={userEmail || "Phiên khách"}>
                    {userEmail || "Phiên khách"}
                  </span>
                </div>
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-primary/10 text-primary shrink-0">
                  {userRole === "admin" ? "Quản trị" : !userRole || userRole === "guest" ? "Khách" : "Cán bộ"}
                </span>
              </div>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onLogout}
              title="Đăng xuất khỏi phiên làm việc"
              className={`w-full h-7 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:bg-rose-500/10 ${
                collapsed ? "px-0 justify-center" : "justify-start px-2"
              }`}
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
              {!collapsed && <span className="ml-2">Đăng xuất</span>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardSidebar;
