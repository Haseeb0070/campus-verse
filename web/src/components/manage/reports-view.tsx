"use client";

import { ChipGroup } from "@/components/chip-group";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ColumnChart, Meter, StatTile } from "@/components/charts";
import { apiFetch } from "@/lib/api";
import { formatDay, relativeTime } from "@/lib/format";
import { PageTitle } from "@/components/page-title";

interface Reports {
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
    rows: { id: number; title: string; section: string; students: number; submitted: number; late: number; graded: number; released: boolean; submission_rate: number | null }[];
    submission_rate: number | null;
  };
  attendance: { rate: number | null; sections: { section: string; rate: number | null; records: number }[] } | null;
  resources: { downloads: number; people: number; top: { title: string; course: string; downloads: number; people: number }[] };
  feed: { posts: number; comments: number; people: number };
  moderation: { open: number; reported: number; resolved: number; actioned: number; median_hours: number | null };
  sync: { applied: number; waiting: number; discarded: number; sources: number; failing: number };
}

const PERIODS = [7, 30, 90];
const pct = (n: number | null) => (n === null ? "–" : `${n}%`);

/** The reports: the whole institution for admins, or (department) a coordinator's own
 *  departments, without the institution-only parts (feed, moderation, sync). */
export function ReportsView({ department = false }: { department?: boolean }) {
  const [days, setDays] = useState(30);
  const base = department ? "/api/manage/structure/department/reports" : "/api/manage/reports";
  const report = useQuery({
    queryKey: ["manage", "reports", department ? "department" : "institution", days],
    queryFn: () => apiFetch<Reports>(`${base}?days=${days}`),
    placeholderData: keepPreviousData, // keep the frame while a new period loads
  });
  const r = report.data;
  const bucket = (label: string) =>
    days <= 7
      ? formatDay(label, { weekday: "short", day: "numeric", month: "short" })
      : `Week of ${formatDay(label, { weekday: undefined, day: "numeric", month: "short" })}`;
  const reached = r?.notices.reduce((n, x) => n + x.reached, 0) ?? 0;
  const read = r?.notices.reduce((n, x) => n + x.read, 0) ?? 0;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-body font-semibold text-ink-2">
            {department ? "Your departments' sections. " : ""}Counts and rates only, never who did what
          </p>
          <PageTitle className="mt-1 text-large-title font-bold" text={department ? "Department report" : "Reports"} />
        </div>
        {!department && (
          <a href={`/api/manage/reports.csv?days=${days}`} download className="press inline-flex h-9 items-center rounded-full bg-fill-strong px-3.5 text-footnote font-semibold">Download (Excel)</a>
        )}
      </header>

      {/* One filter, above everything it scopes, so every number agrees. */}
      <ChipGroup label="Period" className="self-start" value={String(days)} onChange={(d) => setDays(Number(d))}
        options={PERIODS.map((d) => ({ value: String(d), label: `Last ${d} days` }))} />

      {report.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {r && (
        <div className={`flex flex-col gap-5 transition-opacity ${report.isFetching ? "opacity-60" : ""}`}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Signed in" value={String(r.people.active.students + r.people.active.teachers + r.people.active.staff)}
              detail={`${r.people.active.students} of ${r.people.students} students · ${r.people.active.teachers} of ${r.people.teachers} teachers`} />
            <StatTile label="Notices read" value={reached ? pct(Math.round((100 * read) / reached)) : "–"}
              detail={`${read} of ${reached} deliveries opened`} />
            <StatTile label="Work handed in" value={pct(r.assignments.submission_rate)}
              detail={`Across ${r.assignments.rows.length} assignments due`} />
            {r.attendance ? (
              <StatTile label="Attendance" value={pct(r.attendance.rate)} detail="Late counts as attended" />
            ) : department ? (
              <StatTile label="Students" value={String(r.people.students)} detail={`${r.people.teachers} teachers`} />
            ) : (
              <StatTile label="Open reports" value={String(r.moderation.open)} detail="Waiting for a moderator" />
            )}
          </div>

          <section aria-labelledby="activity-h" className="glass flex flex-col gap-4 rounded-card p-5">
            <h2 id="activity-h" className="text-headline font-semibold">Activity</h2>
            <div className="grid gap-6 lg:grid-cols-3">
              {r.activity.map((a) => (
                <ColumnChart key={a.key} title={a.label} points={a.points} formatLabel={bucket} />
              ))}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section aria-labelledby="notices-h" className="glass rounded-card p-5">
              <h2 id="notices-h" className="mb-2 text-headline font-semibold">Notices and how many were read</h2>
              {r.notices.length === 0 && <p className="text-body text-ink-2">No notices in this period.</p>}
              <ul className="flex flex-col gap-3">
                {r.notices.map((n) => (
                  <li key={n.id}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-body font-semibold">{n.title}</span>
                      <span className="shrink-0 text-footnote text-ink-2">{n.read} of {n.reached}</span>
                    </span>
                    <Meter value={n.read_rate} label={`${n.title}: read by ${pct(n.read_rate)}`} />
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="work-h" className="glass rounded-card p-5">
              <h2 id="work-h" className="mb-2 text-headline font-semibold">Work handed in</h2>
              {r.assignments.rows.length === 0 && <p className="text-body text-ink-2">Nothing was due in this period.</p>}
              <ul className="flex flex-col gap-3">
                {r.assignments.rows.map((a) => (
                  <li key={a.id}>
                    <span className="flex items-baseline justify-between gap-2">
                      <Link href={`/assignments/${a.id}`} className="truncate text-body font-semibold hover:underline">{a.title}</Link>
                      <span className="shrink-0 text-footnote text-ink-2">{a.section}</span>
                    </span>
                    <Meter value={a.submission_rate} label={`${a.title}: ${pct(a.submission_rate)} handed in`} />
                    <span className="block text-footnote text-ink-2">
                      {a.submitted} of {a.students} handed in{a.late ? ` · ${a.late} late` : ""} · {a.graded} graded
                      {a.released ? " · grades released" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {r.attendance && (
              <section aria-labelledby="att-h" className="glass rounded-card p-5">
                <h2 id="att-h" className="mb-2 text-headline font-semibold">Attendance by section</h2>
                {r.attendance.sections.length === 0 && <p className="text-body text-ink-2">No attendance recorded in this period.</p>}
                <ul className="flex flex-col gap-3">
                  {r.attendance.sections.map((s) => (
                    <li key={s.section}>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-body font-semibold">{s.section}</span>
                        <span className="text-footnote text-ink-2">{s.records} marks</span>
                      </span>
                      <Meter value={s.rate} label={`${s.section}: ${pct(s.rate)} attended`} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="res-h" className="glass rounded-card p-5">
              <h2 id="res-h" className="text-headline font-semibold">Course resources</h2>
              <p className="mb-2 text-footnote text-ink-2">
                {r.resources.downloads} downloads by {r.resources.people} {r.resources.people === 1 ? "person" : "people"}
              </p>
              {r.resources.top.length === 0 ? (
                <p className="text-body text-ink-2">Nothing downloaded in this period.</p>
              ) : (
                <table className="w-full text-left text-footnote">
                  <thead className="text-caption text-ink-2">
                    <tr>
                      <th scope="col" className="py-1 font-semibold">Resource</th>
                      <th scope="col" className="py-1 text-right font-semibold">Downloads</th>
                      <th scope="col" className="py-1 text-right font-semibold">People</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.resources.top.map((t) => (
                      <tr key={`${t.course}-${t.title}`} className="border-t border-divider">
                        <td className="py-1.5"><span className="font-semibold">{t.title}</span> <span className="text-ink-2">{t.course}</span></td>
                        <td className="py-1.5 text-right tabular-nums">{t.downloads}</td>
                        <td className="py-1.5 text-right tabular-nums">{t.people}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          {!department && <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Feed" value={`${r.feed.posts} posts`}
              detail={`${r.feed.comments} comments · ${r.feed.people} ${r.feed.people === 1 ? "person" : "people"} posted`} />
            <StatTile label="Moderation" value={`${r.moderation.resolved} resolved`}
              detail={`${r.moderation.reported} reported · ${r.moderation.open} open${
                r.moderation.median_hours !== null ? ` · median ${r.moderation.median_hours} h to resolve` : ""}`} />
            <StatTile label="Sync" value={`${r.sync.applied} applied`}
              detail={`${r.sync.waiting} waiting for review · ${r.sync.sources} sources${r.sync.failing ? ` · ${r.sync.failing} failing` : ""}`} />
          </div>}
          <p className="text-caption text-ink-3">
            Updated {relativeTime(new Date(report.dataUpdatedAt).toISOString())}. Reports support decisions; they don&apos;t rank or score
            students or teachers.
          </p>
        </div>
      )}
    </>
  );
}
