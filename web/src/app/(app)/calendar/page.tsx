"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { addDays, formatDay, formatTime } from "@/lib/format";
import {
  categoryDot,
  categoryLabels,
  categoryTone,
  dayKey,
  useEventAudiences,
  useEvents,
} from "@/lib/events";
import type { EventCategory } from "@/lib/events";
import { useAssignments, useMe } from "@/lib/queries";

interface Item {
  key: string;
  href: string;
  title: string;
  category: EventCategory;
  start: string;
  end: string;
  allDay: boolean;
  cancelled: boolean;
  where: string;
}

const FILTERS: { key: string; label: string; match: (c: EventCategory) => boolean }[] = [
  { key: "all", label: "Everything", match: () => true },
  { key: "exam", label: "Exams", match: (c) => c === "exam" },
  { key: "deadline", label: "Deadlines", match: (c) => c === "deadline" },
  { key: "events", label: "Events", match: (c) => ["seminar", "workshop", "event"].includes(c) },
  { key: "holiday", label: "Holidays", match: (c) => c === "holiday" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function shiftMonth(iso: string, by: number) {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 10);
}

/** Every day an item touches, so a three-day event shows on all three. */
function daysOf(item: Item, tz?: string) {
  const first = dayKey(item.start, tz);
  const last = dayKey(new Date(new Date(item.end).getTime() - 1), tz);
  const out = [first];
  for (let d = first; d < last && out.length < 62; ) out.push((d = addDays(d, 1)));
  return out;
}

function ItemRow({ item, tz }: { item: Item; tz?: string }) {
  return (
    <li>
      <Link href={item.href} className="press flex items-center gap-3 rounded-row p-3 hover:bg-fill">
        <span className={`w-16 shrink-0 text-footnote font-semibold tabular-nums ${item.cancelled ? "text-ink-3" : ""}`}>
          {item.allDay ? "All day" : formatTime(item.start, tz)}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-body font-semibold ${item.cancelled ? "text-ink-3 line-through" : ""}`}>
            {item.title}
          </span>
          <span className="block truncate text-footnote text-ink-2">
            {item.cancelled ? "Cancelled" : item.where}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-caption font-semibold ${categoryTone[item.category]}`}>
          {categoryLabels[item.category]}
        </span>
      </Link>
    </li>
  );
}

