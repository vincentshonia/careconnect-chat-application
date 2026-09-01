import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

const STORAGE_KEY = "phg-theme";

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

/** Persisted light/dark/system theme, applied to <html class="dark">. */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [theme, setTheme] = useState<Theme>("light");

  // Read after mount so SSR markup and hydration stay in sync.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    const pref: ThemePreference = stored ?? "system";
    const resolved = pref === "system" ? systemTheme() : pref;
    setPreference(pref);
    setTheme(resolved);
    apply(resolved);
  }, []);

  const setThemePreference = useCallback((pref: ThemePreference) => {
    const resolved = pref === "system" ? systemTheme() : pref;
    window.localStorage.setItem(STORAGE_KEY, pref);
    setPreference(pref);
    setTheme(resolved);
    apply(resolved);
  }, []);

  const toggle = useCallback(() => {
    setThemePreference(theme === "dark" ? "light" : "dark");
  }, [theme, setThemePreference]);

  return { theme, preference, toggle, setThemePreference };
}
