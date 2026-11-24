"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ChipGroup } from "@/components/chip-group";
import { CheckIcon } from "@/components/icons";
import { PageTitle } from "@/components/page-title";
import { Switch } from "@/components/switch";
import { applyThemeCss, siteThemeKey } from "@/components/theme-provider";
import { apiFetch, errorDetail } from "@/lib/api";
import {
  coloursOf,
  CORNERS,
  type Corners,
  CUSTOM_KEYS,
  CUSTOM_LABELS,
  type CustomColours,
  type CustomKey,
  guideColours,
  type Mode,
  previewVars,
  type SiteTheme,
  THEMES,
  lookCss,
  themeCss,
} from "@/lib/theme";

// The guide draws with browser-only APIs.
const GuidePreview = dynamic(() => import("@/components/landing/guide-preview"), { ssr: false });

/** Colours offered for the guide: the themes' own, and a few neutrals. */
const SWATCHES = [
  "#c4602f", "#b4532a", "#9e2b3a", "#c06a12", "#a26a10", "#c4513a",
  "#2f6fae", "#2a8c88", "#3f7a42", "#8e5fb0", "#e3a33b", "#f2c14e",
  "#243329", "#1e2f47", "#3b1d22", "#343820", "#17393a", "#262b33",
  "#f4efe6", "#6e685e", "#241e18",
];

const PARTS = [
  { key: "guide_body", label: "Body" },
  { key: "guide_cap", label: "Cap" },
  { key: "guide_tassel", label: "Tassel" },
] as const;

type Part = (typeof PARTS)[number]["key"];

const HEX = /^#[0-9a-f]{6}$/;

