import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail, KeyRound, Monitor, Settings, Database, Workflow, Layers, Sun, Moon, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  signInWithCredentials,
  signInWithDesktopOperator,
  syncSessionToStorage,
  POSTGRES_DB_INFO,
} from "@/lib/supabase";
import {
  DesktopStatusResponse,
  fetchDesktopStatus,
  getN8nWebhookBaseSync,
  isDesktopApp,
} from "@/lib/desktopBridge";
import { useAppTheme } from "@/lib/theme";

type Tone = "ok" | "warn" | "idle";
// Status as text + colour, never colour alone
const TONE_LABEL: Record<Tone, { text: string; cls: string }> = {
  ok: { text: "Sẵn sàng", cls: "text-emerald-700 dark:text-emerald-400" },
  warn: { text: "Ngoại tuyến", cls: "text-amber-700 dark:text-amber-400" },
  idle: { text: "Chưa dùng", cls: "text-muted-foreground" },
};

const Field = ({
  id,
  label,
  icon: Icon,
  ...input
}: { id: string; label: string; icon: typeof Mail } & React.ComponentProps<typeof Input>) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
      {label}
    </label>
    <div className="relative">
      <Icon
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
        strokeWidth={1.75}
      />
      <Input id={id} required {...input} className={`h-10 pl-9 bg-background ${input.className ?? ""}`} />
    </div>
  </div>
);

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [operatorEmail, setOperatorEmail] = useState("admin@cahy.gov.vn");
  const [operatorPasscode, setOperatorPasscode] = useState("");
  const [isCredLoading, setIsCredLoading] = useState(false);
  const [isOperatorLoading, setIsOperatorLoading] = useState(false);
  const [desktopStatus, setDesktopStatus] = useState<DesktopStatusResponse | null>(null);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useAppTheme();

  const runningInDesktop = isDesktopApp();

  useEffect(() => {
    void syncSessionToStorage().then((ok) => {
      if (ok) {
        toast.success("Đã xác thực phiên điều hành.");
        navigate("/", { replace: true });
      }
    });

  }, [navigate]);

  // FoxProfile can come up after the page loads, so keep re-probing
  useEffect(() => {
    let alive = true;
    const probe = () =>
      void fetchDesktopStatus().then((st) => {
        if (alive && st) setDesktopStatus(st);
      });
    probe();
    const timer = window.setInterval(probe, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCredLoading(true);
    try {
      const result = await signInWithCredentials(email, password);
      if (result.ok && result.session) {
        toast.success(
          `Đăng nhập thành công (${result.session.role === "admin" ? "Quản trị viên" : "Cán bộ theo dõi"})`
        );
        navigate("/", { replace: true });
      } else {
        toast.error(result.error || "Thông tin xác thực chưa chính xác.");
      }
    } finally {
      setIsCredLoading(false);
    }
  };

  const handleOperatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsOperatorLoading(true);
    try {
      const result = await signInWithDesktopOperator(operatorEmail, operatorPasscode);
      if (result.ok) {
        toast.success("Đã mở khóa Trạm Điều hành CAHY CyberWatch.");
        navigate("/", { replace: true });
      } else {
        toast.error(result.error || "Mã Điều hành Trạm không hợp lệ.");
      }
    } finally {
      setIsOperatorLoading(false);
    }
  };

  const showDesktopTab = runningInDesktop || Boolean(desktopStatus);
  const n8nHost = (() => {
    try {
      return new URL(getN8nWebhookBaseSync()).host;
    } catch {
      return "localhost:5678";
    }
  })();
  const pgHost = POSTGRES_DB_INFO.replace("/", " • ");
  const foxOnline = Boolean(desktopStatus?.services.foxprofile.online);

  // tone only where a real probe exists (FoxProfile); n8n/PostgreSQL show their host
  const services: { icon: typeof Mail; name: string; detail: string; tone?: Tone }[] = [
    { icon: Workflow, name: "n8n", detail: n8nHost },
    { icon: Database, name: "PostgreSQL", detail: pgHost },
    {
      icon: Layers,
      name: "FoxProfile",
      detail: desktopStatus
        ? `${desktopStatus.services.foxprofile.profilesCount} profile • :${desktopStatus.services.webhook.port}`
        : "Chế độ Web",
      tone: desktopStatus ? (foxOnline ? "ok" : "warn") : "idle",
    },
  ];

  return (
    <div className="relative min-h-[100dvh] flex flex-col bg-[hsl(var(--chrome))] text-foreground overflow-hidden">
      {/* Backdrop: soft accent glow + faint grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.14), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Web-only theme switch; in the desktop app the shell avatar menu owns theme */}
      {!runningInDesktop && (
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === "dark" ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
          aria-label="Đổi giao diện"
          className="absolute top-4 right-4 z-10 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" strokeWidth={1.75} /> : <Moon className="w-4 h-4" strokeWidth={1.75} />}
        </button>
      )}

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-10">
        {/* Identity */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-border flex items-center justify-center">
            <img src="/Logo-Bo-Cong-An.webp" alt="Huy hiệu Công an nhân dân" className="w-full h-full object-contain" />
          </div>
          <div className="mt-4 text-[13px] font-medium text-primary">
            Công an tỉnh Hưng Yên
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">CAHY CyberWatch</h1>
          <p className="mt-1 text-sm text-muted-foreground">Trung tâm giám sát & điều hành không gian mạng</p>
        </div>

        {/* Auth card */}
        <div className="w-full max-w-[400px] rounded-2xl bg-card text-card-foreground ring-1 ring-border shadow-[0_20px_50px_-20px_hsl(var(--foreground)/0.25)] p-6">
          <Tabs defaultValue="credentials" className="w-full">
            {showDesktopTab && (
              <TabsList className="grid grid-cols-2 w-full h-9 p-0.5 mb-5">
                <TabsTrigger value="credentials" className="text-xs h-8">
                  Tài khoản cán bộ
                </TabsTrigger>
                <TabsTrigger value="desktop" className="text-xs h-8">
                  Mã trạm Desktop
                </TabsTrigger>
              </TabsList>
            )}

            <TabsContent value="credentials" className="mt-0">
              <form onSubmit={handleCredentialLogin} className="space-y-4">
                <Field
                  id="login-email"
                  label="Email công vụ"
                  icon={Mail}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="canbo@cahy.gov.vn"
                />
                <Field
                  id="login-password"
                  label="Mật khẩu"
                  icon={Lock}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <Button type="submit" disabled={isCredLoading} className="w-full h-10 font-semibold tactile-press gap-2">
                  {isCredLoading ? (
                    <>
                      <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                      Đang xác thực...
                    </>
                  ) : (
                    <>
                      Đăng nhập
                      <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            {showDesktopTab && (
              <TabsContent value="desktop" className="mt-0">
                <form onSubmit={handleOperatorLogin} className="space-y-4">
                  <Field
                    id="operator-email"
                    label="Định danh cán bộ vận hành"
                    icon={Monitor}
                    type="email"
                    autoComplete="username"
                    value={operatorEmail}
                    onChange={(e) => setOperatorEmail(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <Field
                    id="operator-passcode"
                    label="Mã điều hành trạm"
                    icon={KeyRound}
                    type="password"
                    autoComplete="current-password"
                    value={operatorPasscode}
                    onChange={(e) => setOperatorPasscode(e.target.value)}
                    placeholder="desktopOperatorPasscode"
                  />
                  <Button type="submit" disabled={isOperatorLoading} className="w-full h-10 font-semibold tactile-press">
                    {isOperatorLoading ? "Đang kiểm tra mã trạm..." : "Mở khóa trạm"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center">
                    Mã lấy từ khóa <code className="font-mono">desktopOperatorPasscode</code> trong config.json
                  </p>
                </form>
              </TabsContent>
            )}
          </Tabs>
        </div>

        {/* Service health */}
        <div className="w-full max-w-[400px] mt-4 grid grid-cols-3 gap-2">
          {services.map(({ icon: Icon, name, detail, tone }) => (
            <div
              key={name}
              title={detail}
              className="rounded-xl bg-card/60 ring-1 ring-border px-3 py-2.5 min-w-0"
            >
              <div className="flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
                <span className="text-xs font-medium truncate">{name}</span>
              </div>
              {tone ? (
                <div className={`mt-1 text-xs font-medium truncate ${TONE_LABEL[tone].cls}`}>{TONE_LABEL[tone].text}</div>
              ) : (
                <div className="mt-1 text-xs text-muted-foreground truncate tabular-nums">{detail}</div>
              )}
            </div>
          ))}
        </div>

        {runningInDesktop && desktopStatus && !foxOnline && (
          <button
            type="button"
            onClick={() => void window.cyberwatchDesktop?.switchWorkspace("settings")}
            className="mt-3 inline-flex items-center gap-1.5 text-primary hover:underline font-medium text-xs"
          >
            <Settings className="w-3.5 h-3.5" strokeWidth={1.75} />
            Cấu hình Trạm
          </button>
        )}
      </main>

      <footer className="relative z-10 pb-5 text-center text-xs text-muted-foreground">
        Phân quyền RBAC • n8n & PostgreSQL • Hưng Yên 2026
      </footer>
    </div>
  );
};

export default Login;
