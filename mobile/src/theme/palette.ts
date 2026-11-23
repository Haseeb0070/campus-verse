/*
 * Colours. The paper, ink and the deep green field come from the CampusVerse design; an admin's
 * theme (Manage → Theme on the website) recolours the accent and the field, or every colour for a
 * custom theme. Keep the presets in step with web/src/lib/theme.ts.
 */

export type Mode = "light" | "dark";

export interface Palette {
  mode: Mode;
  bg: string;
  surface: string;
  fill: string;
  line: string;
  divider: string;
  ink: string;
  ink2: string;
  ink3: string;
  accent: string;
  onAccent: string;
  accentInk: string;
  accentSoft: string;
  field: string;
  fieldLine: string;
  onField: string;
  onFieldMuted: string;
  side: string;
  onSide: string;
  onSideMuted: string;
  active: string;
  onActive: string;
  warnBg: string;
  warnInk: string;
  danger: string;
  dangerSoft: string;
  success: string;
  shadow: string;
  /** Verse, the guide: its name, colours, and whether the admin left it on (Manage → Theme). */
  guide: { name: string; body: string; cap: string; tassel: string; signedOut: boolean; inApp: boolean };
}

type Accent = { accent: string; accentInk: string; onAccent: string; field: string; fieldLine: string; side: string };

/** Built-in themes that set every colour, paper and ink included, like a custom theme does. */
const FULL: Record<string, Record<Mode, Record<string, string>>> = {
  campus: {
    light: { bg: "#eef2f6", surface: "#e6ebf1", fill: "#ffffff", ink: "#241e18", accent: "#2f6fae", on_accent: "#fffaf2", accent_ink: "#1d6f5f", active: "#2f6fae", field: "#192840", side: "#192840" },
    dark: { bg: "#0f1115", surface: "#1b2027", fill: "#21262d", ink: "#f1f5f9", accent: "#3b82f6", on_accent: "#ffffff", accent_ink: "#4fb3a0", active: "#3b82f6", field: "#172554", side: "#0e1629" },
  },
};

/** The default theme, before /api/theme answers or for one this app doesn't know. */
const DEFAULT_PRESET = "campus";

const PRESETS: Record<string, { light: Accent; dark: Accent }> = {
  campus: {
    light: { accent: "#2f6fae", accentInk: "#1d6f5f", onAccent: "#fffaf2", field: "#192840", fieldLine: "#2e3d55", side: "#192840" },
    dark: { accent: "#3b82f6", accentInk: "#4fb3a0", onAccent: "#ffffff", field: "#172554", fieldLine: "#2e3b66", side: "#0e1629" },
  },
  evergreen: {
    light: { accent: "#b4532a", accentInk: "#8a3a1b", onAccent: "#fffaf2", field: "#243329", fieldLine: "#34483b", side: "#1f2b24" },
    dark: { accent: "#e07a50", accentInk: "#f0a988", onAccent: "#1c120c", field: "#22302a", fieldLine: "#34473b", side: "#131a15" },
  },
  indus: {
    light: { accent: "#b8620f", accentInk: "#874707", onAccent: "#fffaf2", field: "#1e2f47", fieldLine: "#2e4363", side: "#192840" },
    dark: { accent: "#e89a45", accentInk: "#f3c08a", onAccent: "#1a1006", field: "#1c2a3e", fieldLine: "#2c3e58", side: "#121c2b" },
  },
  maroon: {
    light: { accent: "#9e2b3a", accentInk: "#7a1f2b", onAccent: "#fff8f4", field: "#3b1d22", fieldLine: "#55303a", side: "#321a1e" },
    dark: { accent: "#e0707e", accentInk: "#f2a7b0", onAccent: "#1e0b0f", field: "#351c21", fieldLine: "#4e2f36", side: "#22111a" },
  },
  olive: {
    light: { accent: "#9a640e", accentInk: "#744a09", onAccent: "#fffaf2", field: "#343820", fieldLine: "#4a4f30", side: "#2b2f1a" },
    dark: { accent: "#e0a640", accentInk: "#f0cd8a", onAccent: "#1a1206", field: "#2f331d", fieldLine: "#464b2e", side: "#1d2012" },
  },
  teal: {
    light: { accent: "#bd4b33", accentInk: "#93371f", onAccent: "#fffaf2", field: "#17393a", fieldLine: "#275152", side: "#12302f" },
    dark: { accent: "#ef8a72", accentInk: "#f6b8a8", onAccent: "#1e0d08", field: "#173535", fieldLine: "#274c4c", side: "#0f2424" },
  },
  slate: {
    light: { accent: "#2f6fae", accentInk: "#22568a", onAccent: "#f7fbff", field: "#262b33", fieldLine: "#3a414c", side: "#20242b" },
    dark: { accent: "#6aa6e0", accentInk: "#a6caf0", onAccent: "#0b1520", field: "#23272e", fieldLine: "#363c46", side: "#16191e" },
  },
};

/** Verse's colours for each preset, when the admin hasn't chosen their own. */
const GUIDE: Record<string, { body: string; cap: string; tassel: string }> = {
  campus: { body: "#2f6fae", cap: "#192840", tassel: "#e3a33b" },
  evergreen: { body: "#c4602f", cap: "#243329", tassel: "#e3a33b" },
  indus: { body: "#c06a12", cap: "#1e2f47", tassel: "#e8c25a" },
  maroon: { body: "#9e2b3a", cap: "#3b1d22", tassel: "#d9a63a" },
  olive: { body: "#a26a10", cap: "#343820", tassel: "#f0d27a" },
  teal: { body: "#c4513a", cap: "#17393a", tassel: "#f2c14e" },
  slate: { body: "#2f6fae", cap: "#262b33", tassel: "#e3a33b" },
};

