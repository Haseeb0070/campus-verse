"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { PersonPicker } from "@/components/manage/structure-forms";
import { Select } from "@/components/select";
import { ApiError, apiFetch, errorDetail } from "@/lib/api";
import { courseBg } from "@/lib/format";
import { cohortsKey, structureKey, useSectionDetail, useStructure } from "@/lib/structure";
import type { SectionDetail } from "@/lib/structure";

const field =
  "h-11 w-full rounded-control border border-transparent bg-fill px-3 text-body outline-none focus:border-accent";
const quiet = "press h-10 rounded-full bg-fill-strong px-4 text-footnote font-semibold disabled:opacity-60";

const statusChip = {
  active: "bg-success/12 text-success-ink",
  dropped: "bg-fill-strong text-ink-2",
  completed: "bg-accent/12 text-accent-ink",
} as const;

export default function SectionPage() {
  const id = Number(useParams<{ id: string }>().id);
  const queryClient = useQueryClient();
  const section = useSectionDetail(id);
  const programs = useStructure().data?.programs ?? [];
  const [picking, setPicking] = useState<"teacher" | "student" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const s = section.data;
  const notFound = section.error instanceof ApiError && section.error.status === 404;

  async function call(method: string, path: string, body?: unknown) {
    setError(null);
    try {
      const saved = await apiFetch<SectionDetail>(`/api/manage/structure/sections/${id}${path}`, {
        method, body: body === undefined ? undefined : JSON.stringify(body),
      });
      queryClient.setQueryData([...structureKey, "section", id], saved);
      queryClient.invalidateQueries({ queryKey: [...structureKey, "sections"] });
      queryClient.invalidateQueries({ queryKey: cohortsKey });
      return true;
    } catch (err) {
      setError(errorDetail(err, "Couldn't save. Try again."));
      return false;
    }
  }

  return (
    <>
      <Link href="/manage/academic" className="inline-flex items-center gap-1 self-start text-footnote font-semibold text-accent-ink">
        <ChevronLeftIcon className="size-4" /> Sections &amp; subjects
      </Link>
      {notFound && <p className="glass rounded-card p-6 text-body">This subject isn&apos;t one you manage.</p>}
      {s && (
        <>
          <header className="flex flex-wrap items-center gap-4">
            <span className={`grid size-14 shrink-0 place-items-center rounded-[16px] text-headline font-bold text-white ${courseBg[s.color]}`}
              aria-hidden="true">{s.code}</span>
            <div className="min-w-0 flex-1">
              <h1 className="text-title-1 font-bold">{s.course_code} · {s.code}</h1>
              <p className="text-body text-ink-2">{s.course_title} · {s.term}{s.status === "archived" && " · archived"}</p>
            </div>
            <button className={quiet} onClick={() => call("PATCH", "", { status: s.status === "active" ? "archived" : "active" })}>
              {s.status === "active" ? "Archive subject" : "Restore subject"}
            </button>
          </header>

          {error && <p role="alert" className="rounded-row bg-danger/10 px-4 py-3 text-footnote text-danger-ink">{error}</p>}

          {s.cohort_id ? (
            <section aria-label="Section" className="glass flex flex-wrap items-center gap-3 rounded-card p-5">
              <span className="min-w-0 flex-1">
                <span className="block text-footnote font-semibold text-ink-2">Taught to section</span>
                <span className="block text-body font-semibold">{s.code} · {s.cohort}</span>
              </span>
              <Link href={`/manage/academic/cohorts/${s.cohort_id}`} className={quiet + " inline-flex items-center"}>
                Open section
              </Link>
            </section>
          ) : (
            <section aria-label="Details" className="glass flex flex-wrap items-end gap-3 rounded-card p-5">
              <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
                Code
                <input value={code ?? s.code} maxLength={16} onChange={(e) => setCode(e.target.value)} className={`${field} w-32`} />
              </label>
              <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-footnote font-semibold text-ink-2">
                Program
                <Select value={s.program_id ? String(s.program_id) : ""} label="Program" placeholder="None" className={field}
                  onChange={(v) => call("PATCH", "", v ? { program_id: Number(v) } : { clear_program: true })}
                  options={[{ value: "", label: "None" }, ...programs.map((p) => ({ value: String(p.id), label: p.name }))]} />
              </label>
              {code !== null && code.trim() !== s.code && (
                <button className="press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent"
                  onClick={async () => (await call("PATCH", "", { code })) && setCode(null)}>
                  Save code
                </button>
              )}
              <p className="w-full text-footnote text-ink-2">This subject isn&apos;t linked to a section, so its students are enrolled one by one.</p>
            </section>
          )}

          <section aria-labelledby="teachers-h" className="glass flex flex-col gap-3 rounded-card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 id="teachers-h" className="text-headline font-semibold">Teachers</h2>
              <button className={quiet} onClick={() => setPicking(picking === "teacher" ? null : "teacher")}>Add teacher</button>
            </div>
            {picking === "teacher" && (
              <PersonPicker kind="teacher" label="Find a teacher" exclude={new Set(s.teacher_list.map((t) => t.id))}
                onPick={async (p) => (await call("POST", "/teachers", { user_id: p.id })) && setPicking(null)} />
            )}
            {s.teacher_list.length === 0 && <p className="text-body text-ink-2">No teacher yet. Students can&apos;t get notices or work in this subject until there is one.</p>}
            <ul>
              {s.teacher_list.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-row p-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/15 text-caption font-semibold text-accent-ink">{t.initials}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-semibold">{t.name}</span>
                    <span className="block truncate text-footnote text-ink-2">{t.email} · {t.role === "lead" ? "Lead" : "Assistant"}</span>
                  </span>
                  <button className="rounded-full px-3 py-1.5 text-footnote font-semibold text-danger-ink hover:bg-danger/10"
                    onClick={() => call("DELETE", `/teachers/${t.id}`)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="students-h" className="glass flex flex-col gap-3 rounded-card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 id="students-h" className="text-headline font-semibold">Students <span className="text-ink-3">{s.students}</span></h2>
              <button className={quiet} disabled={s.status !== "active"} onClick={() => setPicking(picking === "student" ? null : "student")}>
                Enroll students
              </button>
            </div>
            {picking === "student" && (
              <PersonPicker kind="student" label="Find students to enroll"
                exclude={new Set(s.student_list.filter((x) => x.status === "active").map((x) => x.id))}
                onPick={(p) => call("POST", "/students", { user_ids: [p.id] })} />
            )}
            {s.student_list.length === 0 && <p className="text-body text-ink-2">Nobody is enrolled yet.</p>}
            <ul>
              {s.student_list.map((st) => (
                <li key={st.id} className="flex flex-wrap items-center gap-3 rounded-row p-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-fill-strong text-caption font-semibold">{st.initials}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-body font-semibold ${st.status === "active" ? "" : "text-ink-2"}`}>{st.name}</span>
                    <span className="block truncate text-footnote text-ink-2">{st.email}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${statusChip[st.status]}`}>
                    {st.status === "active" ? "Enrolled" : st.status === "dropped" ? "Dropped" : "Completed"}
                  </span>
                  <button className="rounded-full px-3 py-1.5 text-footnote font-semibold text-ink-2 hover:bg-fill"
                    onClick={() => call("PATCH", `/students/${st.id}`, { status: st.status === "active" ? "dropped" : "active" })}>
                    {st.status === "active" ? "Drop" : "Re-enroll"}
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-caption text-ink-3">
              {s.cohort_id
                ? "Everyone in the section is enrolled here. Drop someone who doesn't take this subject, or enroll someone from outside the section (a repeater, an elective). Dropping keeps their past work."
                : "Dropping keeps the record and their past work; they just lose access."}
            </p>
          </section>
        </>
      )}
    </>
  );
}
