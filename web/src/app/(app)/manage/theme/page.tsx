"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { CheckIcon } from "@/components/icons";
import { PageTitle } from "@/components/page-title";
import { Switch } from "@/components/switch";
import { applyThemeCss, siteThemeKey } from "@/components/theme-provider";
import { apiFetch, errorDetail } from "@/lib/api";
import { guideColours, type SiteTheme, THEMES, themeByKey, themeCss } from "@/lib/theme";

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
    if (draft) applyThemeCss(themeCss(draft.preset));
  }, [draft]);
  useEffect(
    () => () => {
      const current = qc.getQueryData<SiteTheme>(siteThemeKey);
      applyThemeCss(themeCss(current?.preset));
    },
    [qc],
  );

  const save = useMutation({
    mutationFn: (theme: SiteTheme) =>
      apiFetch<SiteTheme>("/api/manage/theme", { method: "PUT", body: JSON.stringify(theme) }),
    onSuccess: (theme) => {
      qc.setQueryData(["manage", "theme"], theme);
      qc.setQueryData(siteThemeKey, theme);
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
  const colourError = PARTS.some((p) => draft[p.key] && !HEX.test(draft[p.key]))
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
        </div>
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
          <div className="grid place-items-center rounded-row p-4" style={{ background: themeByKey(draft.preset).light.field }}>
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
