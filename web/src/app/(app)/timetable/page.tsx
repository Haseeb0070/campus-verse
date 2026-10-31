"use client";

import { useState } from "react";
import { ChangeClassDialog } from "@/components/change-class-dialog";
import { ClassRow } from "@/components/class-row";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { addDays, formatDay, relativeTime, startOfWeek, todayIn } from "@/lib/format";
import { useMe, useTimetable } from "@/lib/queries";
import type { Occurrence } from "@/lib/types";

export default function TimetablePage() {
  const me = useMe();
  const tz = me.data?.institution?.timezone;
  const today = todayIn(tz);
  const thisWeek = startOfWeek(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [managing, setManaging] = useState<Occurrence | null>(null);
  const week = useTimetable(weekStart, 7);

  const byDay = new Map<string, Occurrence[]>();
  for (const occ of week.data ?? []) byDay.set(occ.date, [...(byDay.get(occ.date) ?? []), occ]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter(
    (d, i) => i < 5 || byDay.has(d),
  );

  // FR-SCH-06: say where imported classes came from and when they were last synchronized.
  const latest = (week.data ?? [])
    .filter((o) => o.source && o.synced_at)
    .sort((a, b) => b.synced_at!.localeCompare(a.synced_at!))[0];

  const rangeLabel = `${formatDay(weekStart, { weekday: undefined, month: "short" })} – ${formatDay(
    addDays(weekStart, 6),
    { weekday: undefined, month: "short" },
  )}`;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-body font-semibold text-ink-2">{rangeLabel}</p>
          <h1 className="mt-1 text-large-title font-bold">Timetable</h1>
        </div>
        <div className="glass flex items-center gap-1 rounded-full p-1">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Previous week"
            className="press grid size-10 place-items-center rounded-full hover:bg-fill"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <button
            onClick={() => setWeekStart(thisWeek)}
            disabled={weekStart === thisWeek}
            className="press h-10 rounded-full px-4 text-footnote font-semibold hover:bg-fill disabled:text-ink-3"
          >
            This week
          </button>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Next week"
            className="press grid size-10 place-items-center rounded-full hover:bg-fill"
          >
            <ChevronRightIcon className="size-5" />
          </button>
        </div>
      </header>

      {latest && (
        <p className="-mt-2 px-1 text-footnote text-ink-2">
          From {latest.source} · last synced {relativeTime(latest.synced_at!)}. Changes your
          teachers make show here straight away.
        </p>
      )}

      {week.isError && (
        <p role="alert" className="glass rounded-card p-6 text-body">
          Couldn&apos;t load this week. Check your connection and try again.
        </p>
      )}

      {days.map((day) => {
        const items = byDay.get(day) ?? [];
        const isToday = day === today;
        return (
          <section
            key={day}
            aria-label={formatDay(day)}
            className={`glass rounded-card p-5 ${isToday ? "ring-2 ring-accent/50" : ""}`}
          >
            <h2 className="mb-1 flex items-center gap-2 px-2.5 text-headline font-semibold">
              {formatDay(day, { month: "short" })}
              {isToday && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-caption font-semibold text-on-accent">
                  Today
                </span>
              )}
            </h2>
            {week.isPending ? (
              <p className="px-2.5 py-2 text-footnote text-ink-3">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-2.5 py-2 text-footnote text-ink-3">No classes</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {items.map((occ) => (
                  <ClassRow
                    key={`${occ.meeting_id}-${occ.status}`}
                    occ={occ}
                    timeZone={tz}
                    onManage={setManaging}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {managing && (
        <ChangeClassDialog
          key={`${managing.meeting_id}-${managing.date}-${managing.status}`}
          occ={managing}
          timeZone={tz}
          onClose={() => setManaging(null)}
        />
      )}
    </div>
  );
}
