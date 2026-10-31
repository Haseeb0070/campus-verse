"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { DatePicker, todayIso } from "@/components/date-picker";
import { Select } from "@/components/select";
import { apiFetch, errorDetail } from "@/lib/api";
import { markLabels, useReport, useSheet } from "@/lib/attendance";
import type { Mark, Sheet } from "@/lib/attendance";
import { formatDay, formatTime, relativeTime } from "@/lib/format";
import { useMe, useTeaching, useTimetable } from "@/lib/queries";

const MARKS: Mark[] = ["present", "late", "absent", "excused"];
const markOn: Record<Mark, string> = {
  present: "bg-success/15 text-success-ink",
  late: "bg-warning/18 text-ink",
  absent: "bg-danger/12 text-danger-ink",
  excused: "bg-accent/12 text-accent-ink",
};
const field =
  "h-11 w-full rounded-control border border-transparent bg-fill px-3 text-body outline-none focus:border-accent";

function Roster({ sheet, onSaved }: { sheet: Sheet; onSaved: (s: Sheet) => void }) {
  // Everyone starts present; the teacher only taps the exceptions.
  const [marks, setMarks] = useState<Record<number, Mark>>(() =>
    Object.fromEntries(sheet.marks.map((m) => [m.student_id, m.status ?? "present"])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const counts = MARKS.map((m) => [m, Object.values(marks).filter((x) => x === m).length] as const);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const saved = await apiFetch<Sheet>(`/api/attendance/sections/${sheet.section_id}/sheet`, {
        method: "PUT",
        body: JSON.stringify({
          date: sheet.date, meeting_id: sheet.meeting_id,
          marks: sheet.marks.map((m) => ({ student_id: m.student_id, status: marks[m.student_id] })),
        }),
      });
      onSaved(saved);
    } catch (err) {
      setError(errorDetail(err, "Couldn't save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (sheet.marks.length === 0) {
    return <p className="glass rounded-card p-6 text-body text-ink-2">Nobody is enrolled in this section yet.</p>;
  }

  return (
    <section aria-label="Attendance" className="glass flex flex-col gap-3 rounded-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-footnote text-ink-2">
          {counts.filter(([, n]) => n).map(([m, n]) => `${n} ${markLabels[m].toLowerCase()}`).join(" · ")}
        </p>
        {!sheet.locked && (
          <button onClick={() => setMarks(Object.fromEntries(sheet.marks.map((m) => [m.student_id, "present"])))}
            className="press h-9 rounded-full bg-fill-strong px-3.5 text-footnote font-semibold">
            Mark everyone present
          </button>
        )}
      </div>
      <ul className="flex flex-col">
        {sheet.marks.map((m) => (
          <li key={m.student_id} className="flex flex-wrap items-center gap-3 rounded-row p-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-fill-strong text-caption font-semibold">{m.initials}</span>
            <span className="min-w-0 flex-1 truncate text-body font-semibold">{m.name}</span>
            <span role="radiogroup" aria-label={`${m.name}`} className="flex rounded-full bg-fill p-0.5">
              {MARKS.map((mark) => {
                const on = marks[m.student_id] === mark;
                return (
                  <button key={mark} role="radio" aria-checked={on} disabled={sheet.locked}
                    onClick={() => setMarks((x) => ({ ...x, [m.student_id]: mark }))}
                    className={`h-8 rounded-full px-3 text-footnote font-semibold disabled:cursor-default ${
                      on ? markOn[mark] : "text-ink-2"}`}>
                    {markLabels[mark]}
                  </button>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="px-1 text-footnote text-danger-ink">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider px-1 pt-3">
        <p className="text-footnote text-ink-2">
          {sheet.saved && sheet.saved_at
            ? `Saved by ${sheet.taken_by} ${relativeTime(sheet.saved_at)}. Changes are kept in the record's history.`
            : "Not saved yet."}
          {sheet.locked && " It's more than 48 hours old: a coordinator can correct it."}
        </p>
        {!sheet.locked && (
          <button onClick={save} disabled={busy}
            className="press h-11 rounded-full bg-accent px-6 text-body font-semibold text-on-accent disabled:opacity-60">
            {busy ? "Saving…" : sheet.saved ? "Save changes" : "Save attendance"}
          </button>
        )}
      </div>
    </section>
  );
}

function SectionReport({ sectionId }: { sectionId: number }) {
  const report = useReport(sectionId, true);
  if (!report.data) return null;
  return (
    <section aria-labelledby="report-h" className="glass rounded-card p-3">
      <h2 id="report-h" className="px-3 pt-2 pb-1 text-headline font-semibold">
        This term{" "}
        <span className="text-ink-3">
          {report.data.sessions.length} {report.data.sessions.length === 1 ? "class" : "classes"} recorded
        </span>
      </h2>
      <ul>
        {report.data.students.map((s) => (
          <li key={s.student_id} className="flex items-center gap-3 rounded-row p-2.5">
            <span className="min-w-0 flex-1 truncate text-body font-semibold">{s.name}</span>
            <span className="text-footnote text-ink-2">
              {s.summary.absent} absent · {s.summary.late} late{s.summary.excused ? ` · ${s.summary.excused} excused` : ""}
            </span>
            <span className={`w-14 text-right text-body font-semibold tabular-nums ${
              s.summary.rate !== null && s.summary.rate < 75 ? "text-danger-ink" : ""}`}>
              {s.summary.rate === null ? "–" : `${s.summary.rate}%`}
            </span>
          </li>
        ))}
      </ul>
      <p className="px-3 pb-2 text-caption text-ink-3">Late counts as attended; excused classes don&apos;t count either way.</p>
    </section>
  );
}

function AttendanceInner() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const teaching = useTeaching();
  const sectionId = Number(params.get("section")) || teaching.data?.[0]?.id || null;
  const day = params.get("date") || todayIso();
  const meetingParam = params.get("meeting");
  const classes = useTimetable(day, 1);
  const sectionClasses = (classes.data ?? []).filter((o) => o.section_id === sectionId && o.status !== "cancelled" && o.status !== "moved");
  const meetingId = meetingParam !== null ? Number(meetingParam) || null : sectionClasses[0]?.meeting_id ?? null;
  const sheet = useSheet(sectionId, day, meetingId);
  const [showReport, setShowReport] = useState(false);

  function go(next: { section?: number | null; date?: string; meeting?: number | null }) {
    const q = new URLSearchParams();
    const s = next.section !== undefined ? next.section : sectionId;
    if (s) q.set("section", String(s));
    q.set("date", next.date ?? day);
    if (next.meeting !== undefined) {
      if (next.meeting !== null) q.set("meeting", String(next.meeting));
      else q.set("meeting", "0");
    }
    router.replace(`/attendance?${q}`);
  }

  useEffect(() => setShowReport(false), [sectionId]);

  if (me && !me.institution?.attendance_enabled) {
    return <p className="glass mx-auto max-w-xl rounded-card p-6 text-body">Attendance isn&apos;t switched on for your institution.</p>;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-body font-semibold text-ink-2">{formatDay(day, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-1 text-large-title font-bold">Attendance</h1>
        </div>
        <button onClick={() => setShowReport((r) => !r)} aria-expanded={showReport}
          className="press h-10 rounded-full bg-fill-strong px-4 text-footnote font-semibold">
          {showReport ? "Hide term summary" : "Term summary"}
        </button>
      </header>

      <div className="glass grid gap-3 rounded-card p-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
          Section
          <Select value={sectionId ? String(sectionId) : ""} label="Section" className={field}
            onChange={(v) => go({ section: Number(v), meeting: undefined })}
            options={(teaching.data ?? []).map((s) => ({ value: String(s.id), label: `${s.course_code} · ${s.code}`, detail: s.course_title }))} />
        </label>
        <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
          Day
          <DatePicker value={day} label="Day" max={todayIso()} className={field} onChange={(d) => go({ date: d })} />
        </label>
        <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
          Class
          <Select value={meetingId ? String(meetingId) : "0"} label="Class" className={field}
            onChange={(v) => go({ meeting: Number(v) || null })}
            options={[
              ...sectionClasses.map((o) => ({ value: String(o.meeting_id), label: `${formatTime(o.starts_at, tz)}–${formatTime(o.ends_at, tz)}`, detail: o.room || "Online" })),
              { value: "0", label: "Extra class", detail: "Not on the timetable" },
            ]} />
        </label>
      </div>

      {showReport && sectionId && <SectionReport sectionId={sectionId} />}
      {sheet.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {sheet.isError && <p role="alert" className="glass rounded-card p-6 text-body">{errorDetail(sheet.error, "Couldn't load attendance.")}</p>}
      {sheet.data && (
        <Roster key={`${sheet.data.section_id}-${sheet.data.date}-${sheet.data.meeting_id}-${sheet.data.saved_at}`}
          sheet={sheet.data}
          onSaved={(saved) => {
            queryClient.setQueryData(["attendance", "sheet", sectionId, day, meetingId], saved);
            queryClient.invalidateQueries({ queryKey: ["attendance", "report"] });
          }} />
      )}
    </div>
  );
}

export default function AttendancePage() {
  return (
    <Suspense>
      <AttendanceInner />
    </Suspense>
  );
}
