"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AssignmentStatusChip } from "@/components/assignment-status";
import { ChevronLeftIcon, PaperclipIcon } from "@/components/icons";
import { ApiError, apiFetch, errorDetail } from "@/lib/api";
import { courseBg, fileSize, formatDateTime, relativeTime } from "@/lib/format";
import { useAssignment, useAssignmentRoster, useMe, useUploadRules } from "@/lib/queries";
import type { Assignment, AssignmentRosterRow, StoredFileInfo, SubmissionInfo } from "@/lib/types";

function FileLink({ file }: { file: StoredFileInfo }) {
  return (
    <a
      href={`/api/assignments/files/${file.id}`}
      className="press inline-flex max-w-full items-center gap-2 rounded-full bg-fill-strong px-3 py-1.5 text-footnote font-semibold"
    >
      <PaperclipIcon className="size-4 shrink-0" />
      <span className="truncate">{file.name}</span>
      <span className="font-normal text-ink-2">{fileSize(file.size)}</span>
    </a>
  );
}

function SubmissionCard({ s, tz }: { s: SubmissionInfo; tz?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-row bg-fill p-3">
      <p className="text-footnote text-ink-2">
        Attempt {s.attempt} · {formatDateTime(s.submitted_at, tz)}
        {s.is_late && <span className="ml-2 rounded-full bg-warning/18 px-2 py-0.5 font-semibold text-ink">Late</span>}
      </p>
      {s.text && <p className="whitespace-pre-wrap text-body">{s.text}</p>}
      {s.files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {s.files.map((f) => (
            <FileLink key={f.id} file={f} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AssignmentPage() {
  const { id } = useParams<{ id: string }>();
  const assignment = useAssignment(Number(id));
  const tz = useMe().data?.institution?.timezone;
  const a = assignment.data;
  const notFound = assignment.error instanceof ApiError && assignment.error.status === 404;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <Link href="/assignments" className="inline-flex items-center gap-1 text-footnote font-semibold text-accent-ink">
        <ChevronLeftIcon className="size-4" /> Assignments
      </Link>

      {notFound && (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">This assignment isn&apos;t available</p>
          <p className="mt-1 text-body text-ink-2">It may not be open yet, or it&apos;s for another section.</p>
        </div>
      )}
      {assignment.isPending && <p className="text-body text-ink-2">Loading…</p>}

      {a && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-body font-semibold text-ink-2">
                <span className={`size-2.5 rounded ${courseBg[a.color]}`} aria-hidden="true" />
                {a.course_title} · {a.course_code} · {a.section_code}
              </p>
              <h1 className="mt-1 text-title-1 font-bold">{a.title}</h1>
            </div>
            <AssignmentStatusChip assignment={a} />
          </header>

          <section aria-label="Details" className="glass grid gap-4 rounded-card p-5 sm:grid-cols-4">
            {[
              ["Due", formatDateTime(a.due_at, tz)],
              ["Points", String(a.max_points)],
              ["Attempts", String(a.max_attempts)],
              [
                "Late work",
                a.allow_late
                  ? a.late_until
                    ? `Until ${formatDateTime(a.late_until, tz)}`
                    : "Accepted"
                  : "Not accepted",
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-caption font-semibold text-ink-3">{k}</p>
                <p className="text-body font-semibold">{v}</p>
              </div>
            ))}
          </section>

          {(a.instructions || a.attachments.length > 0) && (
            <section aria-labelledby="instr-h" className="glass rounded-card p-6">
              <h2 id="instr-h" className="text-headline font-semibold">Instructions</h2>
              {a.instructions && <p className="mt-2 whitespace-pre-line text-body">{a.instructions}</p>}
              {a.attachments.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {a.attachments.map((f) => (
                    <FileLink key={f.id} file={f} />
                  ))}
                </div>
              )}
            </section>
          )}

          {a.can_manage ? <TeacherPanel a={a} tz={tz} /> : <StudentPanel a={a} tz={tz} />}
        </>
      )}
    </div>
  );
}

function StudentPanel({ a, tz }: { a: Assignment; tz?: string }) {
  const queryClient = useQueryClient();
  const rules = useUploadRules().data;
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileKey, setFileKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const used = a.my_attempts ?? 0;
  const left = a.max_attempts - used;
  const canSubmit = (a.window === "open" || a.window === "late") && left > 0;
  const wantsText = a.submission_type !== "file";
  const wantsFiles = a.submission_type !== "text";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (a.submission_type === "text" && !text.trim()) return setError("Write your answer first.");
    if (a.submission_type === "file" && files.length === 0) return setError("Attach at least one file.");
    if (!text.trim() && files.length === 0) return setError("Add a written answer or a file.");
    if (rules && files.some((f) => f.size > rules.max_mb * 1024 * 1024))
      return setError(`Each file can be up to ${rules.max_mb} MB.`);

    const form = new FormData();
    if (text.trim()) form.append("text", text);
    files.forEach((f) => form.append("files", f));
    setBusy(true);
    try {
      await apiFetch(`/api/assignments/${a.id}/submissions`, { method: "POST", body: form });
      setText("");
      setFiles([]);
      setFileKey((k) => k + 1);
      await queryClient.invalidateQueries({ queryKey: ["assignments"] });
    } catch (err) {
      setError(errorDetail(err, "Couldn't submit. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {a.my_grade && (
        <section aria-labelledby="grade-h" className="glass rounded-card p-6">
          <h2 id="grade-h" className="text-headline font-semibold">Your grade</h2>
          <p className="mt-2 text-large-title font-bold tabular-nums">
            {Number(a.my_grade.points)}
            <span className="text-title-2 text-ink-2"> / {a.max_points}</span>
          </p>
          {a.my_grade.feedback && <p className="mt-2 whitespace-pre-line text-body">{a.my_grade.feedback}</p>}
        </section>
      )}
      {!a.my_grade && used > 0 && !a.grades_released && (
        <p className="px-1 text-footnote text-ink-2">Your teacher will release grades when marking is done.</p>
      )}

      {canSubmit && (
        <form onSubmit={submit} className="glass flex flex-col gap-4 rounded-card p-6" noValidate>
          <h2 className="text-headline font-semibold">
            {used === 0 ? "Hand in your work" : `Submit again (${left} ${left === 1 ? "attempt" : "attempts"} left)`}
          </h2>
          {a.window === "late" && (
            <p className="rounded-row bg-warning/15 px-4 py-3 text-footnote font-medium">
              The due date has passed. You can still submit, but it will be marked late.
            </p>
          )}
          {wantsText && (
            <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
              Written answer
              <textarea value={text} rows={6} maxLength={20000} onChange={(e) => setText(e.target.value)}
                className="resize-y rounded-control border border-transparent bg-fill px-4 py-3 text-body font-normal text-ink outline-none focus:border-accent" />
            </label>
          )}
          {wantsFiles && (
            <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
              Files
              <input key={fileKey} type="file" multiple accept={rules?.accept}
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="text-body font-normal text-ink file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-fill-strong file:px-4 file:font-semibold" />
              <span className="font-normal text-ink-3">
                PDF, Word, PowerPoint, Excel, images, zip or code files, up to {rules?.max_mb ?? 20} MB each.
              </span>
            </label>
          )}
          {error && (
            <p role="alert" className="rounded-row bg-danger/10 px-4 py-3 text-footnote font-medium text-danger-ink">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy}
            className="press h-11 self-end rounded-full bg-accent px-6 text-body font-semibold text-on-accent disabled:opacity-60">
            {busy ? "Submitting…" : "Submit"}
          </button>
        </form>
      )}

      {!canSubmit && used === 0 && (
        <p className="glass rounded-card p-6 text-body text-ink-2">
          {a.window === "not_open"
            ? `Opens ${formatDateTime(a.available_from, tz)}.`
            : "The deadline has passed and late work isn't accepted."}
        </p>
      )}

      {(a.my_submissions?.length ?? 0) > 0 && (
        <section aria-labelledby="mine-h" className="glass flex flex-col gap-3 rounded-card p-6">
          <h2 id="mine-h" className="text-headline font-semibold">Your submissions</h2>
          {[...(a.my_submissions ?? [])].reverse().map((s) => (
            <SubmissionCard key={s.id} s={s} tz={tz} />
          ))}
        </section>
      )}
    </>
  );
}

function TeacherPanel({ a, tz }: { a: Assignment; tz?: string }) {
  const queryClient = useQueryClient();
  const roster = useAssignmentRoster(a.id, true);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  async function release() {
    setReleaseError(null);
    try {
      await apiFetch(`/api/assignments/${a.id}/release`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["assignments"] });
    } catch (err) {
      setReleaseError(errorDetail(err, "Couldn't release grades. Try again."));
    } finally {
      setConfirmRelease(false);
    }
  }

  const ungraded = (a.student_count ?? 0) - (a.graded_count ?? 0);

  return (
    <section aria-labelledby="subs-h" className="glass flex flex-col gap-4 rounded-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="subs-h" className="text-headline font-semibold">Submissions</h2>
          <p className="text-footnote text-ink-2">
            {a.submitted_count}/{a.student_count} submitted · {a.graded_count} graded
          </p>
        </div>
        {a.grades_released ? (
          <span className="rounded-full bg-success/15 px-3 py-1.5 text-footnote font-semibold">
            Grades released to students
          </span>
        ) : confirmRelease ? (
          <span className="flex flex-wrap items-center gap-2 text-footnote font-semibold">
            <span className="text-ink-2">
              {ungraded > 0 ? `${ungraded} not graded yet. ` : ""}Students will see their marks.
            </span>
            <button onClick={release} className="press rounded-full bg-accent px-3 py-1.5 text-on-accent">
              Release
            </button>
            <button onClick={() => setConfirmRelease(false)} className="rounded-full px-2 py-1.5">
              Cancel
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirmRelease(true)}
            className="press rounded-full bg-fill-strong px-4 py-2 text-footnote font-semibold">
            Release grades
          </button>
        )}
      </div>
      {releaseError && <p role="alert" className="text-footnote text-danger-ink">{releaseError}</p>}

      {roster.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {roster.data?.length === 0 && <p className="text-body text-ink-2">No students in this section yet.</p>}
      <ul className="flex flex-col gap-2">
        {roster.data?.map((row) => (
          <GradeRow key={`${row.student.id}-${row.grade?.points ?? ""}`} a={a} row={row} tz={tz} />
        ))}
      </ul>
    </section>
  );
}

function GradeRow({ a, row, tz }: { a: Assignment; row: AssignmentRosterRow; tz?: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState(row.grade ? String(Number(row.grade.points)) : "");
  const [feedback, setFeedback] = useState(row.grade?.feedback ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(points);
    if (points === "" || Number.isNaN(n) || n < 0 || n > a.max_points)
      return setError(`Enter points from 0 to ${a.max_points}.`);
    setError(null);
    setState("saving");
    try {
      await apiFetch(`/api/assignments/${a.id}/grades/${row.student.id}`, {
        method: "PUT",
        body: JSON.stringify({ points: n, feedback }),
      });
      setState("saved");
      await queryClient.invalidateQueries({ queryKey: ["assignments", a.id] });
    } catch (err) {
      setError(errorDetail(err, "Couldn't save the grade."));
      setState("idle");
    }
  }

  const latest = row.latest;
  return (
    <li className="rounded-row border border-divider p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-fill-strong text-caption font-semibold">
          {row.student.initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold">{row.student.name}</span>
          <span className="block text-footnote text-ink-2">
            {latest
              ? `Submitted ${relativeTime(latest.submitted_at)}${latest.is_late ? " · late" : ""}${
                  row.attempts > 1 ? ` · attempt ${row.attempts}` : ""
                }`
              : "Not submitted"}
          </span>
        </span>
        {row.grade && !open && (
          <span className="text-body font-semibold tabular-nums">
            {Number(row.grade.points)}/{a.max_points}
          </span>
        )}
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="press rounded-full bg-fill-strong px-3 py-1.5 text-footnote font-semibold">
          {open ? "Close" : row.grade ? "Edit grade" : latest ? "Grade" : "Grade anyway"}
        </button>
      </div>

      {open && (
        <form onSubmit={save} className="mt-3 flex flex-col gap-3" noValidate>
          {latest && <SubmissionCard s={latest} tz={tz} />}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
              Points (of {a.max_points})
              <input type="number" min={0} max={a.max_points} step="0.5" value={points}
                onChange={(e) => {
                  setPoints(e.target.value);
                  setState("idle");
                }}
                className="h-11 w-28 rounded-control border border-transparent bg-fill px-3 text-body text-ink outline-none focus:border-accent" />
            </label>
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-footnote font-semibold text-ink-2">
              Feedback
              <input value={feedback}
                onChange={(e) => {
                  setFeedback(e.target.value);
                  setState("idle");
                }}
                placeholder="What went well, what to improve"
                className="h-11 rounded-control border border-transparent bg-fill px-3 text-body font-normal text-ink outline-none focus:border-accent" />
            </label>
            <button type="submit" disabled={state === "saving"}
              className="press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60">
              {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save"}
            </button>
          </div>
          {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
        </form>
      )}
    </li>
  );
}
