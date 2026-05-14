import { useState, useEffect, useCallback } from "react";

type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "kitestring-theme";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? getSystemTheme() : mode;
}

export function useTheme(): {
  theme: ResolvedTheme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
} {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
    return "system";
  });

  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(mode));

  const applyTheme = useCallback((resolved: ResolvedTheme) => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
    const resolved = resolveTheme(newMode);
    setTheme(resolved);
    applyTheme(resolved);
  }, [applyTheme]);

  useEffect(() => {
    const resolved = resolveTheme(mode);
    setTheme(resolved);
    applyTheme(resolved);
  }, [mode, applyTheme]);

  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const resolved = getSystemTheme();
      setTheme(resolved);
      applyTheme(resolved);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [mode, applyTheme]);

  return { theme, mode, setMode };
}