export default function ThemeSettings() {
  const qc = useQueryClient();
  const saved = useQuery({
    queryKey: ["manage", "theme"],
    queryFn: () => apiFetch<SiteTheme>("/api/manage/theme"),
  });
  const [draft, setDraft] = useState<SiteTheme | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (saved.data && !draft) setDraft(saved.data);
  }, [saved.data, draft]);

  // Picking a theme shows it on this page at once; leaving without saving puts the saved one back.
  useEffect(() => {
    if (draft) applyThemeCss(themeCss(draft.preset, draft.custom) + lookCss(draft));
  }, [draft]);
  useEffect(
    () => () => {
      const current = qc.getQueryData<SiteTheme>(siteThemeKey);
      applyThemeCss(themeCss(current?.preset, current?.custom) + (current ? lookCss(current) : ""));
    },
    [qc],
  );

  const save = useMutation({
    mutationFn: (theme: SiteTheme) =>
      apiFetch<SiteTheme>("/api/manage/theme", { method: "PUT", body: JSON.stringify(theme) }),
    onSuccess: (theme) => {
      qc.setQueryData(["manage", "theme"], theme);
      qc.setQueryData(siteThemeKey, theme);
      // The admin may have their own name for the guide, and the profile shows its card only when
      // renaming is allowed: fetch both again.
      qc.invalidateQueries({ queryKey: siteThemeKey });
      qc.invalidateQueries({ queryKey: ["me"] });
      setDraft(theme);
      setMessage({ ok: true, text: "Saved. Everyone sees the new look on their next page." });
    },
    onError: (err) =>
      setMessage({ ok: false, text: errorDetail(err, "Couldn't save. Try again.") }),
  });

  if (saved.isError) {
    return <p className="glass rounded-card p-6 text-body text-ink-2">Couldn&apos;t load the theme settings.</p>;
  }
  if (!draft) return <p className="text-body text-ink-2">Loading…</p>;

  const set = (patch: Partial<SiteTheme>) => {
    setMessage(null);
    setDraft({ ...draft, ...patch });
  };
  const colours = guideColours(draft);
  const changed = JSON.stringify(draft) !== JSON.stringify(saved.data);
  const nameError = !draft.guide_name.trim()
    ? "Give the guide a name."
    : draft.guide_name.trim().length > 24
      ? "Keep it to 24 characters or fewer."
      : null;
  const badCustom =
    draft.preset === "custom" &&
    (["light", "dark"] as const).some((m) => CUSTOM_KEYS.some((k) => !HEX.test(draft.custom[m]?.[k] ?? "")));
  const colourError =
    PARTS.some((p) => draft[p.key] && !HEX.test(draft[p.key])) || badCustom
      ? "Colours look like #b4532a."
      : null;

  return (
    <>
      <header>
        <PageTitle className="text-large-title font-bold" text="Theme" />
        <p className="mt-1 max-w-2xl text-body text-ink-2">
          The look of CampusVerse for everyone at your institution: the app, the sign-in page and
          the landing page. Each person still picks light or dark for themselves.
        </p>
      </header>

      <section aria-labelledby="themes-h" className="glass rounded-card p-6">
        <h2 id="themes-h" className="text-title-2 font-bold">Built-in themes</h2>
        <p className="mt-1 text-footnote text-ink-2">Changes the main colour and the deep colour of the sidebar and cards.</p>
        <div role="radiogroup" aria-labelledby="themes-h" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((t) => {
            const on = draft.preset === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set({ preset: t.key })}
                className={`press relative flex flex-col gap-3 rounded-row p-3 text-left transition-colors ${
                  on ? "bg-fill-strong ring-2 ring-accent" : "bg-fill hover:bg-fill-strong"
                }`}
              >
                {/* The theme in small: its deep field with the main colour on it, light and dark. */}
                <span className="flex h-16 overflow-hidden rounded-[10px]" aria-hidden="true">
                  <span className="flex flex-1 items-end gap-1.5 p-2" style={{ background: t.light.field }}>
                    <span className="h-5 w-12 rounded-full" style={{ background: t.light.accent }} />
                    <span className="h-5 w-5 rounded-full bg-[#f4efe6]" />
                  </span>
                  <span className="flex w-1/3 items-end p-2" style={{ background: t.dark.side }}>
                    <span className="h-5 w-full rounded-full" style={{ background: t.dark.accent }} />
                  </span>
                </span>
                <span>
                  <span className="flex items-center gap-1.5 text-body font-semibold">
                    {t.name}
                    {on && <CheckIcon className="size-4 text-accent-ink" />}
                  </span>
                  <span className="block text-footnote text-ink-2">{t.blurb}</span>
                </span>
              </button>
            );
          })}
          {/* Your own: every colour chosen by hand, starting from the theme picked last. */}
          <button
            type="button"
            role="radio"
            aria-checked={draft.preset === "custom"}
            onClick={() =>
              set({
                preset: "custom",
                custom:
                  draft.custom.light && draft.custom.dark
                    ? draft.custom
                    : { light: coloursOf(draft.preset, "light"), dark: coloursOf(draft.preset, "dark") },
              })
            }
            className={`press relative flex flex-col gap-3 rounded-row p-3 text-left transition-colors ${
              draft.preset === "custom" ? "bg-fill-strong ring-2 ring-accent" : "bg-fill hover:bg-fill-strong"
            }`}
          >
            <span className="grid h-16 grid-cols-6 overflow-hidden rounded-[10px]" aria-hidden="true">
              {["#f4efe6", "#b4532a", "#2f6fae", "#2a8c88", "#9e2b3a", "#262b33"].map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </span>
            <span>
              <span className="flex items-center gap-1.5 text-body font-semibold">
                Your own
                {draft.preset === "custom" && <CheckIcon className="size-4 text-accent-ink" />}
              </span>
              <span className="block text-footnote text-ink-2">
                Choose every colour yourself, for light and dark.
              </span>
            </span>
          </button>
        </div>

        {draft.preset === "custom" && draft.custom.light && draft.custom.dark && (
          <CustomEditor
            custom={draft.custom as Record<Mode, CustomColours>}
            onChange={(custom) => set({ custom })}
          />
        )}
      </section>

      <section aria-labelledby="cards-h" className="glass flex flex-col gap-5 rounded-card p-6">
        <div>
          <h2 id="cards-h" className="text-title-2 font-bold">Cards</h2>
          <p className="mt-1 max-w-xl text-footnote text-ink-2">
            How the panels across the site look: the notices, the Today card, chats and settings. This
            page shows each change straight away.
          </p>
        </div>
        <span className="flex flex-wrap items-center justify-between gap-3 text-body font-medium">
          <span>
            Border around cards
            <span className="block text-footnote font-normal text-ink-2">A thin line around each card</span>
          </span>
          <Switch checked={draft.card_borders !== false} onChange={(v) => set({ card_borders: v })} label="Border around cards" />
        </span>
        <span className="flex flex-wrap items-center justify-between gap-3 text-body font-medium">
          <span>
            Shadow under cards
            <span className="block text-footnote font-normal text-ink-2">A soft shadow that lifts cards off the page</span>
          </span>
          <Switch checked={draft.card_shadows !== false} onChange={(v) => set({ card_shadows: v })} label="Shadow under cards" />
        </span>
        <span className="flex flex-wrap items-center justify-between gap-3 text-body font-medium">
          <span>
            Corners
            <span className="block text-footnote font-normal text-ink-2">Cards, buttons and fields</span>
          </span>
          <ChipGroup<Corners>
            label="Corners"
            value={draft.corners ?? "round"}
            onChange={(v) => set({ corners: v })}
            options={(Object.keys(CORNERS) as Corners[]).map((k) => ({ value: k, label: CORNERS[k].label }))}
          />
        </span>
      </section>

      <section aria-labelledby="helper-h" className="glass flex flex-wrap items-start justify-between gap-4 rounded-card p-6">
        <div>
          <h2 id="helper-h" className="text-title-2 font-bold">Guide in the app</h2>
          <p className="mt-1 max-w-xl text-footnote text-ink-2">
            After signing in, {draft.guide_name.trim() || "the guide"} waits in a corner of the app.
            Tap it to ask about your next class, work that is due, new notices and unread messages.
          </p>
        </div>
        <span className="flex items-center gap-3 text-body font-medium">
          Show in the app
          <Switch
            checked={draft.helper_enabled}
            onChange={(v) => set({ helper_enabled: v })}
            label="Show the guide in the app"
          />
        </span>
      </section>

      <section aria-labelledby="guide-h" className="glass rounded-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="guide-h" className="text-title-2 font-bold">Landing page guide</h2>
            <p className="mt-1 max-w-xl text-footnote text-ink-2">
              The little character that walks around the landing page, visits what people press
              and says a line about each part of the page.
            </p>
          </div>
          <span className="flex items-center gap-3 text-body font-medium">
            Show the guide
            <Switch
              checked={draft.guide_enabled}
              onChange={(v) => set({ guide_enabled: v })}
              label="Show the guide on the landing page"
            />
          </span>
        </div>

        <div className={`mt-5 grid gap-6 md:grid-cols-[180px_1fr] ${draft.guide_enabled ? "" : "opacity-50"}`}>
          <div className="grid place-items-center rounded-row p-4" style={{ background: previewVars(draft, "light")["--cv-hero"] }}>
            <GuidePreview name={draft.guide_name.trim() || "Verse"} colours={colours} />
          </div>

          <div className="flex flex-col gap-5">
            <label className="flex max-w-sm flex-col gap-1.5">
              <span className="text-footnote font-semibold text-ink-2">Name</span>
              <input
                value={draft.guide_name}
                maxLength={24}
                onChange={(e) => set({ guide_name: e.target.value })}
                aria-invalid={Boolean(nameError)}
                aria-describedby="guide-name-note"
                className={`h-11 rounded-control border bg-fill px-4 text-body outline-none focus:border-accent ${
                  nameError ? "border-danger" : "border-transparent"
                }`}
              />
              <span id="guide-name-note" className={`text-caption ${nameError ? "text-danger-ink" : "text-ink-3"}`}>
                {nameError ?? "Up to 24 characters. It greets visitors by this name."}
              </span>
            </label>

            <div className="flex max-w-xl items-start justify-between gap-4">
              <span>
                <span id="guide-rename-h" className="block text-body font-medium">
                  Let people name their own guide
                </span>
                <span className="block text-caption text-ink-3">
                  Off: everyone sees {draft.guide_name.trim() || "this name"}. On: each person can
                  pick a name on their profile, and {draft.guide_name.trim() || "this name"} stays
                  for everyone who doesn&apos;t.
                </span>
              </span>
              <Switch
                checked={draft.guide_rename}
                onChange={(v) => set({ guide_rename: v })}
                label="Let people name their own guide"
              />
            </div>

            {PARTS.map((part) => (
              <ColourRow
                key={part.key}
                label={part.label}
                value={draft[part.key]}
                themeColour={guideColours({ ...draft, [part.key]: "" })[partName(part.key)]}
                onChange={(v) => set({ [part.key]: v } as Partial<SiteTheme>)}
              />
            ))}
            {colourError && <p className="text-footnote text-danger-ink">{colourError}</p>}
          </div>
        </div>
      </section>

      <div className="glass sticky bottom-24 flex flex-wrap items-center gap-3 rounded-card p-4 md:bottom-4">
        <button
          type="button"
          disabled={!changed || Boolean(nameError) || Boolean(colourError) || save.isPending}
          onClick={() => save.mutate({ ...draft, guide_name: draft.guide_name.trim() })}
          className="press h-11 rounded-full bg-accent px-6 text-body font-semibold text-on-accent disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save theme"}
        </button>
        {changed && saved.data && (
          <button
            type="button"
            onClick={() => {
              setDraft(saved.data);
              setMessage(null);
            }}
            className="press h-11 rounded-full bg-fill px-5 text-body font-semibold hover:bg-fill-strong"
          >
            Undo changes
          </button>
        )}
        <p role="status" className={`text-footnote ${message?.ok === false ? "text-danger-ink" : "text-ink-2"}`}>
          {message?.text ?? (changed ? "Not saved yet. You're seeing a preview." : "This is what everyone sees.")}
        </p>
      </div>
    </>
  );
}

