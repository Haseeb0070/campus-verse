"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { apiFetch, errorDetail } from "@/lib/api";
import { fileSize, toLocalInput } from "@/lib/format";
import { useTeaching, useUploadRules } from "@/lib/queries";
import type { Assignment } from "@/lib/types";
import { DateTimeField } from "@/components/date-picker";
import { Select } from "@/components/select";

const types = [
  { value: "file", label: "Files" },
  { value: "text", label: "Written answer" },
  { value: "both", label: "Either or both" },
] as const;

function endOfDayIn(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 0, 0);
  return toLocalInput(d);
}

export default function NewAssignmentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const sections = useTeaching();
  const rules = useUploadRules().data;
  const [sectionId, setSectionId] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [opens, setOpens] = useState(() => toLocalInput(new Date()));
  const [due, setDue] = useState(() => endOfDayIn(7));
  const [type, setType] = useState<(typeof types)[number]["value"]>("file");
  const [points, setPoints] = useState(10);
  const [attempts, setAttempts] = useState(1);
  const [allowLate, setAllowLate] = useState(false);
  const [lateUntil, setLateUntil] = useState(() => endOfDayIn(9));
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);

  const section = sectionId || (sections.data?.length === 1 ? String(sections.data[0].id) : "");

  async function save(publish: boolean) {
    const e: Record<string, string> = {};
    if (!section) e.section = "Choose a section.";
    if (!title.trim()) e.title = "Give the assignment a title.";
    if (!due) e.due = "Set a due date.";
    else if (new Date(due) <= new Date(opens)) e.due = "The due date has to be after it opens.";
    if (allowLate && lateUntil && new Date(lateUntil) <= new Date(due))
      e.late = "The late deadline has to be after the due date.";
    if (rules && files.some((f) => f.size > rules.max_mb * 1024 * 1024))
      e.files = `Each file can be up to ${rules.max_mb} MB.`;
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;

    setBusy(publish ? "publish" : "draft");
    try {
      const created = await apiFetch<Assignment>("/api/assignments", {
        method: "POST",
        body: JSON.stringify({
          section_id: Number(section),
          title,
          instructions,
          available_from: new Date(opens).toISOString(),
          due_at: new Date(due).toISOString(),
          submission_type: type,
          max_points: points,
          max_attempts: attempts,
          allow_late: allowLate,
          late_until: allowLate && lateUntil ? new Date(lateUntil).toISOString() : null,
          publish,
        }),
      });
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        await apiFetch(`/api/assignments/${created.id}/attachments`, { method: "POST", body: form });
      }
      await queryClient.invalidateQueries({ queryKey: ["assignments"] });
      router.push(`/assignments/${created.id}`);
    } catch (err) {
      setFormError(errorDetail(err, "Couldn't save the assignment. Try again."));
      setBusy(null);
    }
  }

  const field =
    "h-11 w-full rounded-control border border-transparent bg-fill px-3 text-body outline-none focus:border-accent";
  const label = "flex flex-col gap-1.5 text-footnote font-semibold text-ink-2";
  const err = (k: string) =>
    errors[k] && <span className="text-footnote font-normal text-danger-ink">{errors[k]}</span>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <Link href="/assignments" className="inline-flex items-center gap-1 text-footnote font-semibold text-accent-ink">
          <ChevronLeftIcon className="size-4" /> Assignments
        </Link>
        <h1 className="mt-1 text-large-title font-bold">New assignment</h1>
      </header>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save(true);
        }}
        className="glass flex flex-col gap-5 rounded-card p-6"
      >
        {formError && (
          <p role="alert" className="rounded-row bg-danger/10 px-4 py-3 text-footnote font-medium text-danger-ink">
            {formError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Section
            <Select value={section} onChange={setSectionId} label="Section" placeholder="Choose a section"
              className={field}
              options={(sections.data ?? []).map((s) => ({
                value: String(s.id), label: `${s.course_code} · ${s.code}`, detail: s.course_title,
              }))} />
            {err("section")}
          </label>
          <label className={label}>
            Title
            <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)}
              placeholder="Lab 3: Linked lists" className={`${field} font-semibold`} />
            {err("title")}
          </label>
        </div>

        <label className={label}>
          Instructions
          <textarea value={instructions} rows={5} onChange={(e) => setInstructions(e.target.value)}
            placeholder="What to do, what to hand in, how it's marked."
            className={`${field} h-auto resize-y py-3`} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Opens
            <DateTimeField value={opens} onChange={setOpens} label="Opens" className={field} />
          </label>
          <label className={label}>
            Due
            <DateTimeField value={due} onChange={setDue} label="Due" className={field} />
            {err("due")}
          </label>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-footnote font-semibold text-ink-2">Students hand in</legend>
          <div role="radiogroup" className="flex rounded-control bg-fill p-1">
            {types.map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={type === t.value}
                onClick={() => setType(t.value)}
                className={`h-9 flex-1 rounded-[9px] text-footnote font-semibold ${
                  type === t.value ? "bg-[var(--cv-bg)] shadow-sm" : "text-ink-2"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Points
            <input type="number" min={1} max={1000} value={points}
              onChange={(e) => setPoints(Number(e.target.value))} className={field} />
          </label>
          <label className={label}>
            Attempts allowed
            <input type="number" min={1} max={10} value={attempts}
              onChange={(e) => setAttempts(Number(e.target.value))} className={field} />
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-3 text-body">
            <input type="checkbox" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)}
              className="size-5 accent-[var(--cv-accent)]" />
            Accept late work (marked as late)
          </label>
          {allowLate && (
            <label className={`${label} sm:w-1/2`}>
              Accept late work until
              <DateTimeField value={lateUntil} onChange={setLateUntil} label="Accept late work until"
                className={field} />
              {err("late")}
            </label>
          )}
        </div>

        <label className={label}>
          Files for students (optional)
          <input type="file" multiple accept={rules?.accept}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="text-body file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-fill-strong file:px-4 file:font-semibold" />
          {files.length > 0 && (
            <span className="font-normal text-ink-2">
              {files.map((f) => `${f.name} (${fileSize(f.size)})`).join(", ")}
            </span>
          )}
          {err("files")}
        </label>

        <div className="flex flex-wrap justify-end gap-3 border-t border-divider pt-4">
          <button type="button" onClick={() => save(false)} disabled={busy !== null}
            className="press h-11 rounded-full bg-fill-strong px-5 text-body font-semibold disabled:opacity-60">
            {busy === "draft" ? "Saving…" : "Save draft"}
          </button>
          <button type="submit" disabled={busy !== null}
            className="press h-11 rounded-full bg-accent px-6 text-body font-semibold text-on-accent disabled:opacity-60">
            {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </form>
    </div>
  );
}
