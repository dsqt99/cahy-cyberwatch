import React, { useState } from "react";
import { AlertCircle, Camera, CheckCircle2, FolderOpen, KeyRound, Layers, Plus, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  DesktopStatusResponse,
  controlFoxProfile,
  createFoxProfileFromDashboard,
  exportLocalFacebookCookie,
  restartLocalFoxProfile,
  testLocalScreenshotCapture,
} from "@/lib/desktopBridge";

interface AntidetectTabProps {
  isAdmin: boolean;
  inDesktop: boolean;
  desktopStatus: DesktopStatusResponse | null;
  onRefreshInfrastructure: () => Promise<void>;
}

const AntidetectTab: React.FC<AntidetectTabProps> = ({
  isAdmin,
  inDesktop,
  desktopStatus,
  onRefreshInfrastructure,
}) => {
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileProxy, setNewProfileProxy] = useState("");
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [busyProfileName, setBusyProfileName] = useState<string | null>(null);
  const [shotType, setShotType] = useState<"news" | "fb" | "fbpđ" | "tiktok">("news");
  const [shotProfile, setShotProfile] = useState<string>("auto");
  const [shotUrl, setShotUrl] = useState<string>("https://vnexpress.net");
  const [isCapturing, setIsCapturing] = useState(false);
  const [shotOutput, setShotOutput] = useState<{ path: string; previewUrl?: string } | null>(null);
  const [cookieResult, setCookieResult] = useState("");

  const hookOnline = Boolean(desktopStatus?.services.webhook.online);

  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) {
      toast.error("Vui lòng nhập tên Profile mới (ví dụ: fb-antt-02).");
      return;
    }
    setIsCreatingProfile(true);
    try {
      await createFoxProfileFromDashboard({
        name: newProfileName.trim(),
        proxy: newProfileProxy.trim(),
      });
      toast.success(`Đã tạo Profile Antidetect "${newProfileName.trim()}"`);
      setNewProfileName("");
      setNewProfileProxy("");
      await onRefreshInfrastructure();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể tạo Profile");
    } finally {
      setIsCreatingProfile(false);
    }
  };

  const handleProfileBrowserAction = async (name: string, action: "launch" | "stop") => {
    setBusyProfileName(name);
    try {
      await controlFoxProfile(name, action);
      toast.success(action === "launch" ? `Đã mở trình duyệt Profile "${name}"` : `Đã đóng Profile "${name}"`);
      await onRefreshInfrastructure();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Lỗi ${action} profile`);
    } finally {
      setBusyProfileName(null);
    }
  };

  const handleCheckProfileCookie = async (name?: string) => {
    const target = name || (shotProfile === "auto" ? "" : shotProfile);
    setBusyProfileName(target || "cookie");
    try {
      const res = await exportLocalFacebookCookie(target);
      if (res.ok) {
        const msg = `Profile "${res.profile_id}" hợp lệ - UID Facebook (c_user): ${res.c_user} (${res.total_cookies || 0} cookies)`;
        setCookieResult(msg);
        toast.success(msg);
      } else {
        const msg = `Profile "${res.profile_id || "N/A"}" chưa có phiên đăng nhập FB hợp lệ: ${res.error}`;
        setCookieResult(msg);
        toast.warning(msg);
      }
      await onRefreshInfrastructure();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi kiểm tra cookie");
    } finally {
      setBusyProfileName(null);
    }
  };

  const handleRunTestScreenshot = async () => {
    if (!/^https?:\/\//i.test(shotUrl.trim())) {
      toast.error("Đường dẫn chụp bằng chứng phải bắt đầu bằng http:// hoặc https://");
      return;
    }
    setIsCapturing(true);
    setShotOutput(null);
    try {
      const res = await testLocalScreenshotCapture({
        type: shotType,
        url: shotUrl.trim(),
        profileId: shotProfile === "auto" ? "" : shotProfile,
      });
      setShotOutput({
        path: res.outputFilePath,
        previewUrl: res.previewUrl ? `${res.previewUrl}?t=${Date.now()}` : undefined,
      });
      toast.success("Đã chụp bằng chứng số thành công.");
      await onRefreshInfrastructure();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi chụp màn hình");
    } finally {
      setIsCapturing(false);
    }
  };

  if (!hookOnline) {
    return (
      <div className="surface-panel p-6 flex items-center gap-4 border-amber-500/30 bg-amber-500/5">
        <AlertCircle className="w-6 h-6 text-amber-500 shrink-0" strokeWidth={1.75} />
        <div className="text-xs space-y-1">
          <p className="font-bold text-foreground">
            Chưa phát hiện Dịch vụ Trạm CAHY CyberWatch Desktop (127.0.0.1:5680)
          </p>
          <p className="text-muted-foreground">
            Khi vận hành bên trong ứng dụng CAHY CyberWatch Desktop, bạn có thể quản lý trực tiếp trình duyệt Antidetect FoxProfile, kiểm tra Cookie Facebook và chụp bằng chứng số ngay tại đây.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* FoxProfile Manager Card */}
      <div className="surface-panel p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Tài khoản Trình duyệt Antidetect (FoxProfile)</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Mở trình duyệt đăng nhập tài khoản nuôi hoặc trích xuất Cookie Facebook phục vụ n8n.
            </p>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1 shrink-0 tactile-press"
              onClick={() =>
                void restartLocalFoxProfile()
                  .then(() => {
                    toast.success("Đã khởi động lại FoxProfile.");
                    return onRefreshInfrastructure();
                  })
                  .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Lỗi khởi động lại"))
              }
            >
              <Power className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Restart</span>
            </Button>
          )}
        </div>

        {isAdmin && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="Tên profile mới (vd: fb-cahy-01)"
              className="h-9 text-xs font-mono bg-background"
            />
            <Input
              value={newProfileProxy}
              onChange={(e) => setNewProfileProxy(e.target.value)}
              placeholder="Proxy tùy chọn (http://user:pass@ip:port)"
              className="h-9 text-xs font-mono bg-background"
            />
            <Button
              size="sm"
              onClick={() => void handleCreateProfile()}
              disabled={isCreatingProfile}
              className="shrink-0 h-9 text-xs gap-1 tactile-press"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Tạo Profile</span>
            </Button>
          </div>
        )}

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="text-xs">Profile</TableHead>
                <TableHead className="text-xs">Trạng thái</TableHead>
                <TableHead className="text-right text-xs">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(desktopStatus?.profiles || []).map((p) => {
                const running = Boolean(p.is_running || p.running || p.status === "running");
                return (
                  <TableRow key={p.name} className="text-xs">
                    <TableCell className="font-mono font-semibold text-foreground">
                      {p.name}
                      <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                        ({p.engine || "camoufox"})
                      </span>
                    </TableCell>
                    <TableCell>
                      {running ? (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                          Đang mở
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
                          Đã dừng
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs tactile-press"
                        disabled={!isAdmin || busyProfileName === p.name}
                        onClick={() => void handleProfileBrowserAction(p.name, running ? "stop" : "launch")}
                      >
                        {running ? "Đóng" : "Mở Browser"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 tactile-press"
                        disabled={!isAdmin || running || busyProfileName === p.name}
                        title={
                          running
                            ? "Đóng trình duyệt trước khi trích xuất cookie"
                            : "Kiểm tra & trích xuất Cookie Facebook"
                        }
                        onClick={() => void handleCheckProfileCookie(p.name)}
                      >
                        <KeyRound className="w-3 h-3" strokeWidth={1.75} />
                        <span>Cookie FB</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {cookieResult && (
          <div className="p-3 rounded-lg bg-muted/45 border border-border text-xs font-mono text-foreground">
            {cookieResult}
          </div>
        )}
      </div>

      {/* Screenshot Evidence Tester & Recent Queue */}
      <div className="surface-panel p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Chụp Bằng chứng số & Hàng đợi (:5680)</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kiểm thử trực tiếp các endpoint{" "}
              <code className="font-mono text-foreground">/webhook/screenshot_*</code>.
            </p>
          </div>
          {inDesktop && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1 shrink-0 tactile-press"
              onClick={() => void window.cyberwatchDesktop?.openScreenshotFolder()}
            >
              <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Thư mục ảnh</span>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Select value={shotType} onValueChange={(v: "news" | "fb" | "fbpđ" | "tiktok") => setShotType(v)}>
            <SelectTrigger className="h-9 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="news">Báo điện tử (screenshot_news)</SelectItem>
              <SelectItem value="fb">Facebook ANTT (screenshot_fb)</SelectItem>
              <SelectItem value="fbpđ">FB Phản động (screenshot_fbpđ)</SelectItem>
              <SelectItem value="tiktok">TikTok (screenshot_tiktok)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={shotProfile} onValueChange={setShotProfile}>
            <SelectTrigger className="h-9 text-xs bg-background font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Tự động chọn Profile</SelectItem>
              {(desktopStatus?.profiles || []).map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Input
            value={shotUrl}
            onChange={(e) => setShotUrl(e.target.value)}
            placeholder="https://..."
            className="h-9 text-xs font-mono bg-background"
          />
          <Button
            size="sm"
            onClick={() => void handleRunTestScreenshot()}
            disabled={isCapturing || !isAdmin}
            className="shrink-0 h-9 text-xs tactile-press"
          >
            {isCapturing ? "Đang chụp..." : "Chụp bằng chứng"}
          </Button>
        </div>

        {shotOutput && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 space-y-2">
            <div className="text-xs text-emerald-800 dark:text-emerald-300 font-mono break-all flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span>{shotOutput.path}</span>
            </div>
            {shotOutput.previewUrl && (
              <img
                src={shotOutput.previewUrl}
                alt="Bằng chứng số vừa chụp"
                className="max-h-52 rounded-md border border-border"
              />
            )}
          </div>
        )}

        <div className="pt-1 space-y-1.5">
          <div className="text-xs font-semibold text-foreground font-mono tabular-nums">
            Hàng đợi gần đây ({desktopStatus?.captureStats.recentJobs.length || 0}):
          </div>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableBody>
                {(desktopStatus?.captureStats.recentJobs || []).slice(0, 6).map((j) => (
                  <TableRow key={j.id} className="text-[11px]">
                    <TableCell className="font-mono text-muted-foreground tabular-nums">
                      {new Date(j.startedAt).toLocaleTimeString("vi-VN")}
                    </TableCell>
                    <TableCell className="font-semibold text-foreground">{j.type}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{j.profile_id}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`px-2 py-0.5 rounded-md font-mono tabular-nums border ${
                          j.status === "success"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25"
                            : j.status === "error"
                              ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25"
                              : "bg-primary/10 text-primary border-primary/25"
                        }`}
                      >
                        {j.status} ({j.durationMs}ms)
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AntidetectTab;