function partName(key: Part): "body" | "cap" | "tassel" {
  return key === "guide_body" ? "body" : key === "guide_cap" ? "cap" : "tassel";
}

/** One part of the guide: the theme's colour, a swatch, or a colour typed in. */
function ColourRow({
  label,
  value,
  themeColour,
  onChange,
}: {
  label: string;
  value: string;
  themeColour: string;
  onChange: (v: string) => void;
}) {
  const id = `colour-${label.toLowerCase()}`;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-footnote font-semibold text-ink-2">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={!value}
          onClick={() => onChange("")}
          className={`press flex h-9 items-center gap-2 rounded-full px-3 text-footnote font-semibold ${
            !value ? "bg-accent text-on-accent" : "bg-fill hover:bg-fill-strong"
          }`}
        >
          <span className="size-4 rounded-full" style={{ background: themeColour }} aria-hidden="true" />
          Theme&apos;s
        </button>
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={value === c}
            aria-label={`${label} ${c}`}
            title={c}
            onClick={() => onChange(c)}
            className={`press size-8 rounded-full ${value === c ? "ring-2 ring-accent ring-offset-2 ring-offset-[var(--cv-surface)]" : ""}`}
            style={{ background: c, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.12)" }}
          />
        ))}
        <label htmlFor={id} className="sr-only">
          {label} colour as hex
        </label>
        <input
          id={id}
          value={value}
          placeholder="#hex"
          maxLength={7}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value.trim().toLowerCase())}
          className="h-9 w-24 rounded-full border border-transparent bg-fill px-3 font-mono text-footnote outline-none focus:border-accent"
        />
      </div>
    </fieldset>
  );
}

