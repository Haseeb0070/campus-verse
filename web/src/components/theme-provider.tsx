"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/queries";
import {
  APPEARANCE_KEY,
  type Appearance,
  DEFAULT_SITE_THEME,
  type SiteTheme,
  THEME_CSS_KEY,
  themeCss,
} from "@/lib/theme";

/*
 * Puts the institution's theme on every page (the landing page, sign-in and the app) and holds
 * each person's light or dark choice. The choice is kept on the device for the first paint and,
 * once signed in, on the account, which wins: it follows the person to every device.
 */

interface ThemeContextValue {
  site: SiteTheme;
  appearance: Appearance;
  setAppearance: (a: Appearance) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  site: DEFAULT_SITE_THEME,
  appearance: "light",
  setAppearance: () => {},
});

export const siteThemeKey = ["site-theme"] as const;

export function useSiteTheme() {
  return useQuery({
    queryKey: siteThemeKey,
    queryFn: () => apiFetch<SiteTheme>("/api/theme"),
    staleTime: 5 * 60_000,
  });
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice lasts for this visit.
  }
}

/** Puts a theme's CSS in <head>, replacing the one before. */
export function applyThemeCss(css: string) {
  let el = document.getElementById("cv-theme") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "cv-theme";
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const loaded = useSiteTheme().data;
  const site = loaded ?? DEFAULT_SITE_THEME;
  const me = useMe();
  const [appearance, setLocal] = useState<Appearance>("light");

  // What the before-paint script already put on <html>.
  useEffect(() => {
    setLocal(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  const apply = useCallback((a: Appearance) => {
    document.documentElement.dataset.theme = a;
    setLocal(a);
    store(APPEARANCE_KEY, a);
  }, []);

  // Signed in, the account's choice wins (it may have been made on another device).
  const accountAppearance = me.data?.appearance;
  useEffect(() => {
    if (accountAppearance === "light" || accountAppearance === "dark") apply(accountAppearance);
  }, [accountAppearance, apply]);

  // The institution's theme, and remembered for the next first paint. Only once it has arrived:
  // until then the page keeps what it painted with (the remembered theme, or the default in
  // <head>), so a reload never flashes another theme while the API answers or wakes up.
  useEffect(() => {
    if (!loaded) return;
    const css = themeCss(loaded.preset, loaded.custom);
    applyThemeCss(css);
    store(THEME_CSS_KEY, css);
  }, [loaded]);

  const setAppearance = useCallback(
    (a: Appearance) => {
      apply(a);
      if (me.data) {
        apiFetch("/api/me/appearance", { method: "PUT", body: JSON.stringify({ appearance: a }) }).catch(
          () => {},
        );
      }
    },
    [apply, me.data],
  );

  return (
    <ThemeContext.Provider value={{ site, appearance, setAppearance }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
