"use client";

import { useState } from "react";
import { DatePicker, DateTimeField, todayIso } from "./date-picker";
import { Select } from "./select";
import { Switch } from "./switch";
import { toLocalInput } from "@/lib/format";
import { categoryLabels, modeLabels, useEventAudiences } from "@/lib/events";
import type { CampusEvent, EventCategory, EventMode } from "@/lib/events";

export interface EventPayload {
  title: string;
  description: string;
  category: EventCategory;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  mode: EventMode;
  location: string;
  online_url: string;
  registration: boolean;
  capacity: number | null;
  registration_closes_at: string | null;
  targets?: string[];
}

const field =
  "h-11 w-full rounded-control border border-transparent bg-fill px-3 text-body outline-none focus:border-accent";
const label = "flex flex-col gap-1.5 text-footnote font-semibold text-ink-2";

function inDays(days: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return toLocalInput(d);
}

/** The form for adding or editing an event. Audiences are chosen once, when it's created. */
export function EventForm({
  initial,
  day,
  submitLabel,
  onSubmit,
}: {
  initial?: CampusEvent;
  /** A new event on this day (YYYY-MM-DD), from double-clicking it in the calendar: it starts and
   *  ends that day. Without it, a new event starts a week from now. */
  day?: string;
  submitLabel: string;
  onSubmit: (payload: EventPayload) => Promise<string | null>;
}) {
  const audiences = useEventAudiences();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState<EventCategory>(initial?.category ?? "event");
  const [allDay, setAllDay] = useState(initial?.all_day ?? false);
  const [starts, setStarts] = useState(
    initial ? toLocalInput(new Date(initial.starts_at)) : day ? `${day}T09:00` : inDays(7, 14),
  );
  const [ends, setEnds] = useState(
    initial ? toLocalInput(new Date(initial.ends_at)) : day ? `${day}T10:00` : inDays(7, 15),
  );
  const [mode, setMode] = useState<EventMode>(initial?.mode ?? "in_person");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [link, setLink] = useState(initial?.online_url ?? "");
  const [registration, setRegistration] = useState(initial?.registration ?? false);
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : "");
  const [targets, setTargets] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const startDate = allDay ? new Date(`${starts.slice(0, 10)}T00:00`) : new Date(starts);
    const endDate = allDay ? new Date(`${ends.slice(0, 10)}T23:59`) : new Date(ends);
    let problem: string | null = null;
    if (!title.trim()) problem = "Give the event a title.";
    else if (!initial && targets.length === 0) problem = "Choose who the event is for.";
    else if (!(endDate >= startDate)) problem = "It has to end after it starts.";
    else if (mode !== "online" && !allDay && !location.trim()) problem = "Say where it happens.";
    else if (mode !== "in_person" && !/^https?:\/\/\S+\.\S+/.test(link.trim()))
      problem = "Add the online link, starting with https://.";
    else if (registration && capacity && !(Number(capacity) >= 1))
      problem = "Capacity has to be a number of at least 1, or empty for no limit.";
    setError(problem);
    if (problem) return;
    setBusy(true);
    const failed = await onSubmit({
      title, description, category, all_day: allDay, mode,
      starts_at: startDate.toISOString(), ends_at: endDate.toISOString(),
      location: mode === "online" ? "" : location, online_url: mode === "in_person" ? "" : link.trim(),
      registration, capacity: registration && capacity ? Number(capacity) : null,
      registration_closes_at: null, ...(initial ? {} : { targets }),
    });
    setBusy(false);
    setError(failed);
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="glass flex flex-col gap-5 rounded-card p-6"
    >
      {error && (
        <p role="alert" className="rounded-row bg-danger/10 px-4 py-3 text-footnote font-medium text-danger-ink">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <label className={label}>
          Title
          <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)}
            placeholder="Graph algorithms seminar" className={`${field} font-semibold`} />
        </label>
        <label className={label}>
          Kind
          <Select value={category} onChange={(v) => setCategory(v as EventCategory)} label="Kind" className={field}
            options={Object.entries(categoryLabels).map(([value, text]) => ({ value, label: text }))} />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-footnote font-semibold text-ink-2">When</span>
          <span className="flex items-center gap-2 text-footnote font-semibold text-ink-2">
            All day
            <Switch checked={allDay} onChange={setAllDay} label="All day" />
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            {allDay ? "From" : "Starts"}
            {allDay ? (
              <DatePicker value={starts.slice(0, 10)} label="From" min={initial ? undefined : todayIso()}
                onChange={(d) => setStarts(`${d}T00:00`)} className={field} />
            ) : (
              <DateTimeField value={starts} label="Starts" min={initial ? undefined : todayIso()} className={field}
                onChange={(v) => {
                  setStarts(v);
                  if (new Date(ends) <= new Date(v)) {
                    const later = new Date(v);
                    later.setHours(later.getHours() + 1);
                    setEnds(toLocalInput(later));
                  }
                }} />
            )}
          </label>
          <label className={label}>
            {allDay ? "To" : "Ends"}
            {allDay ? (
              <DatePicker value={ends.slice(0, 10)} label="To" min={starts.slice(0, 10)}
                onChange={(d) => setEnds(`${d}T23:59`)} className={field} />
            ) : (
              <DateTimeField value={ends} label="Ends" min={starts.slice(0, 10)} onChange={setEnds} className={field} />
            )}
          </label>
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-footnote font-semibold text-ink-2">Where</legend>
        <div role="radiogroup" aria-label="How people attend" className="flex rounded-control bg-fill p-1 sm:w-2/3">
          {(Object.keys(modeLabels) as EventMode[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
              className={`h-9 flex-1 rounded-[9px] text-footnote font-semibold ${
                mode === m ? "bg-[var(--cv-bg)] shadow-sm" : "text-ink-2"}`}>
              {modeLabels[m]}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {mode !== "online" && (
            <label className={label}>
              Place
              <input value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)}
                placeholder="Seminar Room 2" className={field} />
            </label>
          )}
          {mode !== "in_person" && (
            <label className={label}>
              Online link
              <input type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)}
                placeholder="https://" className={field} />
            </label>
          )}
        </div>
      </fieldset>

      <label className={label}>
        Description (optional)
        <textarea value={description} rows={4} maxLength={4000} onChange={(e) => setDescription(e.target.value)}
          placeholder="What it's about, what to bring." className={`${field} h-auto resize-y py-3`} />
      </label>

      {!initial && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-footnote font-semibold text-ink-2">Who it&apos;s for</legend>
          <div className="flex flex-wrap gap-2">
            {(audiences.data ?? []).map((a) => {
              const on = targets.includes(a.key);
              return (
                <button key={a.key} type="button" aria-pressed={on}
                  onClick={() => setTargets((t) => (on ? t.filter((k) => k !== a.key) : [...t, a.key]))}
                  className={`press h-9 rounded-full px-3.5 text-footnote font-semibold ${
                    on ? "bg-accent text-on-accent" : "bg-fill-strong hover:bg-fill"}`}>
                  {on && <span aria-hidden="true">✓ </span>}
                  {a.label}
                  <span className={on ? "ml-1.5 opacity-80" : "ml-1.5 text-ink-3"}>{a.reach}</span>
                </button>
              );
            })}
          </div>
          <span className="text-footnote text-ink-2">They&apos;ll see it in their calendar and get a notification.</span>
        </fieldset>
      )}

      <div className="flex flex-col gap-3">
        <span className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-body font-semibold">Ask people to sign up</span>
            <span className="block text-footnote text-ink-2">For limited places or to know who&apos;s coming.</span>
          </span>
          <Switch checked={registration} onChange={setRegistration} label="Ask people to sign up" />
        </span>
        {registration && (
          <label className={`${label} sm:w-1/3`}>
            Places (empty for no limit)
            <input inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ""))}
              placeholder="No limit" className={field} />
            <span className="font-normal">When it&apos;s full, people join a waitlist and move up automatically.</span>
          </label>
        )}
      </div>

      <div className="flex justify-end border-t border-divider pt-4">
        <button type="submit" disabled={busy}
          className="press h-11 rounded-full bg-accent px-6 text-body font-semibold text-on-accent disabled:opacity-60">
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
