import { useEffect, useState } from "react";

export type AppTheme = "light" | "dark";

const THEME_STORAGE_KEY = "cahy_theme";
const THEME_EVENT = "cahy-theme-change";

export function getStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new CustomEvent<AppTheme>(THEME_EVENT, { detail: theme }));
}

// Desktop shell owns the theme (avatar menu); follow it once at module load
if (typeof window !== "undefined" && window.cyberwatchDesktop?.getTheme) {
  window.cyberwatchDesktop.getTheme().then(applyTheme).catch(() => {});
  window.cyberwatchDesktop.onThemeChange?.(applyTheme);
}

export function useAppTheme(): {
  theme: AppTheme;
  setTheme: (next: AppTheme) => void;
  toggleTheme: () => void;
} {
  const [theme, setThemeState] = useState<AppTheme>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const onThemeChange = (e: Event) => {
      const custom = e as CustomEvent<AppTheme>;
      if (custom.detail) setThemeState(custom.detail);
    };
    window.addEventListener(THEME_EVENT, onThemeChange);
    return () => window.removeEventListener(THEME_EVENT, onThemeChange);
  }, []);

  const setTheme = (next: AppTheme) => {
    setThemeState(next);
    applyTheme(next);
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return { theme, setTheme, toggleTheme };
}

