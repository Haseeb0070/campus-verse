import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { buildPalette, type Mode } from "@/theme";
import { apiFetch } from "./api";

/*
 * Manage → Imports & sync, Reports and Theme, as on the website (web/src/lib/manage.ts and
 * web/src/lib/theme.ts). Admin endpoints live under /api/manage.
 */

/* ---------- Imports and sync ---------- */

export type ImportKind = "timetable" | "people" | "enrollment";

export interface ImportRow {
  line: number;
  status: "new" | "update" | "unchanged" | "error";
  /** What the row is about (a section, a person) and a short description. */
  label: string;
  detail: string;
  changes: Record<string, [string, string]>;
  message: string;
  clash: string;
}

export interface ImportRun {
  id: number;
  kind: ImportKind;
  status: "preview" | "applied" | "discarded";
  file_name: string;
  term: string | null;
  source: string | null;
  held_reason: string;
  created_at: string;
  created_by: string;
  applied_at: string | null;
  summary: {
    rows?: number;
    new?: number;
    update?: number;
    unchanged?: number;
    error?: number;
    clash?: number;
    not_in_file?: number;
  };
  result: Record<string, number>;
  rows: ImportRow[] | null;
  not_in_file: string[] | null;
}

export interface SyncSource {
  id: number;
  name: string;
  kind: ImportKind;
  url: string;
  has_auth: boolean;
  purpose: string;
  schedule: "manual" | "daily" | "hourly";
  auto_apply: boolean;
  is_active: boolean;
  owner: string;
  owner_id: number;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string;
}

export const IMPORT_KINDS: Record<ImportKind, { label: string; about: string; missing: string }> = {
  timetable: {
    label: "Timetable",
    about: "Weekly classes for the current term, matched by course, section code, day and start time.",
    missing: "existing classes aren't in this file (kept as is)",
  },
  people: {
    label: "People",
    about:
      "Students, teachers and staff, matched by your institution's ID, then email. New people get an invite to set a password.",
    missing: "",
  },
  enrollment: {
    label: "Enrollment",
    about:
      "Who is in which section, by email or ID: leave the course empty to put a student in the section and all its subjects (moving them from their old one), or give a course for one subject, or a teacher. People must exist first.",
    missing: "current enrollments aren't in this file (kept as is)",
  },
};

export const SCHEDULES: { key: SyncSource["schedule"]; label: string }[] = [
  { key: "daily", label: "Every day" },
  { key: "hourly", label: "Every hour" },
  { key: "manual", label: "Only when I run it" },
];

/** What an applied run did, in words: "3 created, 1 updated". */
export function resultText(r: Record<string, number>) {
  const parts = Object.entries(r)
    .filter(([k, v]) => v && k !== "skipped")
    .map(([k, v]) => `${v} ${k.replace("_", " ")}`);
  return parts.length ? parts.join(", ") : "No changes";
}

export function useImports() {
  return useQuery({ queryKey: ["manage", "imports"], queryFn: () => apiFetch<ImportRun[]>("/api/manage/imports") });
}

export function useImportRun(id: number | null) {
  return useQuery({
    queryKey: ["manage", "imports", id],
    queryFn: () => apiFetch<ImportRun>(`/api/manage/imports/${id}`),
    enabled: id !== null,
  });
}

export function useSyncSources() {
  return useQuery({
    queryKey: ["manage", "sync-sources"],
    queryFn: () => apiFetch<SyncSource[]>("/api/manage/sync-sources"),
  });
}

/* ---------- Reports ---------- */

export interface Reports {
  days: number;
  people: {
    students: number;
    teachers: number;
    staff: number;
    invited: number;
    active: { students: number; teachers: number; staff: number };
  };
  activity: { key: string; label: string; points: { label: string; value: number }[] }[];
  notices: { id: number; title: string; published_at: string; important: boolean; reached: number; read: number; read_rate: number | null }[];
  assignments: {
    rows: {
      id: number;
      title: string;
      section: string;
      students: number;
      submitted: number;
      late: number;
      graded: number;
      released: boolean;
      submission_rate: number | null;
    }[];
    submission_rate: number | null;
  };
  attendance: { rate: number | null; sections: { section: string; rate: number | null; records: number }[] } | null;
  resources: { downloads: number; people: number; top: { title: string; course: string; downloads: number; people: number }[] };
  feed: { posts: number; comments: number; people: number };
  moderation: { open: number; reported: number; resolved: number; actioned: number; median_hours: number | null };
  sync: { applied: number; waiting: number; discarded: number; sources: number; failing: number };
}

/** The institution's reports, or (department) a coordinator's own departments. */
export function useReports(days: number, department: boolean) {
  const base = department ? "/api/manage/structure/department/reports" : "/api/manage/reports";
  return useQuery({
    queryKey: ["manage", "reports", department ? "department" : "institution", days],
    queryFn: () => apiFetch<Reports>(`${base}?days=${days}`),
    placeholderData: keepPreviousData, // keep the frame while a new period loads
  });
}

/* ---------- Theme ---------- */

/** The institution's look as /api/manage/theme reads and writes it. */
export interface AdminTheme {
  preset: string;
  guide_enabled: boolean;
  guide_name: string;
  guide_rename: boolean;
  guide_body: string;
  guide_cap: string;
  guide_tassel: string;
  helper_enabled: boolean;
  card_borders?: boolean;
  /** The border in dark mode; missing means it follows card_borders. */
  card_borders_dark?: boolean;
  card_shadows?: boolean;
  corners?: Corners;
  custom: Partial<Record<Mode, CustomColours>>;
}

export function useAdminTheme() {
  return useQuery({ queryKey: ["manage", "theme"], queryFn: () => apiFetch<AdminTheme>("/api/manage/theme") });
}

/** The built-in themes, by name. Their colours come from the app's own palette (theme/palette.ts). */
export const THEMES: { key: string; name: string; blurb: string }[] = [
  { key: "campus", name: "Campus Blue", blurb: "College blue on cool paper, navy sidebar. The default." },
  { key: "evergreen", name: "Evergreen", blurb: "Terracotta on deep green, warm paper." },
  { key: "indus", name: "Indus", blurb: "Saffron on river blue." },
  { key: "maroon", name: "Maroon", blurb: "College maroon with old gold." },
  { key: "olive", name: "Olive", blurb: "Mustard on olive, like an old notebook." },
  { key: "teal", name: "Teal", blurb: "Coral on deep teal." },
  { key: "slate", name: "Slate", blurb: "Sky blue on charcoal, quiet and cool." },
];

/** What an admin colours in a custom theme. Keep in step with CUSTOM_KEYS on the website. */
export const CUSTOM_KEYS = ["bg", "surface", "fill", "ink", "accent", "on_accent", "accent_ink", "active", "field", "side"] as const;
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

export type Corners = "round" | "medium" | "sharp";
export const CORNERS: { key: Corners; label: string }[] = [
  { key: "round", label: "Round" },
  { key: "medium", label: "Medium" },
  { key: "sharp", label: "Sharp" },
];

/** Every colour of a built-in theme, as a custom theme holds them: the start of a custom theme. */
export function coloursOf(preset: string, mode: Mode): CustomColours {
  const p = buildPalette(mode, { preset: preset === "custom" ? "campus" : preset });
  return {
    bg: p.bg,
    surface: p.surface,
    fill: p.fill,
    ink: p.ink,
    accent: p.accent,
    on_accent: p.onAccent,
    accent_ink: p.accentInk,
    active: p.active,
    field: p.field,
    side: p.side,
  };
}

export const HEX = /^#[0-9a-f]{6}$/;