export default function CalendarPage() {
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const today = dayKey(new Date(), tz);
  const [view, setView] = useState<"month" | "list">("month");
  const [month, setMonth] = useState(() => monthStart(today));
  const [selected, setSelected] = useState(today);
  const [filter, setFilter] = useState("all");
  const canAdd = (useEventAudiences().data?.length ?? 0) > 0;

  // Month view shows six weeks from the Monday on or before the 1st; list view the next 60 days.
  const first = new Date(`${month}T12:00:00Z`);
  const gridStart = addDays(month, -((first.getUTCDay() + 6) % 7));
  const rangeStart = view === "month" ? gridStart : today;
  const rangeEnd = view === "month" ? addDays(gridStart, 42) : addDays(today, 60);
  const events = useEvents(
    new Date(`${rangeStart}T00:00:00`).toISOString(),
    new Date(`${rangeEnd}T00:00:00`).toISOString(),
  );
  const assignments = useAssignments();

  const items = useMemo<Item[]>(() => {
    const fromEvents: Item[] = (events.data ?? []).map((e) => ({
      key: `e${e.id}`, href: `/calendar/${e.id}`, title: e.title, category: e.category,
      start: e.starts_at, end: e.ends_at, allDay: e.all_day, cancelled: e.status === "cancelled",
      where: e.mode === "online" ? "Online" : e.location || e.audiences.join(", "),
    }));
    const fromWork: Item[] = (assignments.data ?? [])
      .filter((a) => a.status === "published")
      .map((a) => ({
        key: `a${a.id}`, href: `/assignments/${a.id}`, title: `${a.title} due`, category: "deadline",
        start: a.due_at, end: a.due_at, allDay: false, cancelled: false,
        where: `${a.course_code} · ${a.section_code}`,
      }));
    const match = FILTERS.find((f) => f.key === filter)!.match;
    return [...fromEvents, ...fromWork]
      .filter((i) => match(i.category))
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
  }, [events.data, assignments.data, filter]);

  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of items) {
      for (const d of daysOf(item, tz)) map.set(d, [...(map.get(d) ?? []), item]);
    }
    return map;
  }, [items, tz]);

  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" })
    .format(first);
  const upcomingDays = [...byDay.keys()].filter((d) => d >= today && d < rangeEnd).sort();
  const loading = events.isPending || assignments.isPending;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-body font-semibold text-ink-2">Exams, events, holidays and deadlines</p>
          <h1 className="mt-1 text-large-title font-bold">Calendar</h1>
        </div>
        {canAdd && (
          <Link href="/calendar/new"
            className="press inline-flex h-11 items-center rounded-full bg-accent px-5 text-body font-semibold text-on-accent">
            Add event
          </Link>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="View" className="glass flex gap-1 rounded-full p-1">
          {(["month", "list"] as const).map((v) => (
            <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)}
              className={`h-9 rounded-full px-4 text-footnote font-semibold ${view === v ? "bg-accent text-on-accent" : "text-ink-2"}`}>
              {v === "month" ? "Month" : "Upcoming"}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Show" className="glass flex max-w-full gap-1 overflow-x-auto rounded-full p-1">
          {FILTERS.map((f) => (
            <button key={f.key} role="radio" aria-checked={filter === f.key} onClick={() => setFilter(f.key)}
              className={`h-9 whitespace-nowrap rounded-full px-3.5 text-footnote font-semibold ${
                filter === f.key ? "bg-accent text-on-accent" : "text-ink-2"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {view === "month" ? (
        <>
          <section aria-label={monthLabel} className="glass rounded-card p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2 px-1">
              <h2 className="text-title-2 font-bold">{monthLabel}</h2>
              <div className="flex items-center gap-1">
                <button aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}
                  className="press grid size-9 place-items-center rounded-full hover:bg-fill">
                  <ChevronLeftIcon className="size-5" />
                </button>
                <button onClick={() => { setMonth(monthStart(today)); setSelected(today); }}
                  className="press h-9 rounded-full px-3 text-footnote font-semibold hover:bg-fill">
                  Today
                </button>
                <button aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}
                  className="press grid size-9 place-items-center rounded-full hover:bg-fill">
                  <ChevronRightIcon className="size-5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={monthLabel}>
              {WEEKDAYS.map((w) => (
                <span key={w} role="columnheader" className="pb-1 text-caption font-semibold text-ink-2">{w}</span>
              ))}
              {Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)).map((d) => {
                const dayItems = byDay.get(d) ?? [];
                const inMonth = d.slice(0, 7) === month.slice(0, 7);
                const isSel = d === selected;
                return (
                  <button key={d} role="gridcell" aria-selected={isSel}
                    aria-label={`${formatDay(d, { weekday: "long", day: "numeric", month: "long" })}, ${
                      dayItems.length ? `${dayItems.length} ${dayItems.length === 1 ? "item" : "items"}` : "nothing on"}`}
                    onClick={() => setSelected(d)}
                    className={`press flex min-h-14 flex-col items-stretch gap-1 rounded-[12px] p-1 text-left sm:min-h-24 sm:p-1.5 ${
                      isSel ? "bg-fill-strong ring-2 ring-accent/60" : "hover:bg-fill"}`}>
                    <span className={`grid size-7 place-items-center self-center rounded-full text-footnote sm:self-start ${
                      d === today ? "bg-accent font-bold text-on-accent" : inMonth ? "font-semibold" : "text-ink-3"}`}>
                      {Number(d.slice(8))}
                    </span>
                    {/* Phones: dots. Wider screens: the first items by name. */}
                    <span className="flex flex-wrap justify-center gap-0.5 sm:hidden" aria-hidden="true">
                      {dayItems.slice(0, 4).map((it) => (
                        <span key={it.key} className={`size-1.5 rounded-full ${it.cancelled ? "bg-ink-3" : categoryDot[it.category]}`} />
                      ))}
                    </span>
                    <span className="hidden flex-col gap-0.5 sm:flex" aria-hidden="true">
                      {dayItems.slice(0, 2).map((it) => (
                        <span key={it.key} className={`truncate rounded-md px-1.5 py-px text-caption font-semibold ${
                          it.cancelled ? "bg-fill text-ink-3 line-through" : categoryTone[it.category]}`}>
                          {it.title}
                        </span>
                      ))}
                      {dayItems.length > 2 && (
                        <span className="px-1.5 text-caption text-ink-2">+{dayItems.length - 2} more</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="day-h" className="glass rounded-card p-3">
            <h2 id="day-h" className="px-3 pt-2 pb-1 text-headline font-semibold">
              {selected === today ? "Today" : formatDay(selected, { weekday: "long", day: "numeric", month: "long" })}
            </h2>
            {(byDay.get(selected) ?? []).length === 0 ? (
              <p className="px-3 pb-3 text-body text-ink-2">{loading ? "Loading…" : "Nothing on this day."}</p>
            ) : (
              <ul>{(byDay.get(selected) ?? []).map((it) => <ItemRow key={it.key} item={it} tz={tz} />)}</ul>
            )}
          </section>
        </>
      ) : (
        <>
          {loading && <p className="text-body text-ink-2">Loading…</p>}
          {!loading && upcomingDays.length === 0 && (
            <div className="glass rounded-card p-6">
              <p className="text-headline font-semibold">Nothing in the next two months</p>
              <p className="mt-1 text-body text-ink-2">Exams, events and deadlines for your courses will show up here.</p>
            </div>
          )}
          {upcomingDays.map((d) => (
            <section key={d} aria-label={d} className="glass rounded-card p-3">
              <h2 className="px-3 pt-2 pb-1 text-headline font-semibold">
                {d === today ? "Today" : formatDay(d, { weekday: "long", day: "numeric", month: "long" })}
              </h2>
              <ul>{byDay.get(d)!.map((it) => <ItemRow key={it.key} item={it} tz={tz} />)}</ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
