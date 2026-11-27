"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ChipGroup } from "@/components/chip-group";
import { ChevronLeftIcon } from "@/components/icons";
import { CohortForm, PersonPicker } from "@/components/manage/structure-forms";
import { Select } from "@/components/select";
import { ApiError, apiFetch, errorDetail } from "@/lib/api";
import { courseBg } from "@/lib/format";
import { cohortsKey, structureKey, useCohort, useStructure } from "@/lib/structure";
import type { CohortDetail } from "@/lib/structure";

const field =
  "h-11 w-full rounded-control border border-transparent bg-[var(--cv-bg)] px-3 text-body outline-none focus:border-accent";
const quiet = "press h-10 rounded-full bg-fill-strong px-4 text-footnote font-semibold disabled:opacity-60";
const primary =
  "press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60";

type Role = "" | "cr" | "gr";
const ROLES: { value: Role; label: string }[] = [
  { value: "", label: "Student" },
  { value: "cr", label: "CR" },
  { value: "gr", label: "GR" },
];

/** A CR/GR choice the server refused because the section has one: asked before replacing. */
type Pending = { studentId: number; name: string; role: "cr" | "gr"; message: string };

function CohortPage() {
  const id = Number(useParams<{ id: string }>().id);
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const structure = useStructure().data;
  const terms = structure?.terms ?? [];
  const termParam = params.get("term");
  const termId = termParam ? Number(termParam) : (terms.find((t) => t.is_current) ?? terms[0])?.id ?? null;
  const cohort = useCohort(id, termId);
  const c = cohort.data;
  const notFound = cohort.error instanceof ApiError && cohort.error.status === 404;

  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [addingSubject, setAddingSubject] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  /** A student the server said is in another section: asked before moving them. */
  const [moving, setMoving] = useState<{ id: number; name: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  /** Calls the section's API and shows what came back. Returns false when it failed. */
  async function call(method: string, path: string, body?: unknown, onConflict?: (message: string) => void) {
    setError(null);
    setBusy(true);
    try {
      const saved = await apiFetch<CohortDetail>(`/api/manage/sections/${id}${path}${termId ? `${path.includes("?") ? "&" : "?"}term_id=${termId}` : ""}`, {
        method, body: body === undefined ? undefined : JSON.stringify(body),
      });
      queryClient.setQueryData([...cohortsKey, id, termId], saved);
      queryClient.invalidateQueries({ queryKey: [...cohortsKey, "list"] });
      queryClient.invalidateQueries({ queryKey: [...structureKey, "sections"] });
      return true;
    } catch (err) {
      if (onConflict && err instanceof ApiError && err.status === 409) onConflict(errorDetail(err, ""));
      else setError(errorDetail(err, "Couldn't save. Try again."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function setRole(studentId: number, name: string, role: Role, replace = false) {
    setPending(null);
    return call("PUT", "/reps", { term_id: termId, student_id: studentId, role: role || null, replace },
      role ? (message) => setPending({ studentId, name, role, message }) : undefined);
  }

  async function addSubject() {
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/api/manage/structure/sections", {
        method: "POST",
        body: JSON.stringify({ course_id: Number(courseId), term_id: termId, cohort_id: id }),
      });
      await queryClient.invalidateQueries({ queryKey: cohortsKey });
      await queryClient.invalidateQueries({ queryKey: structureKey });
      setCourseId("");
      setAddingSubject(false);
    } catch (err) {
      setError(errorDetail(err, "Couldn't add the subject."));
    } finally {
      setBusy(false);
    }
  }

  const active = c?.members.filter((m) => m.status === "active") ?? [];
  const left = c?.members.filter((m) => m.status === "left") ?? [];
  const taken = new Set(c?.subject_list.map((x) => x.course_code));
  const courses = (structure?.courses ?? []).filter((x) => x.is_active && !taken.has(x.code));

  return (
    <>
      <Link href="/manage/academic" className="inline-flex items-center gap-1 self-start text-footnote font-semibold text-accent-ink">
        <ChevronLeftIcon className="size-4" /> Sections &amp; subjects
      </Link>
      {notFound && <p className="glass rounded-card p-6 text-body">This section isn&apos;t one you manage.</p>}
      {cohort.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {c && (
        <>
          <header className="flex flex-wrap items-center gap-4">
            <span className="grid h-14 min-w-14 shrink-0 place-items-center rounded-[16px] bg-accent px-3 text-headline font-bold text-on-accent">
              {c.code}
            </span>
            <div className="min-w-64 flex-1">
              <h1 className="text-title-1 font-bold">{c.label}</h1>
              <p className="text-body text-ink-2">
                Section · {c.students} {c.students === 1 ? "student" : "students"}{c.status === "archived" && " · archived"}
              </p>
            </div>
            {terms.length > 0 && (
              <Select value={termId ? String(termId) : ""} label="Term"
                className="glass h-11 min-w-44 rounded-full px-4 text-body font-semibold text-ink"
                onChange={(v) => router.replace(`/manage/academic/cohorts/${id}?term=${v}`)}
                options={terms.map((t) => ({ value: String(t.id), label: t.name, detail: t.is_current ? "Current" : undefined }))} />
            )}
            {c.can_manage && (
              <span className="flex gap-2">
                <button className={quiet} onClick={() => setEditing((e) => !e)} aria-expanded={editing}>Edit</button>
                <button className={quiet} onClick={() => call("PUT", "", {
                  program_id: c.program_id, code: c.code, name: c.name, shift: c.shift, start_year: c.start_year,
                  end_year: c.end_year, status: c.status === "active" ? "archived" : "active",
                })}>
                  {c.status === "active" ? "Archive" : "Restore"}
                </button>
              </span>
            )}
          </header>

          {editing && structure && <CohortForm s={structure} cohort={c} onDone={() => setEditing(false)} />}
          {error && <p role="alert" className="rounded-row bg-danger/10 px-4 py-3 text-footnote text-danger-ink">{error}</p>}

          <section aria-labelledby="reps-h" className="glass flex flex-col gap-2 rounded-card p-5">
            <h2 id="reps-h" className="text-headline font-semibold">CR and GR <span className="font-normal text-ink-2">· {c.term ?? "no term"}</span></h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["cr", "gr"] as const).map((role) => {
                const r = c.reps.find((x) => x.role === role);
                return (
                  <div key={role} className="rounded-row bg-fill p-3">
                    <span className="block text-caption font-semibold text-ink-2">{role.toUpperCase()}</span>
                    <span className="block text-body font-semibold">{r ? r.name : <span className="text-ink-3">Not chosen</span>}</span>
                    {r?.chosen_by && <span className="block text-footnote text-ink-2">Chosen by {r.chosen_by}</span>}
                  </div>
                );
              })}
            </div>
            <p className="text-footnote text-ink-2">
              They act in every subject this section has in {c.term ?? "the term"}: cancel or shift lectures and take
              attendance. Each subject&apos;s teacher is told, or approves first. Choose them from the students below; a new
              semester starts with the same ones.
            </p>
          </section>

          <section aria-labelledby="subjects-h" className="glass flex flex-col gap-3 rounded-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="subjects-h" className="text-headline font-semibold">
                Subjects <span className="text-ink-3">{c.subject_list.length}</span>
                <span className="font-normal text-ink-2"> · {c.term ?? "no term"}</span>
              </h2>
              {c.can_manage && termId && (
                <button className={quiet} disabled={c.status !== "active"} aria-expanded={addingSubject}
                  onClick={() => setAddingSubject((a) => !a)}>Add subject</button>
              )}
            </div>
            {addingSubject && (
              <form noValidate onSubmit={(e) => { e.preventDefault(); addSubject(); }}
                className="flex flex-wrap items-end gap-3 rounded-row bg-fill p-4">
                <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-footnote font-semibold text-ink-2">
                  Course
                  <Select value={courseId} onChange={setCourseId} label="Course" placeholder="Choose a course" className={field}
                    options={courses.map((x) => ({ value: String(x.id), label: x.code, detail: x.title }))} />
                </label>
                <button type="submit" className={primary} disabled={busy || !courseId}>Add subject</button>
                <p className="w-full text-footnote text-ink-2">All {active.length} students of the section are enrolled in it.</p>
              </form>
            )}
            {c.subject_list.length === 0 && <p className="text-body text-ink-2">No subjects for this section in {c.term ?? "this term"} yet.</p>}
            <ul className="grid gap-2 sm:grid-cols-2">
              {c.subject_list.map((x) => (
                <li key={x.id}>
                  <Link href={`/manage/academic/sections/${x.id}`}
                    className={`press flex h-full flex-col gap-0.5 rounded-row bg-fill p-3 hover:bg-fill-strong ${x.status === "archived" ? "text-ink-3" : ""}`}>
                    <span className="flex items-center gap-2 text-body font-semibold">
                      <span className={`size-3 shrink-0 rounded ${courseBg[x.color]}`} aria-hidden="true" />
                      <span className="shrink-0">{x.course_code}</span>
                      <span className="min-w-0 truncate font-normal text-ink-2">{x.course_title}</span>
                    </span>
                    <span className="text-footnote text-ink-2">
                      {x.teachers.join(", ") || "No teacher yet"} · {x.students} {x.students === 1 ? "student" : "students"}
                      {x.status === "archived" && " · archived"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="students-h" className="glass flex flex-col gap-3 rounded-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="students-h" className="text-headline font-semibold">Students <span className="text-ink-3">{active.length}</span></h2>
              {c.can_manage && (
                <button className={quiet} disabled={c.status !== "active"} aria-expanded={picking}
                  onClick={() => setPicking((p) => !p)}>Add students</button>
              )}
            </div>
            {picking && (
              <PersonPicker kind="student" label="Find students to add to the section"
                exclude={new Set(active.map((m) => m.id))}
                onPick={(p) => {
                  setMoving(null);
                  call("POST", "/students", { user_ids: [p.id] }, (message) => setMoving({ id: p.id, name: p.name, message }));
                }} />
            )}
            {moving && (
              <div role="alertdialog" aria-labelledby="move-h" className="flex flex-wrap items-center gap-3 rounded-row bg-warning/15 p-3">
                <p id="move-h" className="min-w-0 flex-1 text-footnote">
                  {moving.message} Move {moving.name} to {c.code}? They leave that section&apos;s subjects (and its CR/GR) and join this one&apos;s.
                </p>
                <span className="flex gap-2">
                  <button className="press h-9 rounded-full px-3.5 text-footnote font-semibold hover:bg-fill-strong" onClick={() => setMoving(null)}>Cancel</button>
                  <button className="press h-9 rounded-full bg-accent px-3.5 text-footnote font-semibold text-on-accent" disabled={busy}
                    onClick={async () => (await call("POST", "/students", { user_ids: [moving.id], move: true })) && setMoving(null)}>
                    Move
                  </button>
                </span>
              </div>
            )}
            {active.length === 0 && <p className="text-body text-ink-2">No students yet. Adding one enrolls them in all of this section&apos;s subjects.</p>}
            <ul>
              {active.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-row p-2 hover:bg-fill">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-fill-strong text-caption font-semibold">{m.initials}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-body font-semibold">
                      <span className="truncate">{m.name}</span>
                      {m.role && <span className="rounded-md bg-accent/12 px-1.5 py-px text-caption text-accent-ink">{m.role.toUpperCase()}</span>}
                    </span>
                    <span className="block truncate text-footnote text-ink-2">{m.email}</span>
                  </span>
                  {c.can_manage && termId && (
                    <ChipGroup<Role> label={`Role of ${m.name}`} value={m.role ?? ""} options={ROLES}
                      onChange={(role) => setRole(m.id, m.name, role)} />
                  )}
                  {c.can_manage && (
                    <button className="rounded-full px-3 py-1.5 text-footnote font-semibold text-danger-ink hover:bg-danger/10"
                      onClick={() => call("DELETE", `/students/${m.id}`)}>
                      Remove
                    </button>
                  )}
                  {pending?.studentId === m.id && (
                    <div role="alertdialog" aria-labelledby="replace-h" ref={(el) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" })}
                      className="flex w-full basis-full flex-wrap items-center gap-3 rounded-row bg-warning/15 p-3">
                      <p id="replace-h" className="min-w-0 flex-1 text-footnote">
                        {pending!.message} Make {pending!.name} the {pending!.role.toUpperCase()} instead? Both are told.
                      </p>
                      <span className="flex gap-2">
                        <button className="press h-9 rounded-full px-3.5 text-footnote font-semibold hover:bg-fill-strong" onClick={() => setPending(null)}>Keep</button>
                        <button className="press h-9 rounded-full bg-accent px-3.5 text-footnote font-semibold text-on-accent" disabled={busy}
                          onClick={() => setRole(pending!.studentId, pending!.name, pending!.role, true)}>
                          Replace
                        </button>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {left.length > 0 && (
              <details className="text-footnote text-ink-2">
                <summary className="cursor-pointer font-semibold">Left the section ({left.length})</summary>
                <ul className="mt-1">
                  {left.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 rounded-row p-2">
                      <span className="min-w-0 flex-1 truncate">{m.name} · {m.email}</span>
                      {c.can_manage && c.status === "active" && (
                        <button className="rounded-full px-3 py-1.5 font-semibold text-accent-ink hover:bg-fill"
                          onClick={() => call("POST", "/students", { user_ids: [m.id] })}>
                          Add back
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="text-caption text-ink-3">
              Removing someone drops them from this section&apos;s current subjects and its CR/GR. Their past work stays.
            </p>
          </section>
        </>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <CohortPage />
    </Suspense>
  );
}
