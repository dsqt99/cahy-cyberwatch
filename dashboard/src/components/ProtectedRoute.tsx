import { useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { signOut, onAuthChange, syncSessionToStorage } from "@/lib/supabase";

const ProtectedRoute = () => {
  const [status, setStatus] = useState<"loading" | "authed" | "guest">("loading");
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const check = async () => {
      const ok = await syncSessionToStorage();
      if (active) setStatus(ok ? "authed" : "guest");
    };

    void check();

    const unsubAuth = onAuthChange(() => {
      void check();
    });

    const unsubDesktop = window.cyberwatchDesktop?.onForceLogout(() => {
      void signOut().then(() => {
        if (active) {
          setStatus("guest");
          navigate("/login", { replace: true });
        }
      });
    });

    return () => {
      active = false;
      unsubAuth();
      unsubDesktop?.();
    };
  }, [navigate]);

  if (status === "loading") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground p-6">
        <div className="w-full max-w-sm surface-panel p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
            <div className="space-y-2 flex-1">
              <div className="h-3.5 w-36 rounded bg-muted animate-pulse" />
              <div className="h-2.5 w-48 rounded bg-muted animate-pulse" />
            </div>
          </div>
          <div className="h-2 w-full rounded bg-muted animate-pulse" />
          <p className="text-xs font-mono text-muted-foreground">
            Đang xác thực phiên điều hành CAHY CyberWatch...
          </p>
        </div>
      </div>
    );
  }

  if (status === "guest") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
