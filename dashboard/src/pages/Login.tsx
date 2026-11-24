import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail, KeyRound, Monitor, Sun, Moon, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { signInWithCredentials, signInWithDesktopOperator, syncSessionToStorage } from "@/lib/supabase";
import { fetchDesktopStatus, isDesktopApp } from "@/lib/desktopBridge";
import { useAppTheme } from "@/lib/theme";

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
      <Input id={id} required {...input} className={`h-11 pl-9 bg-background ${input.className ?? ""}`} />
    </div>
  </div>
);

type Mode = "credentials" | "desktop";

const Login = () => {
  const [mode, setMode] = useState<Mode>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [operatorEmail, setOperatorEmail] = useState("admin@cahy.gov.vn");
  const [operatorPasscode, setOperatorPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [desktopAvailable, setDesktopAvailable] = useState(isDesktopApp());
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

  // One-off probe: only decides whether the station-code option is offered
  useEffect(() => {
    if (desktopAvailable) return;
    let alive = true;
    void fetchDesktopStatus().then((st) => {
      if (alive && st) setDesktopAvailable(true);
    });
    return () => {
      alive = false;
    };
  }, [desktopAvailable]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "credentials") {
        const result = await signInWithCredentials(email, password);
        if (result.ok && result.session) {
          toast.success(
            `Đăng nhập thành công (${result.session.role === "admin" ? "Quản trị viên" : "Cán bộ theo dõi"})`
          );
          navigate("/", { replace: true });
        } else {
          toast.error(result.error || "Thông tin xác thực chưa chính xác.");
        }
      } else {
        const result = await signInWithDesktopOperator(operatorEmail, operatorPasscode);
        if (result.ok) {
          toast.success("Đã mở khóa Trạm Điều hành CAHY CyberWatch.");
          navigate("/", { replace: true });
        } else {
          toast.error(result.error || "Mã Điều hành Trạm không hợp lệ.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const isCred = mode === "credentials";

  return (
    <div className="relative min-h-[100dvh] flex items-center justify-center bg-[hsl(var(--chrome))] text-foreground overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.14), transparent 70%)",
        }}
      />

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

      <main className="relative z-10 w-full max-w-[380px]">
        <div className="rounded-2xl bg-card text-card-foreground ring-1 ring-border shadow-[0_20px_50px_-20px_hsl(var(--foreground)/0.25)] p-7">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-white p-1.5 ring-1 ring-border flex items-center justify-center">
              <img src="/Logo-Bo-Cong-An.webp" alt="Huy hiệu Công an nhân dân" className="w-full h-full object-contain" />
            </div>
            <h1 className="mt-3 text-xl font-bold tracking-tight">CAHY CyberWatch</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Công an tỉnh Hưng Yên</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {isCred ? (
              <>
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
              </>
            ) : (
              <>
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
              </>
            )}

            <Button type="submit" disabled={loading} className="w-full h-11 font-semibold tactile-press gap-2">
              {loading ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  Đang xác thực...
                </>
              ) : (
                <>
                  {isCred ? "Đăng nhập" : "Mở khóa trạm"}
                  <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </>
              )}
            </Button>
          </form>

          {desktopAvailable && (
            <button
              type="button"
              onClick={() => setMode(isCred ? "desktop" : "credentials")}
              className="mt-4 w-full text-center text-xs font-medium text-primary hover:underline"
            >
              {isCred ? "Đăng nhập bằng mã trạm Desktop" : "Quay lại đăng nhập tài khoản"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
};

export default Login;
