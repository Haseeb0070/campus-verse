"use client";

import Link from "next/link";
import { useState } from "react";
import { type CourseProgress, useProgress } from "@/lib/attendance";
import { courseBg } from "@/lib/format";
import { PageTitle } from "@/components/page-title";

const fmt = (n: string | number) => String(Number(n)); // "17.00" -> "17"

export default function ProgressPage() {
  const progress = useProgress();
  const courses = progress.data ?? [];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header>
        <p className="text-body font-semibold text-ink-2">Marks your teachers have released, and your attendance</p>
        <PageTitle className="mt-1 text-large-title font-bold" text="Progress" />
      </header>

      <p className="rounded-row bg-fill-strong px-4 py-3 text-footnote">
        <span className="font-semibold">This isn&apos;t a transcript.</span> Official results come from your institution.
        Each part below says where it comes from.
      </p>

      {progress.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {progress.isSuccess && courses.length === 0 && (
        <p className="glass rounded-card p-6 text-body text-ink-2">You aren&apos;t enrolled in any sections yet.</p>
      )}

      {/* Courses sit side by side on wide screens instead of one tall column, and each card keeps
          its figures as short horizontal meters so the cards stay compact. */}
      {courses.length > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {courses.map((c) => (
            <CourseCard key={c.section_id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Assignments shown before the list folds away behind "Show all". */
const FOLD = 4;

function CourseCard({ c }: { c: CourseProgress }) {
  const [all, setAll] = useState(false);
  const marksPct = c.points !== null && c.max_points ? (Number(c.points) / c.max_points) * 100 : null;
  const rate = c.attendance?.rate ?? null;
  const shown = all ? c.assignments : c.assignments.slice(0, FOLD);

  return (
    <section aria-label={c.course_title} className="glass flex flex-col gap-4 rounded-card p-5">
      <header className="flex items-center gap-3">
        <span className={`h-10 w-1 shrink-0 rounded-full ${courseBg[c.color]}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-headline font-semibold">{c.course_title}</span>
          <span className="block truncate text-footnote text-ink-2">
            {c.course_code} · Section {c.section_code} · {c.term}
          </span>
        </span>
      </header>

      <div className="flex flex-col gap-3">
        <Meter
          label="Released marks"
          value={c.points !== null ? `${fmt(c.points)} / ${c.max_points}` : "None yet"}
          pct={marksPct}
          color={courseBg[c.color]}
        />
        {c.attendance && (
          <Meter
            label="Attendance"
            value={rate === null ? "No classes yet" : `${rate}%`}
            pct={rate}
            color={courseBg[c.color]}
            note={`${c.attendance.sessions} ${c.attendance.sessions === 1 ? "class" : "classes"} · ${c.attendance.absent} absent · ${c.attendance.late} late`}
          />
        )}
      </div>

      {c.assignments.length > 0 && (
        <div className="border-t border-divider pt-2">
          <ul className="flex flex-col">
            {shown.map((a) => (
              <li key={a.id}>
                <Link href={`/assignments/${a.id}`} className="press -mx-2.5 flex items-center justify-between gap-3 rounded-row p-2.5 hover:bg-fill">
                  <span className="truncate text-body">{a.title}</span>
                  <span className="shrink-0 text-body font-semibold tabular-nums">
                    {a.points !== null ? `${fmt(a.points)} / ${a.max_points}` : <span className="font-normal text-ink-2">Not graded</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {c.assignments.length > FOLD && (
            <button onClick={() => setAll((v) => !v)} aria-expanded={all}
              className="press mt-1 rounded-full px-2.5 py-1 text-footnote font-semibold text-accent-ink hover:bg-fill">
              {all ? "Show fewer" : `Show all ${c.assignments.length}`}
            </button>
          )}
        </div>
      )}

      <p className="text-caption text-ink-3">
        {[c.grades_source, c.attendance_source].filter(Boolean).join(" ")}
      </p>
    </section>
  );
}

function Meter({ label, value, pct, color, note }: {
  label: string; value: string; pct: number | null; color: string; note?: string;
}) {
  const clamped = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-footnote font-semibold text-ink-2">{label}</span>
        <span className="text-headline font-bold tabular-nums">{value}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct === null ? undefined : Math.round(clamped)}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-fill-strong"
      >
        <div className={`h-full rounded-full ${color} transition-[width] duration-700 ease-out`} style={{ width: `${clamped}%` }} />
      </div>
      {note && <p className="mt-1 text-caption text-ink-2">{note}</p>}
    </div>
  );
}
