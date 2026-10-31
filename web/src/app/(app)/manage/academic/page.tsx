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
import { structureKey, useSections, useStructure } from "@/lib/structure";
import type { CourseRow, Structure } from "@/lib/structure";
import type { CourseColor } from "@/lib/types";

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

// Sections ----------------------------------------------------------------------------------

function SectionsCard({ s, termId }: { s: Structure; termId: number }) {
  const sections = useSections(termId);
  const { save, error, busy } = useSave();
  const [adding, setAdding] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [code, setCode] = useState("");
  const [programId, setProgramId] = useState("");
  const active = s.courses.filter((c) => c.is_active);
  const groups = new Map<number, typeof rows>();
  const rows = sections.data ?? [];
  for (const r of rows) groups.set(r.course_id, [...(groups.get(r.course_id) ?? []), r]);

  return (
    <section aria-labelledby="sections-h" className="glass flex flex-col gap-3 rounded-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="sections-h" className="text-headline font-semibold">
          Sections <span className="text-ink-3">{rows.length}</span>
        </h2>
        <button className={quiet} aria-expanded={adding} onClick={() => setAdding((a) => !a)}>Add section</button>
      </div>
      {adding && (
        <FormBox error={error} onSubmit={() => save("POST", "/sections", {
          course_id: Number(courseId), term_id: termId, code, program_id: programId ? Number(programId) : null,
        }, () => { setCode(""); setAdding(false); })}>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr]">
            <label className={label}>Course
              <Select value={courseId} onChange={setCourseId} label="Course" placeholder="Choose a course" className={field}
                options={active.map((c) => ({ value: String(c.id), label: c.code, detail: c.title }))} />
            </label>
            <label className={label}>Section
              <input value={code} maxLength={16} onChange={(e) => setCode(e.target.value)} placeholder="3D" className={field} />
            </label>
            <label className={label}>Program (optional)
              <Select value={programId} onChange={setProgramId} label="Program" placeholder="None" className={field}
                options={[{ value: "", label: "None" }, ...s.programs.map((p) => ({ value: String(p.id), label: p.name }))]} />
            </label>
          </div>
          <div className="flex justify-end">
            <button type="submit" className={primary} disabled={busy || !courseId || !code.trim()}>Add section</button>
          </div>
        </FormBox>
      )}
      {sections.isSuccess && rows.length === 0 && (
        <p className="text-body text-ink-2">No sections in this term yet.</p>
      )}
      <ul className="flex flex-col gap-1">
        {[...groups.values()].map((list) => (
          <li key={list[0].course_id} className="flex flex-col gap-1.5 rounded-row p-2">
            <span className="flex items-center gap-2 text-body font-semibold">
              <span className={`size-3 rounded ${courseBg[list[0].color]}`} aria-hidden="true" />
              {list[0].course_code} <span className="font-normal text-ink-2">{list[0].course_title}</span>
            </span>
            <div className="flex flex-wrap gap-2 pl-5">
              {list.map((r) => (
                <Link key={r.id} href={`/manage/academic/sections/${r.id}`}
                  className={`press flex flex-col rounded-[12px] px-3 py-2 text-footnote hover:bg-fill-strong ${
                    r.status === "archived" ? "bg-fill text-ink-3" : "bg-fill"}`}>
                  <span className="font-semibold">
                    Section {r.code}{r.status === "archived" && " · archived"}
                  </span>
                  <span className="text-ink-2">
                    {r.students} {r.students === 1 ? "student" : "students"} · {r.teachers.join(", ") || "no teacher yet"}
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
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  return (
    <section aria-labelledby="terms-h" className="glass flex flex-col gap-3 rounded-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="terms-h" className="text-headline font-semibold">Terms</h2>
        <button className={quiet} onClick={() => setAdding((a) => !a)}>Add term</button>
      </div>
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
          <p className="text-body font-semibold text-ink-2">Terms, courses, sections and who&apos;s in them</p>
          <h1 className="mt-1 text-large-title font-bold">Courses &amp; sections</h1>
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
          {chosen && <SectionsCard s={s} termId={Number(chosen)} />}
          <CoursesCard s={s} />
          <DepartmentsCard s={s} />
          {s.is_admin && <TermsCard s={s} />}
          {s.is_admin && <AttendanceCard />}
        </>
      )}
    </>
  );
}
