import React, { useCallback, useEffect, useState } from "react";
import { Camera, Play, Server } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChannelType, Setting, settingsService } from "@/lib/supabase";
import {
  DesktopStatusResponse,
  fetchDesktopStatus,
  getN8nWebhookBaseSync,
  isDesktopApp,
} from "@/lib/desktopBridge";
import InfrastructureHeader from "@/components/workflow/InfrastructureHeader";
import DispatchTab from "@/components/workflow/DispatchTab";
import N8nServerTab from "@/components/workflow/N8nServerTab";
import AntidetectTab from "@/components/workflow/AntidetectTab";

interface WorkflowControlCenterProps {
  channel: ChannelType;
  userRole: string | null;
}

const WorkflowControlCenter: React.FC<WorkflowControlCenterProps> = ({ channel, userRole }) => {
  const isAdmin = userRole === "admin";
  const inDesktop = isDesktopApp();

  const [desktopStatus, setDesktopStatus] = useState<DesktopStatusResponse | null>(null);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [scheduleSettings, setScheduleSettings] = useState<Record<string, string>>({
    comment_run_time: "22:00",
    post_run_time: "07:00",
    news_scan_interval: "60",
    trend_report_time: "23:30",
  });

  const refreshInfrastructure = useCallback(async () => {
    setIsRefreshingStatus(true);
    try {
      const [desk, dbSettings] = await Promise.all([
        fetchDesktopStatus(),
        settingsService.getAllSettings(),
      ]);
      setDesktopStatus(desk);

      const mapped: Record<string, string> = {};
      dbSettings.forEach((s: Setting) => {
        mapped[s.key_name] = s.setting_value;
      });
      if (Object.keys(mapped).length > 0) {
        setScheduleSettings((prev) => ({ ...prev, ...mapped }));
      }
    } catch (error) {
      console.error("Lỗi tải trạng thái hạ tầng:", error);
    } finally {
      setIsRefreshingStatus(false);
    }
  }, []);

  useEffect(() => {
    void refreshInfrastructure();
    const timer = setInterval(() => {
      void fetchDesktopStatus().then((st) => {
        if (st) setDesktopStatus(st);
      });
    }, 8000);
    return () => clearInterval(timer);
  }, [refreshInfrastructure]);

  const n8nOrigin = (() => {
    try {
      return new URL(getN8nWebhookBaseSync()).origin;
    } catch {
      return "http://localhost:5678";
    }
  })();

  return (
    <div className="space-y-5">
      <InfrastructureHeader
        channel={channel}
        isAdmin={isAdmin}
        inDesktop={inDesktop}
        n8nOrigin={n8nOrigin}
        desktopStatus={desktopStatus}
        isRefreshingStatus={isRefreshingStatus}
        onRefresh={() => void refreshInfrastructure()}
      />

      <Tabs defaultValue="dispatch" className="w-full">
        <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 h-auto bg-muted p-1 rounded-lg">
          <TabsTrigger value="dispatch" className="py-2 rounded-md text-xs font-semibold gap-1.5">
            <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Kích hoạt & Điều phối Workflows</span>
          </TabsTrigger>
          <TabsTrigger value="server" className="py-2 rounded-md text-xs font-semibold gap-1.5">
            <Server className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Máy chủ n8n & Lịch tự động</span>
          </TabsTrigger>
          <TabsTrigger value="antidetect" className="py-2 rounded-md text-xs font-semibold gap-1.5">
            <Camera className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Antidetect, Cookie FB & Bằng chứng</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dispatch" className="mt-4">
          <DispatchTab channel={channel} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="server" className="mt-4">
          <N8nServerTab
            isAdmin={isAdmin}
            hasApiKey={Boolean(desktopStatus?.services.n8n.hasApiKey)}
            scheduleSettings={scheduleSettings}
            onScheduleSettingsChange={setScheduleSettings}
          />
        </TabsContent>

        <TabsContent value="antidetect" className="mt-4">
          <AntidetectTab
            isAdmin={isAdmin}
            inDesktop={inDesktop}
            desktopStatus={desktopStatus}
            onRefreshInfrastructure={refreshInfrastructure}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WorkflowControlCenter;
