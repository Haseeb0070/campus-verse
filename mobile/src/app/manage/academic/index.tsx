import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DateTimeField, FormError, Sheet, SwitchRow } from "@/components/form";
import {
  CohortFormSheet,
  ColorPicker,
  Dot,
  LinkRow,
  Panel,
  PickList,
  SheetBody,
  SmallAction,
} from "@/components/manage-academic";
import { StackHeader } from "@/components/StackHeader";
import { Button, Chip, Divider, Empty, Failed, Field, Pill, Segmented, Skeleton, T } from "@/components/ui";
import { ApiError, errorDetail } from "@/lib/api";
import {
  type CourseRow,
  type Structure,
  canManageAcademic,
  isoDay,
  plural,
  useAttendanceSettings,
  useCohorts,
  useNextSemester,
  useSections,
  useStructure,
  useStructureSave,
} from "@/lib/manage-academic";
import { useMe } from "@/lib/queries";
import type { CourseColor } from "@/lib/types";
import { radius, useTheme } from "@/theme";

type Tab = "sections" | "subjects" | "courses" | "setup";

/** Manage → Sections & subjects: terms, sections, subjects and who's in them. */
export default function AcademicScreen() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const allowed = canManageAcademic(me.data?.roles);
  const structure = useStructure(allowed);
  const s = structure.data;
  const [termPick, setTermPick] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("sections");
  const [refreshing, setRefreshing] = useState(false);
  const current = s?.terms.find((t) => t.is_current) ?? s?.terms[0];
  const termId = termPick ?? current?.id ?? null;
  const term = s?.terms.find((t) => t.id === termId);
  const refused = structure.error instanceof ApiError && [403, 404].includes(structure.error.status);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([structure.refetch(), me.refetch()]);
    setRefreshing(false);
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Sections & subjects" subtitle="Terms, sections, subjects and who's in them" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
        refreshControl={allowed ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={p.accent} /> : undefined}
      >
        {me.isPending ? (
          <Skeleton height={200} />
        ) : !allowed ? (
          <Empty icon="user" title="This area is for institution admins" body="Department coordinators can use it for their own departments too." />
        ) : structure.isPending ? (
          <>
            <Skeleton height={44} />
            <Skeleton height={180} />
            <Skeleton height={180} />
          </>
        ) : refused ? (
          <Empty icon="user" title="You can't manage courses." />
        ) : !s ? (
          <Failed onRetry={() => structure.refetch()} />
        ) : (
          <>
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { key: "sections", label: "Sections" },
                { key: "subjects", label: "Subjects" },
                { key: "courses", label: "Courses" },
                { key: "setup", label: "Setup" },
              ]}
            />
            {(tab === "sections" || tab === "subjects") && s.terms.length > 0 ? (
              <View style={{ gap: 6 }}>
                <T variant="calloutStrong" tone="ink2">
                  Term
                </T>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {s.terms.map((t) => (
                    <Chip key={t.id} label={t.is_current ? `${t.name} · Current` : t.name} on={t.id === termId} onPress={() => setTermPick(t.id)} />
                  ))}
                </ScrollView>
              </View>
            ) : null}
            {tab === "sections" ? (
              termId ? <CohortsPanel s={s} termId={termId} /> : <NoTerm admin={s.is_admin} onSetup={() => setTab("setup")} />
            ) : tab === "subjects" ? (
              termId ? <SubjectsPanel s={s} termId={termId} termName={term?.name} /> : <NoTerm admin={s.is_admin} onSetup={() => setTab("setup")} />
            ) : tab === "courses" ? (
              <CoursesPanel s={s} />
            ) : (
              <>
                <DepartmentsPanel s={s} />
                {s.is_admin ? <TermsPanel s={s} /> : null}
                {s.is_admin ? <AttendancePanel /> : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function NoTerm({ admin, onSetup }: { admin: boolean; onSetup: () => void }) {
  return (
    <Empty
      icon="calendar"
      title="No terms yet"
      body={admin ? "Add a term under Setup first." : "An institution admin adds the terms."}
      action={admin ? <Button label="Go to Setup" variant="secondary" onPress={onSetup} /> : undefined}
    />
  );
}

// Sections (groups of students) ------------------------------------------------------------

function CohortsPanel({ s, termId }: { s: Structure; termId: number }) {
  const [status, setStatus] = useState<"active" | "archived">("active");
  const cohorts = useCohorts(termId, status);
  const [adding, setAdding] = useState(false);
  const rows = cohorts.data ?? [];
  return (
    <Panel
      title="Sections"
      count={cohorts.data ? rows.length : undefined}
      detail="A group of students, such as BS CS 2024–2028 Morning A. Its students are in all its subjects, and its CR and GR act in every one."
    >
      <Button label="Add section" icon="plus" variant="secondary" onPress={() => setAdding(true)} />
      <Segmented
        value={status}
        onChange={setStatus}
        options={[
          { key: "active", label: "Active" },
          { key: "archived", label: "Archived" },
        ]}
      />
      {cohorts.isPending ? (
        <Skeleton height={72} />
      ) : cohorts.isError ? (
        <Failed onRetry={() => cohorts.refetch()} />
      ) : rows.length === 0 ? (
        <T variant="body" tone="ink2">
          {status === "archived" ? "No archived sections." : "No sections yet. Add one for each group of students."}
        </T>
      ) : (
        rows.map((c) => (
          <LinkRow
            key={c.id}
            label={`${c.code}, ${c.label}. Open section`}
            onPress={() => router.push({ pathname: "/manage/academic/cohorts/[id]", params: { id: String(c.id), term: String(termId) } })}
            title={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pill label={c.code} tone="accent" />
                <T variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                  {c.label}
                </T>
              </View>
            }
            lines={[
              `${plural(c.students, "student")} · ${plural(c.subjects, "subject")} this term`,
              `CR ${c.cr ?? "not chosen"} · GR ${c.gr ?? "not chosen"}`,
            ]}
          />
        ))
      )}
      <CohortFormSheet visible={adding} onClose={() => setAdding(false)} s={s} />
    </Panel>
  );
}

// Subjects ----------------------------------------------------------------------------------

function SubjectsPanel({ s, termId, termName }: { s: Structure; termId: number; termName?: string }) {
  const subjects = useSections(termId);
  const [adding, setAdding] = useState(false);
  const rows = subjects.data ?? [];
  // Grouped by section, so each section's whole term is in one place.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.cohort ? `${r.code} · ${r.cohort}` : `${r.code} (no section)`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return (
    <Panel title="Subjects" count={subjects.data ? rows.length : undefined} detail="A course taught to one section this term, with its teachers.">
      <Button label="Add subject" icon="plus" variant="secondary" onPress={() => setAdding(true)} />
      {subjects.isPending ? (
        <Skeleton height={72} />
      ) : subjects.isError ? (
        <Failed onRetry={() => subjects.refetch()} />
      ) : rows.length === 0 ? (
        <T variant="body" tone="ink2">
          No subjects in this term yet.
        </T>
      ) : (
        [...groups.entries()].map(([group, list]) => (
          <View key={group} style={{ gap: 6 }}>
            <T variant="calloutStrong" tone="ink2" style={{ marginTop: 4 }}>
              {group}
            </T>
            {list.map((r) => (
              <LinkRow
                key={r.id}
                muted={r.status === "archived"}
                label={`${r.course_code} ${r.course_title}. Open subject`}
                onPress={() => router.push({ pathname: "/manage/academic/sections/[id]", params: { id: String(r.id) } })}
                leading={<Dot color={r.color} />}
                title={`${r.course_code}${r.status === "archived" ? " · archived" : ""}`}
                lines={[`${r.course_title} · ${r.teachers.join(", ") || "no teacher yet"}`]}
              />
            ))}
          </View>
        ))
      )}
      <Sheet visible={adding} onClose={() => setAdding(false)} title={termName ? `Add subject · ${termName}` : "Add subject"}>
        {adding ? <AddSubject s={s} termId={termId} onDone={() => setAdding(false)} /> : null}
      </Sheet>
    </Panel>
  );
}

function AddSubject({ s, termId, onDone }: { s: Structure; termId: number; onDone: () => void }) {
  const cohorts = useCohorts(termId);
  const save = useStructureSave();
  const [courseId, setCourseId] = useState<number | null>(null);
  const [cohortId, setCohortId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetBody>
      <PickList
        label="Course"
        value={courseId}
        onChange={setCourseId}
        empty="No courses yet. Add one under Courses."
        options={s.courses.filter((c) => c.is_active).map((c) => ({ key: c.id, label: c.code, detail: c.title, color: c.color }))}
      />
      {cohorts.isPending ? (
        <Skeleton height={56} />
      ) : (
        <PickList
          label="Section"
          value={cohortId}
          onChange={setCohortId}
          empty="No sections yet. Add one under Sections."
          options={(cohorts.data ?? []).map((c) => ({ key: c.id, label: c.code, detail: c.label }))}
        />
      )}
      <T variant="callout" tone="ink3">
        Everyone in the section is enrolled in the new subject.
      </T>
      <FormError text={error} />
      <Button
        label="Add subject"
        busy={save.isPending}
        disabled={!courseId || !cohortId}
        onPress={() => {
          setError(null);
          save.mutate(
            { method: "POST", path: "/sections", body: { course_id: courseId, term_id: termId, cohort_id: cohortId } },
            { onSuccess: onDone, onError: (err) => setError(errorDetail(err, "Couldn't save. Try again.")) },
          );
        }}
      />
    </SheetBody>
  );
}

// Courses -----------------------------------------------------------------------------------

function CoursesPanel({ s }: { s: Structure }) {
  const [editing, setEditing] = useState<CourseRow | "new" | null>(null);
  const save = useStructureSave();
  const [error, setError] = useState<string | null>(null);

  function toggle(c: CourseRow) {
    setError(null);
    save.mutate(
      {
        method: "PUT",
        path: `/courses/${c.id}`,
        body: {
          department_id: c.department_id,
          code: c.code,
          title: c.title,
          color: c.color,
          credit_hours: c.credit_hours,
          is_active: !c.is_active,
        },
      },
      { onError: (err) => setError(errorDetail(err, "Couldn't save. Try again.")) },
    );
  }

  return (
    <Panel title="Courses" count={s.courses.length}>
      <Button label="Add course" icon="plus" variant="secondary" onPress={() => setEditing("new")} />
      <FormError text={error} />
      {s.courses.length === 0 ? (
        <T variant="body" tone="ink2">
          No courses yet.
        </T>
      ) : (
        s.courses.map((c, i) => (
          <View key={c.id}>
            {i > 0 ? <Divider inset={22} /> : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
              <Dot color={c.color} />
              <View style={{ flex: 1, opacity: c.is_active ? 1 : 0.6 }}>
                <T variant="bodyStrong" numberOfLines={2}>
                  {c.code} · {c.title}
                </T>
                <T variant="callout" tone="ink2">
                  {c.department} · {c.credit_hours} credit hours{c.is_active ? "" : " · archived"}
                </T>
              </View>
              <View style={{ gap: 6, alignItems: "flex-end" }}>
                <SmallAction label="Edit" onPress={() => setEditing(c)} />
                <SmallAction label={c.is_active ? "Archive" : "Restore"} tone="quiet" disabled={save.isPending} onPress={() => toggle(c)} />
              </View>
            </View>
          </View>
        ))
      )}
      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing && editing !== "new" ? `Edit ${editing.code}` : "Add course"}>
        {editing ? <CourseForm s={s} course={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} /> : null}
      </Sheet>
    </Panel>
  );
}

function CourseForm({ s, course, onDone }: { s: Structure; course?: CourseRow; onDone: () => void }) {
  const save = useStructureSave();
  const [dept, setDept] = useState<number | null>(course?.department_id ?? s.departments[0]?.id ?? null);
  const [code, setCode] = useState(course?.code ?? "");
  const [title, setTitle] = useState(course?.title ?? "");
  const [color, setColor] = useState<CourseColor>(course?.color ?? "sky");
  const [credits, setCredits] = useState(String(course?.credit_hours ?? 3));
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetBody>
      <PickList
        label="Department"
        value={dept}
        onChange={setDept}
        options={s.departments.map((d) => ({ key: d.id, label: d.code, detail: d.name }))}
      />
      <Field label="Code" value={code} onChangeText={setCode} maxLength={32} placeholder="CS-410" autoCapitalize="characters" />
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={200} placeholder="Compilers" />
      <Field label="Credits" value={credits} onChangeText={(v) => setCredits(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={2} />
      <T variant="calloutStrong" tone="ink2">
        Colour, used everywhere this course appears
      </T>
      <ColorPicker value={color} onChange={setColor} colors={s.colors} />
      <FormError text={error} />
      <Button
        label={course ? "Save" : "Add course"}
        busy={save.isPending}
        disabled={!dept}
        onPress={() => {
          setError(null);
          save.mutate(
            {
              method: course ? "PUT" : "POST",
              path: course ? `/courses/${course.id}` : "/courses",
              body: { department_id: dept, code, title, color, credit_hours: Number(credits) || 0 },
            },
            { onSuccess: onDone, onError: (err) => setError(errorDetail(err, "Couldn't save. Try again.")) },
          );
        }}
      />
    </SheetBody>
  );
}

// Departments and programs --------------------------------------------------------------------

function DepartmentsPanel({ s }: { s: Structure }) {
  const [adding, setAdding] = useState<"dept" | "program" | null>(null);
  return (
    <Panel title="Departments and programs">
      <View style={{ flexDirection: "row", gap: 8 }}>
        {s.is_admin ? <Button label="Add department" variant="secondary" style={{ flex: 1 }} onPress={() => setAdding("dept")} /> : null}
        <Button label="Add program" variant="secondary" style={{ flex: 1 }} onPress={() => setAdding("program")} />
      </View>
      {s.departments.map((d, i) => (
        <View key={d.id} style={{ gap: 2 }}>
          {i > 0 ? <Divider /> : null}
          <T variant="bodyStrong" style={{ marginTop: i > 0 ? 10 : 0 }}>
            {d.name}{" "}
            <T variant="body" tone="ink2">
              {d.code} · {plural(d.courses, "course")}
            </T>
          </T>
          <T variant="callout" tone="ink2">
            {s.programs.filter((x) => x.department_id === d.id).map((x) => x.name).join(", ") || "No programs yet"}
          </T>
        </View>
      ))}
      <Sheet visible={adding !== null} onClose={() => setAdding(null)} title={adding === "dept" ? "Add department" : "Add program"}>
        {adding === "dept" ? <DepartmentForm onDone={() => setAdding(null)} /> : adding === "program" ? <ProgramForm s={s} onDone={() => setAdding(null)} /> : null}
      </Sheet>
    </Panel>
  );
}

function DepartmentForm({ onDone }: { onDone: () => void }) {
  const save = useStructureSave();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetBody>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Mathematics" />
      <Field label="Code" value={code} onChangeText={setCode} maxLength={32} placeholder="MATH" autoCapitalize="characters" />
      <FormError text={error} />
      <Button
        label="Add department"
        busy={save.isPending}
        onPress={() => {
          setError(null);
          save.mutate(
            { method: "POST", path: "/departments", body: { name, code } },
            { onSuccess: onDone, onError: (err) => setError(errorDetail(err, "Couldn't save. Try again.")) },
          );
        }}
      />
    </SheetBody>
  );
}

function ProgramForm({ s, onDone }: { s: Structure; onDone: () => void }) {
  const save = useStructureSave();
  const [dept, setDept] = useState<number | null>(s.departments[0]?.id ?? null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetBody>
      <PickList label="Department" value={dept} onChange={setDept} options={s.departments.map((d) => ({ key: d.id, label: d.code, detail: d.name }))} />
      <Field label="Name" value={name} onChangeText={setName} placeholder="BS Mathematics" />
      <Field label="Code" value={code} onChangeText={setCode} maxLength={32} placeholder="BSM" autoCapitalize="characters" />
      <FormError text={error} />
      <Button
        label="Add program"
        busy={save.isPending}
        disabled={!dept}
        onPress={() => {
          setError(null);
          save.mutate(
            { method: "POST", path: "/programs", body: { department_id: dept, name, code } },
            { onSuccess: onDone, onError: (err) => setError(errorDetail(err, "Couldn't save. Try again.")) },
          );
        }}
      />
    </SheetBody>
  );
}

// Terms (admins) -----------------------------------------------------------------------------

function TermsPanel({ s }: { s: Structure }) {
  const p = useTheme();
  const save = useStructureSave();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [rolling, setRolling] = useState(false);
  const current = s.terms.find((t) => t.is_current);

  function act(path: string) {
    setError(null);
    save.mutate({ method: "POST", path, body: {} }, { onError: (err) => setError(errorDetail(err, "Couldn't save. Try again.")) });
  }

  return (
    <Panel title="Terms">
      {current ? <Button label="Start next semester" onPress={() => setRolling(true)} /> : null}
      <Button label="Add term" icon="plus" variant="secondary" onPress={() => setAdding(true)} />
      <FormError text={error} />
      {s.terms.length === 0 ? (
        <T variant="body" tone="ink2">
          No terms yet.
        </T>
      ) : null}
      {s.terms.map((t) => (
        <View key={t.id} style={{ backgroundColor: p.fill, borderRadius: radius.md, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong">
                {t.name}{" "}
                <T variant="body" tone="ink2">
                  {t.code}
                </T>
              </T>
              <T variant="callout" tone="ink2">
                {t.starts_on} to {t.ends_on}
              </T>
            </View>
            {t.is_current ? <Pill label="Current" tone="success" /> : null}
          </View>
          {!t.is_current ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {current && t.starts_on > current.starts_on ? (
                <SmallAction label={`Carry students from ${current.name}`} disabled={save.isPending} onPress={() => act(`/terms/${t.id}/carry-from/${current.id}`)} />
              ) : null}
              <SmallAction label="Make current" disabled={save.isPending} onPress={() => act(`/terms/${t.id}/current`)} />
            </View>
          ) : null}
        </View>
      ))}
      {current && s.terms.some((t) => !t.is_current && t.starts_on > current.starts_on) ? (
        <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
          Carrying students: each section’s students join its subjects in that term.
        </T>
      ) : null}
      <Sheet visible={adding} onClose={() => setAdding(false)} title="Add term">
        {adding ? <TermForm onDone={() => setAdding(false)} /> : null}
      </Sheet>
      <Sheet visible={rolling} onClose={() => setRolling(false)} title="Start next semester">
        {rolling && current ? <NextSemester currentId={current.id} currentName={current.name} onDone={() => setRolling(false)} /> : null}
      </Sheet>
    </Panel>
  );
}

const in120Days = () => {
  const d = new Date();
  d.setDate(d.getDate() + 120);
  return d;
};

function TermForm({ onDone }: { onDone: () => void }) {
  const save = useStructureSave();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [start, setStart] = useState(() => new Date());
  const [end, setEnd] = useState(in120Days);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetBody>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Spring 2027" />
      <Field label="Code" value={code} onChangeText={setCode} maxLength={32} placeholder="S27" autoCapitalize="characters" />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <DateTimeField label="Starts" value={start} onChange={setStart} withTime={false} />
        <DateTimeField label="Ends" value={end} onChange={setEnd} withTime={false} minDate={start} />
      </View>
      <FormError text={error} />
      <Button
        label="Add term"
        busy={save.isPending}
        onPress={() => {
          setError(null);
          save.mutate(
            { method: "POST", path: "/terms", body: { name, code, starts_on: isoDay(start), ends_on: isoDay(end) } },
            { onSuccess: onDone, onError: (err) => setError(errorDetail(err, "Couldn't save. Try again.")) },
          );
        }}
      />
    </SheetBody>
  );
}

/** Starts the semester after the current one: a new term, the classes carried over, and
 *  (optionally) the subjects and teachers copied when they repeat. */
function NextSemester({ currentId, currentName, onDone }: { currentId: number; currentName: string; onDone: () => void }) {
  const p = useTheme();
  const next = useNextSemester(currentId);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [start, setStart] = useState(() => new Date());
  const [end, setEnd] = useState(in120Days);
  const [copySections, setCopySections] = useState(false);
  const [copyTeachers, setCopyTeachers] = useState(false);
  const [carry, setCarry] = useState(true);
  const [closeOld, setCloseOld] = useState(true);
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function go() {
    setError(null);
    next.mutate(
      {
        name,
        code,
        starts_on: isoDay(start),
        ends_on: isoDay(end),
        copy_sections: copySections,
        copy_teachers: copySections && copyTeachers,
        carry_students: carry,
        close_old: closeOld,
        make_current: makeCurrent,
      },
      {
        onSuccess: (r) =>
          setDone(
            [
              r.sections_copied && `${r.sections_copied} subjects copied`,
              r.teachers_copied && `${r.teachers_copied} teachers kept`,
              `${r.students_carried} enrollments carried over`,
              r.sections_closed && `${r.sections_closed} old subjects closed`,
            ]
              .filter(Boolean)
              .join(", ") + ".",
          ),
        onError: (err) => setError(errorDetail(err, "Couldn't start the semester. Try again.")),
      },
    );
  }

  if (done) {
    return (
      <SheetBody>
        <View style={{ backgroundColor: p.fill, borderRadius: radius.md, padding: 14, gap: 6 }}>
          <T variant="headline">{name} has started.</T>
          <T variant="body">{done}</T>
          {!copySections ? (
            <T variant="callout" tone="ink2">
              Next: add the new semester’s subjects for each section (or import the timetable), then use “Carry students” on the new term so each section’s students join them.
            </T>
          ) : null}
        </View>
        <Button label="Done" variant="secondary" onPress={onDone} />
      </SheetBody>
    );
  }

  return (
    <SheetBody>
      <T variant="callout" tone="ink2">
        Follows {currentName}.
      </T>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Spring 2027" />
      <Field label="Code" value={code} onChangeText={setCode} maxLength={32} placeholder="S27" autoCapitalize="characters" />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <DateTimeField label="Starts" value={start} onChange={setStart} withTime={false} />
        <DateTimeField label="Ends" value={end} onChange={setEnd} withTime={false} minDate={start} />
      </View>
      <SwitchRow label="Carry the students over" detail="Each section's students join its new-term subjects, and its CR and GR carry on." value={carry} onChange={setCarry} />
      <SwitchRow label="Copy the subjects" detail="Only when the same subjects run again. Otherwise import the new timetable afterwards." value={copySections} onChange={setCopySections} />
      <View style={{ opacity: copySections ? 1 : 0.5 }} pointerEvents={copySections ? "auto" : "none"}>
        <SwitchRow label="Keep the same teachers on copied subjects" detail="Each copied subject keeps its teachers." value={copySections && copyTeachers} onChange={setCopyTeachers} />
      </View>
      <SwitchRow label={`Close ${currentName}`} detail="Its subjects are archived and enrollments marked completed. Nothing is deleted." value={closeOld} onChange={setCloseOld} />
      <SwitchRow label="Make it the current semester" detail="Timetables and Today switch to the new term." value={makeCurrent} onChange={setMakeCurrent} />
      <FormError text={error} />
      <Button label="Start semester" busy={next.isPending} disabled={!name.trim() || !code.trim()} onPress={go} />
    </SheetBody>
  );
}

// Attendance (admins) ----------------------------------------------------------------------

function AttendancePanel() {
  const institution = useMe().data?.institution;
  const settings = useAttendanceSettings();
  const [error, setError] = useState<string | null>(null);
  if (!institution) return null;

  function set(enabled: boolean, visible: boolean) {
    setError(null);
    settings.mutate(
      { attendance_enabled: enabled, attendance_visible_to_students: visible },
      { onError: (err) => setError(errorDetail(err, "Couldn't save. Try again.")) },
    );
  }

  return (
    <Panel title="Attendance">
      <SwitchRow
        label="Teachers record attendance"
        detail="Switch on only if your institution has approved it. Corrections after 48 hours need a coordinator or admin."
        value={institution.attendance_enabled}
        onChange={(on) => set(on, institution.attendance_visible_to_students)}
      />
      <View style={{ opacity: institution.attendance_enabled ? 1 : 0.5 }} pointerEvents={institution.attendance_enabled ? "auto" : "none"}>
        <SwitchRow
          label="Students see their own attendance"
          detail="On their Progress page, labelled as recorded by teachers."
          value={institution.attendance_visible_to_students}
          onChange={(on) => set(true, on)}
        />
      </View>
      <FormError text={error} />
    </Panel>
  );
}
