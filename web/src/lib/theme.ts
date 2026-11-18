/*
 * The site's built-in themes. A theme recolours the main colour (buttons, links, the current
 * page) and the deep "field" colour (the sidebar, the Today card, the landing page's ground), in
 * light and in dark mode; paper, ink and the warning colours stay the app's own. Admins pick one
 * in Manage → Theme; everyone picks light or dark for themselves.
 *
 * Keep the keys in step with PRESETS in backend/apps/academic/theme.py.
 */

export type ThemeKey = "evergreen" | "indus" | "maroon" | "olive" | "teal" | "slate";

type Tokens = {
  accent: string;
  accentInk: string;
  onAccent: string;
  field: string;
  fieldLine: string;
  side: string;
};

export interface BuiltInTheme {
  key: ThemeKey;
  name: string;
  blurb: string;
  light: Tokens;
  dark: Tokens;
  /** The guide's colours when the admin hasn't chosen their own. */
  guide: { body: string; cap: string; tassel: string };
}

export const THEMES: BuiltInTheme[] = [
  {
    key: "evergreen",
    name: "Evergreen",
    blurb: "Terracotta on deep green, warm paper. The original.",
    light: { accent: "#b4532a", accentInk: "#8a3a1b", onAccent: "#fffaf2", field: "#243329", fieldLine: "#34483b", side: "#1f2b24" },
    dark: { accent: "#e07a50", accentInk: "#f0a988", onAccent: "#1c120c", field: "#22302a", fieldLine: "#34473b", side: "#131a15" },
    guide: { body: "#c4602f", cap: "#243329", tassel: "#e3a33b" },
  },
  {
    key: "indus",
    name: "Indus",
    blurb: "Saffron on river blue.",
    light: { accent: "#b8620f", accentInk: "#874707", onAccent: "#fffaf2", field: "#1e2f47", fieldLine: "#2e4363", side: "#192840" },
    dark: { accent: "#e89a45", accentInk: "#f3c08a", onAccent: "#1a1006", field: "#1c2a3e", fieldLine: "#2c3e58", side: "#121c2b" },
    guide: { body: "#c06a12", cap: "#1e2f47", tassel: "#e8c25a" },
  },
  {
    key: "maroon",
    name: "Maroon",
    blurb: "College maroon with old gold.",
    light: { accent: "#9e2b3a", accentInk: "#7a1f2b", onAccent: "#fff8f4", field: "#3b1d22", fieldLine: "#55303a", side: "#321a1e" },
    dark: { accent: "#e0707e", accentInk: "#f2a7b0", onAccent: "#1e0b0f", field: "#351c21", fieldLine: "#4e2f36", side: "#22111a" },
    guide: { body: "#9e2b3a", cap: "#3b1d22", tassel: "#d9a63a" },
  },
  {
    key: "olive",
    name: "Olive",
    blurb: "Mustard on olive, like an old notebook.",
    light: { accent: "#9a640e", accentInk: "#744a09", onAccent: "#fffaf2", field: "#343820", fieldLine: "#4a4f30", side: "#2b2f1a" },
    dark: { accent: "#e0a640", accentInk: "#f0cd8a", onAccent: "#1a1206", field: "#2f331d", fieldLine: "#464b2e", side: "#1d2012" },
    guide: { body: "#a26a10", cap: "#343820", tassel: "#f0d27a" },
  },
  {
    key: "teal",
    name: "Teal",
    blurb: "Coral on deep teal.",
    light: { accent: "#bd4b33", accentInk: "#93371f", onAccent: "#fffaf2", field: "#17393a", fieldLine: "#275152", side: "#12302f" },
    dark: { accent: "#ef8a72", accentInk: "#f6b8a8", onAccent: "#1e0d08", field: "#173535", fieldLine: "#274c4c", side: "#0f2424" },
    guide: { body: "#c4513a", cap: "#17393a", tassel: "#f2c14e" },
  },
  {
    key: "slate",
    name: "Slate",
    blurb: "Sky blue on charcoal, quiet and cool.",
    light: { accent: "#2f6fae", accentInk: "#22568a", onAccent: "#f7fbff", field: "#262b33", fieldLine: "#3a414c", side: "#20242b" },
    dark: { accent: "#6aa6e0", accentInk: "#a6caf0", onAccent: "#0b1520", field: "#23272e", fieldLine: "#363c46", side: "#16191e" },
    guide: { body: "#2f6fae", cap: "#262b33", tassel: "#e3a33b" },
  },
];

export const DEFAULT_THEME_KEY: ThemeKey = "evergreen";

export function themeByKey(key: string | undefined): BuiltInTheme {
  return THEMES.find((t) => t.key === key) ?? THEMES[0];
}

/** The institution's look, as /api/theme sends it. */
export interface SiteTheme {
  preset: ThemeKey;
  guide_enabled: boolean;
  guide_name: string;
  guide_body: string;
  guide_cap: string;
  guide_tassel: string;
}

export const DEFAULT_SITE_THEME: SiteTheme = {
  preset: DEFAULT_THEME_KEY,
  guide_enabled: true,
  guide_name: "Verse",
  guide_body: "",
  guide_cap: "",
  guide_tassel: "",
};

function vars(t: Tokens) {
  return [
    `--cv-accent:${t.accent}`,
    `--cv-accent-ink:${t.accentInk}`,
    `--cv-on-accent:${t.onAccent}`,
    `--cv-hero:${t.field}`,
    `--cv-hero-line:${t.fieldLine}`,
    `--cv-side:${t.side}`,
  ].join(";");
}

/** The CSS that puts a theme on the page, over the app's own tokens (globals.css). */
export function themeCss(key: string | undefined): string {
  const t = themeByKey(key);
  // `html:root` outranks globals.css's `:root`, whatever order the stylesheets load in.
  return `html:root{${vars(t.light)}}html:root[data-theme="dark"]{${vars(t.dark)}}`;
}

/** The guide's colours: the admin's own, or the theme's. */
export function guideColours(site: SiteTheme) {
  const fallback = themeByKey(site.preset).guide;
  return {
    body: site.guide_body || fallback.body,
    cap: site.guide_cap || fallback.cap,
    tassel: site.guide_tassel || fallback.tassel,
  };
}

/* ---------- Light or dark: each person's own choice, never the device's ---------- */

export type Appearance = "light" | "dark";

export const APPEARANCE_KEY = "cv-appearance";
export const THEME_CSS_KEY = "cv-theme-css";

/**
 * Runs in <head> before the page paints: puts back the last theme and the person's light or
 * dark choice, so nothing flashes. Light unless they chose dark.
 */
export const BOOT_SCRIPT = `(function(){var d=document.documentElement;try{d.dataset.theme=localStorage.getItem("${APPEARANCE_KEY}")==="dark"?"dark":"light";var c=localStorage.getItem("${THEME_CSS_KEY}");if(c){var s=document.createElement("style");s.id="cv-theme";s.textContent=c;document.head.appendChild(s)}}catch(e){d.dataset.theme="light"}})();`;
