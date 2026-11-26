/*
 * The site's built-in themes. A theme recolours the main colour (buttons, links, the current
 * page) and the deep "field" colour (the sidebar, the Today card, the landing page's ground), in
 * light and in dark mode; paper, ink and the warning colours stay the app's own. Admins pick one
 * in Manage → Theme; everyone picks light or dark for themselves.
 *
 * Keep the keys in step with PRESETS in backend/apps/academic/theme.py.
 */

export type ThemeKey = "campus" | "evergreen" | "indus" | "maroon" | "olive" | "teal" | "slate";
/** A built-in theme, or "custom": the admin's own colours. */
export type PresetKey = ThemeKey | "custom";

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
  /** Every colour, paper and ink included, for a theme that sets its own (like a custom one). */
  full?: Record<Mode, CustomColours>;
}

export const THEMES: BuiltInTheme[] = [
  {
    key: "campus",
    name: "Campus Blue",
    blurb: "College blue on cool paper, navy sidebar. The default.",
    light: { accent: "#2f6fae", accentInk: "#1d6f5f", onAccent: "#fffaf2", field: "#192840", fieldLine: "#2e3d55", side: "#192840" },
    dark: { accent: "#3b82f6", accentInk: "#4fb3a0", onAccent: "#ffffff", field: "#172554", fieldLine: "#2e3b66", side: "#0e1629" },
    guide: { body: "#2f6fae", cap: "#192840", tassel: "#e3a33b" },
    full: {
      light: { bg: "#eef2f6", surface: "#e6ebf1", fill: "#ffffff", ink: "#241e18", accent: "#2f6fae", on_accent: "#fffaf2", accent_ink: "#1d6f5f", active: "#2f6fae", field: "#192840", side: "#192840" },
      dark: { bg: "#0f1115", surface: "#1b2027", fill: "#21262d", ink: "#f1f5f9", accent: "#3b82f6", on_accent: "#ffffff", accent_ink: "#4fb3a0", active: "#3b82f6", field: "#172554", side: "#0e1629" },
    },
  },
  {
    key: "evergreen",
    name: "Evergreen",
    blurb: "Terracotta on deep green, warm paper.",
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

export const DEFAULT_THEME_KEY: ThemeKey = "campus";

export function themeByKey(key: string | undefined): BuiltInTheme {
  return THEMES.find((t) => t.key === key) ?? THEMES[0];
}

/** The institution's look, as /api/theme sends it. */
export interface SiteTheme {
  preset: PresetKey;
  guide_enabled: boolean;
  /** The admin's name for the guide; from /api/theme, the signed-in person's own name when allowed. */
  guide_name: string;
  /** Whether each person may give the guide their own name. Off by default. */
  guide_rename: boolean;
  guide_body: string;
  guide_cap: string;
  guide_tassel: string;
  /** The guide inside the app, for people who have signed in. */
  helper_enabled: boolean;
  /** The look of cards: a hairline border, a soft shadow, and how round corners are. */
  card_borders?: boolean;
  /** The border in dark mode; set apart from light. Missing: follows card_borders. */
  card_borders_dark?: boolean;
  card_shadows?: boolean;
  corners?: Corners;
  /** The admin's own colours; read when preset is "custom". */
  custom: Partial<Record<Mode, CustomColours>>;
}

/* ---------- Custom themes: the admin's own colours ---------- */

export type Mode = "light" | "dark";

/** What an admin colours in a custom theme. Keep in step with CUSTOM_KEYS in
 *  backend/apps/academic/theme.py. */
export const CUSTOM_KEYS = [
  "bg",
  "surface",
  "fill",
  "ink",
  "accent",
  "on_accent",
  "accent_ink",
  "active",
  "field",
  "side",
] as const;

export type CustomKey = (typeof CUSTOM_KEYS)[number];
export type CustomColours = Record<CustomKey, string>;

export const CUSTOM_LABELS: Record<CustomKey, { label: string; hint: string }> = {
  bg: { label: "Page background", hint: "Behind everything" },
  surface: { label: "Cards", hint: "Panels, cards and menus" },
  fill: { label: "Soft fill", hint: "Inputs, chips and hovered rows" },
  ink: { label: "Text", hint: "Headings and body text" },
  accent: { label: "Buttons", hint: "Main buttons and badges" },
  on_accent: { label: "Button text", hint: "Text and icons on buttons" },
  accent_ink: { label: "Links", hint: "Links and highlighted text" },
  active: { label: "Active page", hint: "The current page in the sidebar and tabs" },
  field: { label: "Deep field", hint: "The Today card and the landing page" },
  side: { label: "Sidebar", hint: "The navigation on the left" },
};

/** The app's own paper and ink, which built-in themes keep. */
const BASE: Record<Mode, Pick<CustomColours, "bg" | "surface" | "fill" | "ink">> = {
  light: { bg: "#f4efe6", surface: "#fffdf8", fill: "#f3ede2", ink: "#241e18" },
  dark: { bg: "#171512", surface: "#201d19", fill: "#2a2621", ink: "#f2ebe0" },
};

/** Every colour of a theme, as a custom theme holds them: the start of a custom theme. */
export function coloursOf(key: string | undefined, mode: Mode): CustomColours {
  const t = themeByKey(key);
  if (t.full) return { ...t.full[mode] };
  const m = mode === "light" ? t.light : t.dark;
  return {
    ...BASE[mode],
    accent: m.accent,
    on_accent: m.onAccent,
    accent_ink: m.accentInk,
    active: m.accent,
    field: m.field,
    side: m.side,
  };
}

/** Relative luminance, 0 (black) to 1 (white). */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Light or dark text, whichever reads on this colour. */
export function textOn(hex: string) {
  return luminance(hex) > 0.4 ? "#1f1a16" : "#fbf7f0";
}

/** All the app's tokens from the few an admin chose: shades, lines and text on each colour. */
function customVars(c: CustomColours) {
  const mix = (a: string, b: string, p: number) => `color-mix(in srgb, ${a} ${p}%, ${b})`;
  const sideInk = textOn(c.side);
  const lightField = luminance(c.field) > 0.4;
  return [
    `--cv-bg:${c.bg}`,
    `--cv-surface:${c.surface}`,
    `--cv-surface-thick:${c.surface}`,
    `--cv-paper:${c.surface}`,
    `--cv-fill:${c.fill}`,
    `--cv-fill-strong:${mix(c.fill, c.ink, 88)}`,
    `--cv-rim:${mix(c.fill, c.ink, 80)}`,
    `--cv-divider:${mix(c.ink, "transparent", 10)}`,
    `--cv-ink:${c.ink}`,
    `--cv-ink-2:${mix(c.ink, c.bg, 74)}`,
    `--cv-ink-3:${mix(c.ink, c.bg, 58)}`,
    `--cv-accent:${c.accent}`,
    `--cv-on-accent:${c.on_accent}`,
    `--cv-accent-ink:${c.accent_ink}`,
    `--cv-side-active:${c.active}`,
    `--cv-on-active:${textOn(c.active)}`,
    `--cv-hero:${c.field}`,
    `--cv-hero-line:${mix(c.field, lightField ? "#000000" : "#ffffff", 84)}`,
    `--cv-on-field:${textOn(c.field)}`,
    `--cv-side:${c.side}`,
    `--cv-side-line:${mix(sideInk, "transparent", 9)}`,
    `--cv-side-ink:${mix(sideInk, c.side, 90)}`,
    `--cv-side-strong:${sideInk}`,
    `--cv-side-muted:${mix(sideInk, c.side, 62)}`,
    `--cv-side-icon:${mix(sideInk, c.side, 66)}`,
    `--cv-side-hover:${mix(sideInk, "transparent", 8)}`,
    `--cv-side-avatar:${mix(c.side, sideInk, 78)}`,
    `--cv-side-avatar-ink:${sideInk}`,
    `--cv-board:${mix(c.bg, c.ink, 86)}`,
    `--cv-board-line:${mix(c.bg, c.ink, 78)}`,
  ].join(";");
}

/** A theme's tokens for one mode, as CSS variables to put on an element: lets a preview show a
 *  theme without changing the page. */
export function previewVars(site: Pick<SiteTheme, "preset" | "custom">, mode: Mode): Record<string, string> {
  const colours =
    site.preset === "custom" && site.custom[mode] ? (site.custom[mode] as CustomColours) : coloursOf(site.preset, mode);
  return Object.fromEntries(
    customVars(colours)
      .split(";")
      .map((pair) => [pair.slice(0, pair.indexOf(":")), pair.slice(pair.indexOf(":") + 1)]),
  );
}

export const DEFAULT_SITE_THEME: SiteTheme = {
  preset: DEFAULT_THEME_KEY,
  guide_enabled: true,
  guide_name: "Verse",
  guide_rename: false,
  guide_body: "",
  guide_cap: "",
  guide_tassel: "",
  helper_enabled: true,
  card_borders: true,
  card_borders_dark: true,
  card_shadows: true,
  corners: "round",
  custom: {},
};

function vars(t: Tokens) {
  return [
    `--cv-accent:${t.accent}`,
    `--cv-accent-ink:${t.accentInk}`,
    `--cv-on-accent:${t.onAccent}`,
    `--cv-hero:${t.field}`,
    `--cv-hero-line:${t.fieldLine}`,
    `--cv-side:${t.side}`,
    `--cv-side-active:${t.accent}`,
  ].join(";");
}

export type Corners = "round" | "medium" | "sharp";

/** Corner sizes for cards, rows and controls. Keep the keys in step with CORNERS in
 *  backend/apps/academic/theme.py. */
export const CORNERS: Record<Corners, { label: string; card: number; row: number; control: number }> = {
  round: { label: "Round", card: 20, row: 12, control: 12 },
  medium: { label: "Medium", card: 12, row: 8, control: 8 },
  sharp: { label: "Sharp", card: 6, row: 4, control: 4 },
};

/** The card look (border, shadow, corners) as CSS. Empty when everything is left as it was. */
export function lookCss(
  site: Pick<SiteTheme, "card_borders" | "card_borders_dark" | "card_shadows" | "corners">,
): string {
  const rules: string[] = [];
  const light = site.card_borders !== false;
  const dark = site.card_borders_dark ?? light;
  if (!light) rules.push("--cv-card-border:transparent");
  if (site.card_shadows === false) rules.push("--cv-card-shadow:none");
  const c = CORNERS[site.corners ?? "round"] ?? CORNERS.round;
  if (c !== CORNERS.round) rules.push(`--cv-radius-card:${c.card}px`, `--cv-radius-row:${c.row}px`, `--cv-radius-control:${c.control}px`);
  // Light and dark each have their own border switch.
  const darkRule = dark === light ? "" : `html:root[data-theme="dark"]{--cv-card-border:${dark ? "var(--cv-rim)" : "transparent"}}`;
  return (rules.length ? `html:root{${rules.join(";")}}` : "") + darkRule;
}

/** The CSS that puts a theme on the page, over the app's own tokens (globals.css). */
export function themeCss(key: string | undefined, custom?: SiteTheme["custom"]): string {
  if (key === "custom" && custom?.light && custom?.dark) {
    return `html:root{${customVars(custom.light)}}html:root[data-theme="dark"]{${customVars(custom.dark)}}`;
  }
  const t = themeByKey(key);
  if (t.full) return `html:root{${customVars(t.full.light)}}html:root[data-theme="dark"]{${customVars(t.full.dark)}}`;
  // `html:root` outranks globals.css's `:root`, whatever order the stylesheets load in.
  return `html:root{${vars(t.light)}}html:root[data-theme="dark"]{${vars(t.dark)}}`;
}

/** The guide's colours: the admin's own, or the theme's. */
export function guideColours(site: SiteTheme) {
  const fallback =
    site.preset === "custom" && site.custom.light
      ? { body: site.custom.light.accent, cap: site.custom.light.field, tassel: "#e3a33b" }
      : themeByKey(site.preset).guide;
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
export const BOOT_SCRIPT = `(function(){var d=document.documentElement;try{var p=location.pathname;d.dataset.theme=p!=="/"&&p!=="/sign-in"&&localStorage.getItem("${APPEARANCE_KEY}")==="dark"?"dark":"light";var c=localStorage.getItem("${THEME_CSS_KEY}");if(c){var s=document.createElement("style");s.id="cv-theme";s.textContent=c;document.head.appendChild(s)}}catch(e){d.dataset.theme="light"}})();`;