/* ---------- Your own theme ---------- */

/** Colours offered for each kind of colour, by mode; any other can be typed in. */
const PALETTES: Record<"paper" | "ink" | "colour", Record<Mode, string[]>> = {
  paper: {
    light: ["#ffffff", "#fffdf8", "#fbf8f3", "#f4efe6", "#f3ede2", "#eef2f6", "#f1f5f2", "#f6f1f4", "#e9e0d0", "#e6ebf1"],
    dark: ["#0f0f10", "#121212", "#171512", "#1c1c1c", "#201d19", "#1b2027", "#18201c", "#2a2621", "#262626", "#2b3038"],
  },
  ink: {
    light: ["#111111", "#1f1a16", "#241e18", "#1b2430", "#1d2a24", "#3a2f28"],
    dark: ["#ffffff", "#f2ebe0", "#ece5d8", "#e8edf3", "#e4efe8", "#d9d2c6"],
  },
  colour: {
    light: [
      "#b4532a", "#9e2b3a", "#b8620f", "#9a640e", "#bd4b33", "#2f6fae", "#1d6f5f", "#3f7a42",
      "#7a5a86", "#243329", "#1e2f47", "#3b1d22", "#262b33", "#ffffff", "#fffaf2", "#111111",
    ],
    dark: [
      "#e07a50", "#e0707e", "#e89a45", "#e0a640", "#ef8a72", "#6aa6e0", "#4fb3a0", "#6aa86a",
      "#b394c4", "#22302a", "#1c2a3e", "#351c21", "#23272e", "#ffffff", "#1c120c", "#0b1520",
    ],
  },
};

function paletteFor(key: CustomKey): keyof typeof PALETTES {
  if (key === "bg" || key === "surface" || key === "fill") return "paper";
  if (key === "ink") return "ink";
  return "colour";
}

