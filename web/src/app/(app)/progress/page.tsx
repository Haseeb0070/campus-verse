"use client";

import Link from "next/link";
import { useProgress } from "@/lib/attendance";
import { courseBg } from "@/lib/format";
import { PageTitle } from "@/components/page-title";

const fmt = (n: string | number) => String(Number(n)); // "17.00" -> "17"

export default function ProgressPage() {
  const progress = useProgress();
  const courses = progress.data ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
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

      {courses.map((c) => (
        <section key={c.section_id} aria-label={c.course_title} className="glass flex flex-col gap-4 rounded-card p-5">
          <header className="flex items-center gap-3">
            <span className={`h-10 w-1 shrink-0 rounded-full ${courseBg[c.color]}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-headline font-semibold">{c.course_title}</span>
              <span className="block text-footnote text-ink-2">{c.course_code} · Section {c.section_code} · {c.term}</span>
            </span>
          </header>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-row bg-fill p-4">
              <p className="text-caption font-semibold text-ink-2">Released marks</p>
              <p className="text-title-2 font-bold tabular-nums">
                {c.points !== null ? `${fmt(c.points)} / ${c.max_points}` : "None yet"}
              </p>
              <p className="mt-1 text-caption text-ink-2">{c.grades_source}</p>
            </div>
            {c.attendance && (
              <div className="rounded-row bg-fill p-4">
                <p className="text-caption font-semibold text-ink-2">Attendance</p>
                <p className="text-title-2 font-bold tabular-nums">
                  {c.attendance.rate === null ? "No classes yet" : `${c.attendance.rate}%`}
                </p>
                <p className="mt-1 text-caption text-ink-2">
                  {c.attendance.sessions} {c.attendance.sessions === 1 ? "class" : "classes"} · {c.attendance.absent} absent · {c.attendance.late} late. {c.attendance_source}
                </p>
              </div>
            )}
          </div>

          {c.assignments.length > 0 && (
            <ul className="flex flex-col">
              {c.assignments.map((a) => (
                <li key={a.id}>
                  <Link href={`/assignments/${a.id}`} className="press flex items-center justify-between gap-3 rounded-row p-2.5 hover:bg-fill">
                    <span className="truncate text-body">{a.title}</span>
                    <span className="shrink-0 text-body font-semibold tabular-nums">
                      {a.points !== null ? `${fmt(a.points)} / ${a.max_points}` : <span className="font-normal text-ink-2">Not graded</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