const PAPER: Record<Mode, { bg: string; surface: string; fill: string; ink: string }> = {
  light: { bg: "#f4efe6", surface: "#fffdf8", fill: "#f3ede2", ink: "#241e18" },
  dark: { bg: "#171512", surface: "#201d19", fill: "#2a2621", ink: "#f2ebe0" },
};

/** The institution's look, as /api/theme sends it. */
export interface SiteTheme {
  preset: string;
  custom?: Partial<Record<Mode, Partial<Record<string, string>>>>;
  guide_enabled?: boolean;
  helper_enabled?: boolean;
  guide_name?: string;
  guide_body?: string;
  guide_cap?: string;
  guide_tassel?: string;
}

export function mix(a: string, b: string, weightOfA: number) {
  const pa = parse(a);
  const pb = parse(b);
  const w = weightOfA / 100;
  const c = pa.map((v, i) => Math.round(v * w + pb[i] * (1 - w)));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function parse(hex: string) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance(hex: string) {
  const [r, g, b] = parse(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Light or dark text, whichever reads on this colour. */
export function textOn(hex: string) {
  return luminance(hex) > 0.4 ? "#1f1a16" : "#fbf7f0";
}

const HEX = /^#[0-9a-f]{6}$/i;

export function buildPalette(mode: Mode, site?: SiteTheme | null): Palette {
  const key = site?.preset === "custom" || PRESETS[site?.preset ?? ""] ? site!.preset : DEFAULT_PRESET;
  const preset = PRESETS[key] ?? PRESETS[DEFAULT_PRESET];
  const p = mode === "light" ? preset.light : preset.dark;
  const custom = key === "custom" ? site?.custom?.[mode] ?? {} : FULL[key]?.[mode] ?? {};
  const pick = (key: string, fallback: string) => (HEX.test(custom[key] ?? "") ? custom[key]! : fallback);

  const bg = pick("bg", PAPER[mode].bg);
  const surface = pick("surface", PAPER[mode].surface);
  const fill = pick("fill", PAPER[mode].fill);
  const ink = pick("ink", PAPER[mode].ink);
  const accent = pick("accent", p.accent);
  const field = pick("field", p.field);
  const side = pick("side", p.side);
  const active = pick("active", accent);
  const onField = textOn(field);
  const onSide = textOn(side);
  const light = mode === "light";

  return {
    mode,
    bg,
    surface,
    fill,
    line: mix(fill, ink, light ? 86 : 82),
    divider: mix(ink, surface, light ? 9 : 10),
    ink,
    ink2: mix(ink, bg, light ? 76 : 78),
    ink3: mix(ink, bg, light ? 62 : 62),
    accent,
    onAccent: pick("on_accent", p.onAccent),
    accentInk: pick("accent_ink", p.accentInk),
    accentSoft: mix(accent, surface, light ? 13 : 22),
    field,
    fieldLine: mix(field, onField === "#fbf7f0" ? "#ffffff" : "#000000", 84),
    onField,
    onFieldMuted: mix(onField, field, 74),
    side,
    onSide,
    onSideMuted: mix(onSide, side, 62),
    active,
    onActive: textOn(active),
    warnBg: light ? "#f7e7c8" : "#3a2e17",
    warnInk: light ? "#7a4f12" : "#f0c987",
    danger: light ? "#b3261e" : "#f2988f",
    dangerSoft: light ? "#f8dcd8" : "#43201c",
    success: light ? "#2f6b3f" : "#8fd19e",
    shadow: light ? "#4a341c" : "#000000",
    guide: guideOf(site),
  };
}

function guideOf(site?: SiteTheme | null): Palette["guide"] {
  const lightCustom = site?.preset === "custom" ? site.custom?.light : undefined;
  const fallback =
    lightCustom && HEX.test(lightCustom.accent ?? "")
      ? { body: lightCustom.accent!, cap: HEX.test(lightCustom.field ?? "") ? lightCustom.field! : GUIDE[DEFAULT_PRESET].cap, tassel: "#e3a33b" }
      : GUIDE[site?.preset ?? ""] ?? GUIDE[DEFAULT_PRESET];
  const own = (v: string | undefined, f: string) => (HEX.test(v ?? "") ? v! : f);
  return {
    name: site?.guide_name?.trim() || "Verse",
    body: own(site?.guide_body, fallback.body),
    cap: own(site?.guide_cap, fallback.cap),
    tassel: own(site?.guide_tassel, fallback.tassel),
    signedOut: site?.guide_enabled !== false,
    inApp: site?.helper_enabled !== false,
  };
}

/** The eight course colours teachers pick from on the website. */
export const COURSE: Record<string, string> = {
  lagoon: "#2a8c88",
  tangerine: "#d9782d",
  orchid: "#8e5fb0",
  rose: "#c9506d",
  sky: "#4a7fb5",
  lime: "#6a9a3a",
  gold: "#b8902f",
  slate: "#6e685e",
};

/** A course's dot colour, and the soft tile and ink used for its badges and avatars. */
export function courseTone(color: string | null | undefined, palette: Palette) {
  const dot = COURSE[color ?? ""] ?? COURSE.slate;
  const light = palette.mode === "light";
  return {
    dot,
    soft: mix(dot, palette.surface, light ? 20 : 30),
    ink: light ? mix(dot, "#000000", 62) : mix(dot, "#ffffff", 55),
  };
}