/** Every colour of the custom theme, for light and for dark, with a preview of the app. */
function CustomEditor({
  custom,
  onChange,
}: {
  custom: Record<Mode, CustomColours>;
  onChange: (c: Record<Mode, CustomColours>) => void;
}) {
  const [mode, setMode] = useState<Mode>("light");
  const colours = custom[mode];
  const setColour = (key: CustomKey, value: string) =>
    onChange({ ...custom, [mode]: { ...colours, [key]: value } });

  return (
    <div className="mt-6 flex flex-col gap-5 rounded-row bg-fill p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Colours for" className="flex gap-1 rounded-full bg-surface p-1">
          {(["light", "dark"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`press rounded-full px-4 py-1.5 text-footnote font-semibold ${
                mode === m ? "bg-accent text-on-accent" : "text-ink-2 hover:bg-fill"
              }`}
            >
              {m === "light" ? "Light mode" : "Dark mode"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-footnote">
          <span className="font-semibold text-ink-2">Start from</span>
          {THEMES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange({ ...custom, [mode]: coloursOf(t.key, mode) })}
              className="press rounded-full bg-surface px-3 py-1.5 font-semibold hover:bg-fill-strong"
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          {CUSTOM_KEYS.map((key) => (
            <CustomRow
              key={`${mode}-${key}`}
              id={`${mode}-${key}`}
              label={CUSTOM_LABELS[key].label}
              hint={CUSTOM_LABELS[key].hint}
              value={colours[key]}
              swatches={PALETTES[paletteFor(key)][mode]}
              onChange={(v) => setColour(key, v)}
            />
          ))}
        </div>
        <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          <p className="text-footnote font-semibold text-ink-2">Preview</p>
          <AppPreview custom={custom} mode="light" />
          <AppPreview custom={custom} mode="dark" />
        </div>
      </div>
    </div>
  );
}

function CustomRow({
  id,
  label,
  hint,
  value,
  swatches,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  swatches: string[];
  onChange: (v: string) => void;
}) {
  const bad = !HEX.test(value);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex w-44 shrink-0 items-center gap-3">
        <span
          className="size-9 shrink-0 rounded-full"
          style={{ background: bad ? "transparent" : value, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.15)" }}
          aria-hidden="true"
        />
        <span>
          <label htmlFor={id} className="block text-footnote font-semibold">
            {label}
          </label>
          <span className="block text-caption text-ink-3">{hint}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={value === c}
            aria-label={`${label} ${c}`}
            title={c}
            onClick={() => onChange(c)}
            className={`press size-7 rounded-full ${value === c ? "ring-2 ring-accent ring-offset-2 ring-offset-[var(--cv-fill)]" : ""}`}
            style={{ background: c, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.15)" }}
          />
        ))}
        <input
          id={id}
          value={value}
          maxLength={7}
          spellCheck={false}
          aria-invalid={bad}
          onChange={(e) => onChange(e.target.value.trim().toLowerCase())}
          className={`h-8 w-24 rounded-full border bg-surface px-3 font-mono text-footnote outline-none focus:border-accent ${
            bad ? "border-danger" : "border-transparent"
          }`}
        />
      </div>
    </div>
  );
}

/** A small piece of the app drawn in the custom colours: sidebar, the current page, a card, a
 *  button, a link and text. It carries its own colour variables, so the page around it is untouched. */
function AppPreview({ custom, mode }: { custom: Record<Mode, CustomColours>; mode: Mode }) {
  const vars = previewVars({ preset: "custom", custom }, mode) as React.CSSProperties;
  return (
    <div
      style={vars}
      className="flex h-44 overflow-hidden rounded-row bg-bg text-ink"
      aria-label={`${mode === "light" ? "Light" : "Dark"} mode preview`}
      role="img"
    >
      <div className="flex w-20 shrink-0 flex-col gap-1.5 bg-side p-2">
        <span className="rounded-md bg-side-active px-1.5 py-1 text-[10px] font-semibold text-on-active">Today</span>
        <span className="px-1.5 text-[10px] font-semibold text-side-ink">Timetable</span>
        <span className="px-1.5 text-[10px] font-semibold text-side-ink">Chat</span>
        <span className="px-1.5 text-[10px] text-side-muted">Notices</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-2.5">
        <div className="rounded-lg p-2" style={{ background: "var(--cv-hero)", color: "var(--cv-on-field)" }}>
          <p className="text-[11px] font-bold">Web Development</p>
          <p className="text-[9px] opacity-80">EC-330 · R-127</p>
        </div>
        <div className="flex flex-1 flex-col gap-1.5 rounded-lg bg-surface p-2">
          <p className="text-[10px] font-bold">Notices</p>
          <p className="text-[9px] text-ink-2">Quiz moved to Thursday</p>
          <div className="mt-auto flex items-center gap-1.5">
            <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-semibold text-on-accent">Save</span>
            <span className="rounded-full bg-fill px-2 py-0.5 text-[9px]">Chip</span>
            <span className="text-[9px] font-semibold text-accent-ink underline">Link</span>
          </div>
        </div>
      </div>
    </div>
  );
}
