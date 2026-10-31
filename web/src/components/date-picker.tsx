"use client";

import { useEffect, useId, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, TimetableIcon } from "./icons";
import { Select } from "./select";
import { useAnchoredPopover } from "./use-anchored-popover";

// Dates are "YYYY-MM-DD" and times "HH:MM" in the browser's local time, the same strings
// <input type="date|time|datetime-local"> used, so callers didn't have to change.

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (iso: string, days: number) => {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
};
const addMonths = (iso: string, months: number) => {
  const d = fromIso(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toIso(d);
};
const weekdayIndex = (iso: string) => (fromIso(iso).getDay() + 6) % 7; // Monday first

export const todayIso = () => toIso(new Date());

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Names the calendar for screen readers; the trigger is named by its surrounding <label>. */
  label: string;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  label,
  min,
  max,
  placeholder = "Choose a date",
  className = "",
}: DatePickerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(value || todayIso());
  const pop = useAnchoredPopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false), {
    maxHeight: 440,
    minWidth: 300,
  });
  const today = todayIso();
  const outOfRange = (iso: string) => (!!min && iso < min) || (!!max && iso > max);

  const first = `${focus.slice(0, 7)}-01`;
  const start = addDays(first, -weekdayIndex(first));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const monthName = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
    fromIso(first),
  );

  useEffect(() => {
    if (open) pop.panelRef.current?.querySelector<HTMLElement>(`[data-day="${focus}"]`)?.focus();
  }, [open, focus, pop.panelRef]);

  function close(refocus = true) {
    setOpen(false);
    if (refocus) pop.anchorRef.current?.focus();
  }

  function choose(iso: string) {
    if (outOfRange(iso)) return;
    if (iso !== value) onChange(iso);
    close();
  }

  function onKey(e: React.KeyboardEvent) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1),
      Home: () => addDays(focus, -weekdayIndex(focus)),
      End: () => addDays(focus, 6 - weekdayIndex(focus)),
    };
    if (moves[e.key]) {
      e.preventDefault();
      setFocus(moves[e.key]());
    } else if (e.key === "Enter" || e.key === " ") {
      if ((e.target as HTMLElement).dataset.day) {
        e.preventDefault();
        choose(focus);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // keep a surrounding dialog open
      close();
    }
  }

  const shown = value
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(fromIso(value))
    : placeholder;

  return (
    <>
      <button
        ref={pop.anchorRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-cal`}
        onClick={() => {
          if (pop.justDismissed()) return;
          if (open) return close();
          setFocus(value || (min && today < min ? min : today));
          setOpen(true);
        }}
        className={`flex items-center justify-between gap-2 text-left ${className}`}
      >
        <span className={`truncate ${value ? "" : "text-ink-3"}`}>{shown}</span>
        <TimetableIcon className="size-4 shrink-0 text-ink-2" />
      </button>
      <div
        ref={pop.panelRef}
        id={`${id}-cal`}
        popover="auto"
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKey}
        onClick={(e) => e.preventDefault()} // don't let a surrounding <label> reopen it
        onToggle={pop.onToggle}
        style={pop.place}
        className="glass-thick menu-pop fixed inset-auto m-0 w-[300px] rounded-[18px] p-3 text-ink outline-none"
      >
        {open && (
          <>
            <div className="mb-2 flex items-center justify-between">
              <button type="button" aria-label="Previous month" onClick={() => setFocus(addMonths(focus, -1))}
                className="press grid size-8 place-items-center rounded-full hover:bg-fill-strong">
                <ChevronLeftIcon className="size-4" />
              </button>
              <p className="text-body font-semibold" aria-live="polite">{monthName}</p>
              <button type="button" aria-label="Next month" onClick={() => setFocus(addMonths(focus, 1))}
                className="press grid size-8 place-items-center rounded-full hover:bg-fill-strong">
                <ChevronRightIcon className="size-4" />
              </button>
            </div>
            <div role="grid" aria-label={monthName} className="grid grid-cols-7 gap-0.5 text-center">
              <div role="row" className="contents">
                {WEEKDAYS.map((w) => (
                  <span key={w} role="columnheader" className="py-1 text-caption font-semibold text-ink-2">{w}</span>
                ))}
              </div>
              {Array.from({ length: 6 }, (_, week) => (
                <div key={week} role="row" className="contents">
                  {days.slice(week * 7, week * 7 + 7).map((iso) => {
                    const inMonth = iso.slice(0, 7) === focus.slice(0, 7);
                    const selected = iso === value;
                    const disabled = outOfRange(iso);
                    return (
                      <span key={iso} role="gridcell" aria-selected={selected}>
                        <button
                          type="button"
                          data-day={iso}
                          tabIndex={iso === focus ? 0 : -1}
                          aria-disabled={disabled || undefined}
                          aria-current={iso === today ? "date" : undefined}
                          aria-label={new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(fromIso(iso))}
                          onClick={() => choose(iso)}
                          className={`grid size-9 w-full place-items-center rounded-full text-footnote outline-offset-0 ${
                            selected
                              ? "bg-accent font-semibold text-on-accent"
                              : iso === today
                                ? "font-bold text-accent-ink hover:bg-fill-strong"
                                : inMonth
                                  ? "hover:bg-fill-strong"
                                  : "text-ink-3 hover:bg-fill-strong"
                          } ${disabled ? "cursor-default line-through opacity-40" : ""}`}
                        >
                          {fromIso(iso).getDate()}
                        </button>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between border-t border-divider pt-2">
              <button type="button" onClick={() => choose(today)} disabled={outOfRange(today)}
                className="press rounded-full px-3 py-1.5 text-footnote font-semibold text-accent-ink hover:bg-fill-strong disabled:opacity-40">
                Today
              </button>
              <button type="button" onClick={() => close()}
                className="press rounded-full px-3 py-1.5 text-footnote font-semibold text-ink-2 hover:bg-fill-strong">
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

const timeOptions = (step: number, extra: string) => {
  const list: string[] = [];
  for (let m = 0; m < 24 * 60; m += step) list.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  if (extra && !list.includes(extra)) list.push(extra);
  return list.sort().map((t) => ({ value: t, label: t }));
};

export function TimeSelect({
  value,
  onChange,
  label,
  step = 5,
  placeholder = "--:--",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  step?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select value={value} onChange={onChange} label={label} placeholder={placeholder}
      className={className} options={timeOptions(step, value)} />
  );
}

/** Date and time side by side; the value is "YYYY-MM-DDTHH:MM" like datetime-local. */
export function DateTimeField({
  value,
  onChange,
  label,
  min,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  min?: string;
  className?: string;
}) {
  const [date, time] = value ? value.split("T") : ["", ""];
  const look = className.replace(/\bw-full\b/, "");
  return (
    <span className="flex gap-2">
      <DatePicker value={date} label={`${label}: date`} min={min}
        onChange={(d) => onChange(`${d}T${time || "09:00"}`)} className={`min-w-0 flex-1 ${look}`} />
      <TimeSelect value={time} label={`${label}: time`} step={15}
        onChange={(t) => onChange(`${date || todayIso()}T${t}`)} className={`w-28 shrink-0 ${look}`} />
    </span>
  );
}
