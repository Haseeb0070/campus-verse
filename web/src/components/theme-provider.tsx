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
  lookCss,
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

/** The landing page is always light, whatever someone picked for the app. While it's showing,
 *  the choice is still remembered but the page stays light. */
let pinnedLight = false;

function storedAppearance(): Appearance {
  try {
    return localStorage.getItem(APPEARANCE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Keeps the page light until the returned function runs, which puts back the person's choice. */
export function pinLight() {
  pinnedLight = true;
  document.documentElement.dataset.theme = "light";
  return () => {
    pinnedLight = false;
    document.documentElement.dataset.theme = storedAppearance();
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const loaded = useSiteTheme().data;
  const site = loaded ?? DEFAULT_SITE_THEME;
  const me = useMe();
  const [appearance, setLocal] = useState<Appearance>("light");

  // The person's choice, as kept on the device (the landing page paints light regardless).
  useEffect(() => {
    setLocal(storedAppearance());
  }, []);

  const apply = useCallback((a: Appearance) => {
    document.documentElement.dataset.theme = pinnedLight ? "light" : a;
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
    const css = themeCss(loaded.preset, loaded.custom) + lookCss(loaded);
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
