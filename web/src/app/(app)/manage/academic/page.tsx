"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { Select } from "@/components/select";
import { Switch } from "@/components/switch";
import { apiFetch, errorDetail } from "@/lib/api";
import { courseBg } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { structureKey, useCohorts, useSections, useStructure } from "@/lib/structure";
import type { CourseRow, Structure } from "@/lib/structure";
import type { CourseColor } from "@/lib/types";
import { PageTitle } from "@/components/page-title";
import { CohortForm } from "@/components/manage/structure-forms";

const field =
  "h-11 w-full rounded-control border border-transparent bg-[var(--cv-bg)] px-3 text-body outline-none focus:border-accent";
const label = "flex flex-col gap-1.5 text-footnote font-semibold text-ink-2";
const primary =
  "press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60";
const quiet = "press h-10 rounded-full bg-fill-strong px-4 text-footnote font-semibold disabled:opacity-60";

/** Saves through the API, refreshes the structure, and reports a readable error. */
function useSave() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(method: string, path: string, body: unknown, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/manage/structure${path}`, { method, body: JSON.stringify(body) });
      await queryClient.invalidateQueries({ queryKey: structureKey });
      after?.();
    } catch (err) {
      setError(errorDetail(err, "Couldn't save. Try again."));
    } finally {
      setBusy(false);
    }
  }
  return { save, error, busy, setError };
}

function FormBox({ children, onSubmit, error }: {
  children: React.ReactNode; onSubmit: () => void; error: string | null;
}) {
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="flex flex-col gap-3 rounded-row bg-fill p-4">
      {children}
      {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
    </form>
  );
}

// Sections (groups of students) ------------------------------------------------------------

function CohortsCard({ s, termId }: { s: Structure; termId: number }) {
  const [showArchived, setShowArchived] = useState(false);
  const cohorts = useCohorts(termId, showArchived ? "archived" : "active");
  const [adding, setAdding] = useState(false);
  const rows = cohorts.data ?? [];

  return (
    <section aria-labelledby="cohorts-h" className="glass flex flex-col gap-3 rounded-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="cohorts-h" className="text-headline font-semibold">
            Sections <span className="text-ink-3">{rows.length}</span>
          </h2>
          <p className="text-footnote text-ink-2">
            A group of students, such as BS CS 2024–2028 Morning A. Its students are in all its subjects, and its CR and GR act in every one.
          </p>
        </div>
        <span className="flex gap-2">
          <button className={quiet} onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Show active" : "Archived"}</button>
          <button className={quiet} aria-expanded={adding} onClick={() => setAdding((a) => !a)}>Add section</button>
        </span>
      </div>
      {adding && <CohortForm s={s} onDone={() => setAdding(false)} />}
      {cohorts.isSuccess && rows.length === 0 && (
        <p className="text-body text-ink-2">{showArchived ? "No archived sections." : "No sections yet. Add one for each group of students."}</p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map((c) => (
          <li key={c.id}>
            <Link href={`/manage/academic/cohorts/${c.id}?term=${termId}`}
              className="press flex h-full flex-col gap-1 rounded-row bg-fill p-3 hover:bg-fill-strong">
              <span className="flex items-center gap-2">
                <span className="rounded-md bg-accent/12 px-1.5 py-px text-caption font-semibold text-accent-ink">{c.code}</span>
                <span className="truncate text-body font-semibold">{c.label}</span>
              </span>
              <span className="text-footnote text-ink-2">
                {c.students} {c.students === 1 ? "student" : "students"} · {c.subjects} {c.subjects === 1 ? "subject" : "subjects"} this term
              </span>
              <span className="text-footnote text-ink-2">
                CR {c.cr ?? <span className="text-ink-3">not chosen</span>} · GR {c.gr ?? <span className="text-ink-3">not chosen</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Subjects ----------------------------------------------------------------------------------

function SubjectsCard({ s, termId }: { s: Structure; termId: number }) {
  const subjects = useSections(termId);
  const cohorts = useCohorts(termId);
  const { save, error, busy } = useSave();
  const [adding, setAdding] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [cohortId, setCohortId] = useState("");
  const active = s.courses.filter((c) => c.is_active);
  const rows = subjects.data ?? [];
  // Grouped by section, so each section's whole term is in one place.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.cohort ? `${r.code} · ${r.cohort}` : `${r.code} (no section)`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return (
    <section aria-labelledby="subjects-h" className="glass flex flex-col gap-3 rounded-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="subjects-h" className="text-headline font-semibold">
            Subjects <span className="text-ink-3">{rows.length}</span>
          </h2>
          <p className="text-footnote text-ink-2">A course taught to one section this term, with its teachers.</p>
        </div>
        <button className={quiet} aria-expanded={adding} onClick={() => setAdding((a) => !a)}>Add subject</button>
      </div>
      {adding && (
        <FormBox error={error} onSubmit={() => save("POST", "/sections", {
          course_id: Number(courseId), term_id: termId, cohort_id: Number(cohortId),
        }, () => { setCourseId(""); setAdding(false); })}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Course
              <Select value={courseId} onChange={setCourseId} label="Course" placeholder="Choose a course" className={field}
                options={active.map((c) => ({ value: String(c.id), label: c.code, detail: c.title }))} />
            </label>
            <label className={label}>Section
              <Select value={cohortId} onChange={setCohortId} label="Section" placeholder="Choose a section" className={field}
                options={(cohorts.data ?? []).map((c) => ({ value: String(c.id), label: c.code, detail: c.label }))} />
            </label>
          </div>
          <p className="text-footnote text-ink-2">Everyone in the section is enrolled in the new subject.</p>
          <div className="flex justify-end">
            <button type="submit" className={primary} disabled={busy || !courseId || !cohortId}>Add subject</button>
          </div>
        </FormBox>
      )}
      {subjects.isSuccess && rows.length === 0 && (
        <p className="text-body text-ink-2">No subjects in this term yet.</p>
      )}
      <ul className="flex flex-col gap-1">
        {[...groups.entries()].map(([group, list]) => (
          <li key={group} className="flex flex-col gap-1.5 rounded-row p-2">
            <span className="text-body font-semibold">{group}</span>
            <div className="flex flex-wrap gap-2">
              {list.map((r) => (
                <Link key={r.id} href={`/manage/academic/sections/${r.id}`}
                  className={`press flex flex-col rounded-[12px] px-3 py-2 text-footnote hover:bg-fill-strong ${
                    r.status === "archived" ? "bg-fill text-ink-3" : "bg-fill"}`}>
                  <span className="flex items-center gap-1.5 font-semibold">
                    <span className={`size-2.5 rounded ${courseBg[r.color]}`} aria-hidden="true" />
                    {r.course_code}{r.status === "archived" && " · archived"}
                  </span>
                  <span className="text-ink-2">
                    {r.course_title} · {r.teachers.join(", ") || "no teacher yet"}
                  </span>
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Courses -----------------------------------------------------------------------------------

function ColorPicker({ value, onChange, colors }: {
  value: CourseColor; onChange: (c: CourseColor) => void; colors: CourseColor[];
}) {
  return (
    <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} onClick={() => onChange(c)}
          className={`size-8 rounded-full ${courseBg[c]} ${value === c ? "ring-2 ring-ink ring-offset-2 ring-offset-[var(--cv-bg)]" : ""}`} />
      ))}
    </div>
  );
}

function CourseForm({ s, course, onDone }: { s: Structure; course?: CourseRow; onDone: () => void }) {
  const { save, error, busy } = useSave();
  const [dept, setDept] = useState(String(course?.department_id ?? s.departments[0]?.id ?? ""));
  const [code, setCode] = useState(course?.code ?? "");
  const [title, setTitle] = useState(course?.title ?? "");
  const [color, setColor] = useState<CourseColor>(course?.color ?? "sky");
  const [credits, setCredits] = useState(String(course?.credit_hours ?? 3));
  return (
    <FormBox error={error} onSubmit={() => save(course ? "PUT" : "POST", course ? `/courses/${course.id}` : "/courses", {
      department_id: Number(dept), code, title, color, credit_hours: Number(credits) || 0,
    }, onDone)}>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_6rem]">
        <label className={label}>Department
          <Select value={dept} onChange={setDept} label="Department" className={field}
            options={s.departments.map((d) => ({ value: String(d.id), label: d.code, detail: d.name }))} />
        </label>
        <label className={label}>Code
          <input value={code} maxLength={32} onChange={(e) => setCode(e.target.value)} placeholder="CS-410" className={field} />
        </label>
        <label className={label}>Title
          <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Compilers" className={field} />
        </label>
        <label className={label}>Credits
          <input inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value.replace(/\D/g, ""))} className={field} />
        </label>
      </div>
      <span className="text-footnote font-semibold text-ink-2">Colour, used everywhere this course appears</span>
      <ColorPicker value={color} onChange={setColor} colors={s.colors} />
      <div className="flex justify-end gap-2">
        <button type="button" className={quiet} onClick={onDone}>Cancel</button>
        <button type="submit" className={primary} disabled={busy}>{course ? "Save" : "Add course"}</button>
      </div>
    </FormBox>
  );
}

function CoursesCard({ s }: { s: Structure }) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const { save, error } = useSave();
  return (
    <section aria-labelledby="courses-h" className="glass flex flex-col gap-3 rounded-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="courses-h" className="text-headline font-semibold">Courses <span className="text-ink-3">{s.courses.length}</span></h2>
        <button className={quiet} onClick={() => setEditing(editing === "new" ? null : "new")}>Add course</button>
      </div>
      {editing === "new" && <CourseForm s={s} onDone={() => setEditing(null)} />}
      {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
      <ul className="flex flex-col">
        {s.courses.map((c) => (
          <li key={c.id} className="rounded-row">
            {editing === c.id ? (
              <CourseForm s={s} course={c} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-center gap-3 p-2.5">
                <span className={`size-3 shrink-0 rounded ${courseBg[c.color]}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-body font-semibold ${c.is_active ? "" : "text-ink-3"}`}>
                    {c.code} · {c.title}
                  </span>
                  <span className="block text-footnote text-ink-2">
                    {c.department} · {c.credit_hours} credit hours{c.is_active ? "" : " · archived"}
                  </span>
                </span>
                <button className="rounded-full px-3 py-1.5 text-footnote font-semibold text-accent-ink hover:bg-fill" onClick={() => setEditing(c.id)}>
                  Edit
                </button>
                <button className="rounded-full px-3 py-1.5 text-footnote font-semibold text-ink-2 hover:bg-fill"
                  onClick={() => save("PUT", `/courses/${c.id}`, {
                    department_id: c.department_id, code: c.code, title: c.title, color: c.color,
                    credit_hours: c.credit_hours, is_active: !c.is_active,
                  })}>
                  {c.is_active ? "Archive" : "Restore"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Departments and programs --------------------------------------------------------------------

function DepartmentsCard({ s }: { s: Structure }) {
  const dept = useSave();
  const prog = useSave();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [pDept, setPDept] = useState(String(s.departments[0]?.id ?? ""));
  const [pName, setPName] = useState("");
  const [pCode, setPCode] = useState("");
  const [adding, setAdding] = useState<"dept" | "program" | null>(null);
  return (
    <section aria-labelledby="depts-h" className="glass flex flex-col gap-3 rounded-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="depts-h" className="text-headline font-semibold">Departments and programs</h2>
        <div className="flex gap-2">
          {s.is_admin && <button className={quiet} onClick={() => setAdding(adding === "dept" ? null : "dept")}>Add department</button>}
          <button className={quiet} onClick={() => setAdding(adding === "program" ? null : "program")}>Add program</button>
        </div>
      </div>
      {adding === "dept" && (
        <FormBox error={dept.error} onSubmit={() => dept.save("POST", "/departments", { name, code }, () => {
          setName(""); setCode(""); setAdding(null);
        })}>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <label className={label}>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mathematics" className={field} /></label>
            <label className={label}>Code<input value={code} maxLength={32} onChange={(e) => setCode(e.target.value)} placeholder="MATH" className={field} /></label>
          </div>
          <div className="flex justify-end"><button type="submit" className={primary} disabled={dept.busy}>Add department</button></div>
        </FormBox>
      )}
      {adding === "program" && (
        <FormBox error={prog.error} onSubmit={() => prog.save("POST", "/programs", {
          department_id: Number(pDept), name: pName, code: pCode,
        }, () => { setPName(""); setPCode(""); setAdding(null); })}>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr]">
            <label className={label}>Department
              <Select value={pDept} onChange={setPDept} label="Department" className={field}
                options={s.departments.map((d) => ({ value: String(d.id), label: d.code, detail: d.name }))} />
            </label>
            <label className={label}>Name<input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="BS Mathematics" className={field} /></label>
            <label className={label}>Code<input value={pCode} maxLength={32} onChange={(e) => setPCode(e.target.value)} placeholder="BSM" className={field} /></label>
          </div>
          <div className="flex justify-end"><button type="submit" className={primary} disabled={prog.busy}>Add program</button></div>
        </FormBox>
      )}
      <ul className="flex flex-col gap-1">
        {s.departments.map((d) => (
          <li key={d.id} className="rounded-row p-2.5">
            <span className="block text-body font-semibold">{d.name} <span className="font-normal text-ink-2">{d.code} · {d.courses} courses</span></span>
            <span className="block text-footnote text-ink-2">
              {s.programs.filter((p) => p.department_id === d.id).map((p) => p.name).join(", ") || "No programs yet"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Terms (admins) -----------------------------------------------------------------------------

function TermsCard({ s }: { s: Structure }) {
  const { save, error, busy } = useSave();
  const [adding, setAdding] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const current = s.terms.find((t) => t.is_current);
  return (
    <section aria-labelledby="terms-h" className="glass flex flex-col gap-3 rounded-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="terms-h" className="text-headline font-semibold">Terms</h2>
        <span className="flex flex-wrap gap-2">
          {s.terms.some((t) => t.is_current) && (
            <button className={primary} onClick={() => { setRolling((r) => !r); setAdding(false); }} aria-expanded={rolling}>
              Start next semester
            </button>
          )}
          <button className={quiet} onClick={() => { setAdding((a) => !a); setRolling(false); }}>Add term</button>
        </span>
      </div>
      {rolling && <NextSemester s={s} onDone={() => setRolling(false)} />}
      {adding && (
        <FormBox error={error} onSubmit={() => save("POST", "/terms", { name, code, starts_on: start, ends_on: end }, () => setAdding(false))}>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className={label}>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring 2027" className={field} /></label>
            <label className={label}>Code<input value={code} maxLength={32} onChange={(e) => setCode(e.target.value)} placeholder="S27" className={field} /></label>
            <label className={label}>Starts<DatePicker value={start} onChange={setStart} label="Starts" className={field} /></label>
            <label className={label}>Ends<DatePicker value={end} onChange={setEnd} label="Ends" min={start || undefined} className={field} /></label>
          </div>
          <div className="flex justify-end"><button type="submit" className={primary} disabled={busy || !start || !end}>Add term</button></div>
        </FormBox>
      )}
      <ul className="flex flex-col">
        {s.terms.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-row p-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold">{t.name} <span className="font-normal text-ink-2">{t.code}</span></span>
              <span className="block text-footnote text-ink-2">{t.starts_on} to {t.ends_on}</span>
            </span>
            {t.is_current ? (
              <span className="rounded-full bg-success/12 px-2.5 py-1 text-caption font-semibold text-success-ink">Current</span>
            ) : current && t.starts_on > current.starts_on ? (
              <span className="flex flex-wrap gap-1">
                <button className="rounded-full px-3 py-1.5 text-footnote font-semibold text-accent-ink hover:bg-fill"
                  title={`Each section's students join its subjects in this term`}
                  onClick={() => save("POST", `/terms/${t.id}/carry-from/${current.id}`, {})}>
                  Carry students from {current.name}
                </button>
                <button className="rounded-full px-3 py-1.5 text-footnote font-semibold text-accent-ink hover:bg-fill"
                  onClick={() => save("POST", `/terms/${t.id}/current`, {})}>
                  Make current
                </button>
              </span>
            ) : (
              <button className="rounded-full px-3 py-1.5 text-footnote font-semibold text-accent-ink hover:bg-fill"
                onClick={() => save("POST", `/terms/${t.id}/current`, {})}>
                Make current
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Starts the semester after the current one: a new term, the classes carried over, and
 *  (optionally) the subjects and teachers copied when they repeat. */
function NextSemester({ s, onDone }: { s: Structure; onDone: () => void }) {
  const queryClient = useQueryClient();
  const current = s.terms.find((t) => t.is_current)!;
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [copySections, setCopySections] = useState(false);
  const [copyTeachers, setCopyTeachers] = useState(false);
  const [carry, setCarry] = useState(true);
  const [closeOld, setCloseOld] = useState(true);
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ sections_copied: number; teachers_copied: number; students_carried: number; sections_closed: number }>(
        `/api/manage/structure/terms/${current.id}/next`,
        {
          method: "POST",
          body: JSON.stringify({
            name, code, starts_on: start, ends_on: end, copy_sections: copySections,
            copy_teachers: copySections && copyTeachers, carry_students: carry, close_old: closeOld,
            make_current: makeCurrent,
          }),
        },
      );
      await queryClient.invalidateQueries();
      setDone(
        [
          r.sections_copied && `${r.sections_copied} subjects copied`,
          r.teachers_copied && `${r.teachers_copied} teachers kept`,
          `${r.students_carried} enrollments carried over`,
          r.sections_closed && `${r.sections_closed} old subjects closed`,
        ].filter(Boolean).join(", ") + ".",
      );
    } catch (err) {
      setError(errorDetail(err, "Couldn't start the semester. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-2 rounded-row bg-success/10 p-4 text-footnote">
        <p className="text-body font-semibold">{name} has started.</p>
        <p>{done}</p>
        {!copySections && (
          <p className="text-ink-2">
            Next: add the new semester&apos;s subjects for each section (or import the timetable), then
            use “Carry students” on the new term so each section&apos;s students join them.
          </p>
        )}
        <button className={`${quiet} self-start`} onClick={onDone}>Done</button>
      </div>
    );
  }

  const option = (checked: boolean, set: (v: boolean) => void, title: string, detail: string, disabled = false) => (
    <span className={`flex items-start gap-3 ${disabled ? "opacity-50" : ""}`}>
      <Switch checked={checked} onChange={set} label={title} disabled={disabled} />
      <span>
        <span className="block text-body font-medium text-ink">{title}</span>
        <span className="block text-footnote font-normal">{detail}</span>
      </span>
    </span>
  );

  return (
    <FormBox error={error} onSubmit={go}>
      <p className="text-footnote text-ink-2">Follows {current.name}.</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className={label}>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring 2027" className={field} /></label>
        <label className={label}>Code<input value={code} maxLength={32} onChange={(e) => setCode(e.target.value)} placeholder="S27" className={field} /></label>
        <label className={label}>Starts<DatePicker value={start} onChange={setStart} label="Starts" className={field} /></label>
        <label className={label}>Ends<DatePicker value={end} onChange={setEnd} label="Ends" min={start || undefined} className={field} /></label>
      </div>
      <div className="flex flex-col gap-3 text-ink-2">
        {option(carry, setCarry, "Carry the students over",
          "Each section's students join its new-term subjects, and its CR and GR carry on.")}
        {option(copySections, setCopySections, "Copy the subjects",
          "Only when the same subjects run again. Otherwise import the new timetable afterwards.")}
        {option(copyTeachers, setCopyTeachers, "Keep the same teachers on copied subjects",
          "Each copied subject keeps its teachers.", !copySections)}
        {option(closeOld, setCloseOld, `Close ${current.name}`,
          "Its subjects are archived and enrollments marked completed. Nothing is deleted.")}
        {option(makeCurrent, setMakeCurrent, "Make it the current semester",
          "Timetables and Today switch to the new term.")}
      </div>
      <div className="flex justify-end">
        <button type="submit" className={primary} disabled={busy || !name.trim() || !code.trim() || !start || !end}>
          {busy ? "Starting…" : "Start semester"}
        </button>
      </div>
    </FormBox>
  );
}

