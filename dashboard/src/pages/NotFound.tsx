import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Route not found:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground p-6">
      <div className="surface-panel max-w-md w-full p-8 space-y-5">
        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center">
          <Compass className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div className="space-y-1.5">
          <div className="font-mono text-xs font-semibold text-primary uppercase tracking-wider">
            Mã lỗi 404
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            Không tìm thấy đường dẫn yêu cầu
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Đường dẫn <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{location.pathname}</code> không tồn tại hoặc đã được thay đổi trong hệ thống CAHY CyberWatch.
          </p>
        </div>
        <Button asChild className="h-9 rounded-lg gap-2 tactile-press">
          <Link to="/">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            <span>Quay về Trung tâm Điều hành</span>
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