// Attendance (admins) ----------------------------------------------------------------------

function AttendanceCard() {
  const queryClient = useQueryClient();
  const institution = useMe().data?.institution;
  const [error, setError] = useState<string | null>(null);
  if (!institution) return null;

  async function set(enabled: boolean, visible: boolean) {
    setError(null);
    try {
      await apiFetch("/api/attendance/settings", {
        method: "PUT",
        body: JSON.stringify({ attendance_enabled: enabled, attendance_visible_to_students: visible }),
      });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError(errorDetail(err, "Couldn't save. Try again."));
    }
  }

  return (
    <section aria-labelledby="attendance-h" className="glass flex flex-col gap-3 rounded-card p-5">
      <h2 id="attendance-h" className="text-headline font-semibold">Attendance</h2>
      <span className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-body font-semibold">Teachers record attendance</span>
          <span className="block text-footnote text-ink-2">Switch on only if your institution has approved it. Corrections after 48 hours need a coordinator or admin.</span>
        </span>
        <Switch checked={institution.attendance_enabled} label="Teachers record attendance"
          onChange={(on) => set(on, institution.attendance_visible_to_students)} />
      </span>
      <span className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-body font-semibold">Students see their own attendance</span>
          <span className="block text-footnote text-ink-2">On their Progress page, labelled as recorded by teachers.</span>
        </span>
        <Switch checked={institution.attendance_visible_to_students} disabled={!institution.attendance_enabled}
          label="Students see their own attendance" onChange={(on) => set(true, on)} />
      </span>
      {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
    </section>
  );
}

export default function AcademicPage() {
  const structure = useStructure();
  const s = structure.data;
  const [termId, setTermId] = useState<string>("");
  const current = s?.terms.find((t) => t.is_current) ?? s?.terms[0];
  const chosen = termId || (current ? String(current.id) : "");

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-body font-semibold text-ink-2">Terms, sections, subjects and who&apos;s in them</p>
          <PageTitle className="mt-1 text-large-title font-bold" text="Sections & subjects" />
        </div>
        {s && s.terms.length > 0 && (
          <label className="flex items-center gap-2 text-footnote font-semibold text-ink-2">
            Term
            <Select value={chosen} onChange={setTermId} label="Term"
              className="glass h-11 min-w-44 rounded-full px-4 text-body font-semibold text-ink"
              options={s.terms.map((t) => ({ value: String(t.id), label: t.name, detail: t.is_current ? "Current" : undefined }))} />
          </label>
        )}
      </header>
      {structure.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {structure.isError && <p role="alert" className="glass rounded-card p-6 text-body">You can&apos;t manage courses.</p>}
      {s && (
        <>
          {chosen && <CohortsCard s={s} termId={Number(chosen)} />}
          {chosen && <SubjectsCard s={s} termId={Number(chosen)} />}
          <CoursesCard s={s} />
          <DepartmentsCard s={s} />
          {s.is_admin && <TermsCard s={s} />}
          {s.is_admin && <AttendanceCard />}
        </>
      )}
    </>
  );
}
