import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChoiceField, FormError, Sheet } from "@/components/form";
import {
  CohortFormSheet,
  Dot,
  LinkRow,
  Panel,
  PersonPickerSheet,
  PickList,
  SheetBody,
  SmallAction,
} from "@/components/manage-academic";
import { StackHeader } from "@/components/StackHeader";
import { Avatar, Button, Chip, Divider, Empty, Failed, Pill, Press, Skeleton, T } from "@/components/ui";
import { ApiError, errorDetail } from "@/lib/api";
import {
  type CohortDetail,
  canManageAcademic,
  plural,
  useCohort,
  useCohortCall,
  useStructure,
  useStructureSave,
} from "@/lib/manage-academic";
import { useMe } from "@/lib/queries";
import { font, radius, useTheme } from "@/theme";

type Role = "" | "cr" | "gr";
const ROLES: { key: Role; label: string }[] = [
  { key: "", label: "Student" },
  { key: "cr", label: "CR" },
  { key: "gr", label: "GR" },
];
type Member = CohortDetail["members"][number];

/** A section (group of students): its CR and GR, its subjects this term, and its students. */
export default function CohortScreen() {
  const params = useLocalSearchParams<{ id: string; term?: string }>();
  const id = Number(params.id);
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const allowed = canManageAcademic(me.data?.roles);
  const structure = useStructure(allowed).data;
  const terms = structure?.terms ?? [];
  const [termPick, setTermPick] = useState<number | null>(params.term ? Number(params.term) : null);
  const termId = termPick ?? (terms.find((t) => t.is_current) ?? terms[0])?.id ?? null;
  const cohort = useCohort(id, termId, allowed);
  const c = cohort.data;
  const call = useCohortCall(id, termId);
  const notFound = cohort.error instanceof ApiError && [403, 404].includes(cohort.error.status);

  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [addingSubject, setAddingSubject] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /** Runs a call; a 409 goes to `onConflict` (asked before replacing or moving). */
  function run(method: string, path: string, body?: unknown, opts: { onConflict?: (m: string) => void; onDone?: () => void; setErr?: (e: string | null) => void } = {}) {
    const setErr = opts.setErr ?? setError;
    setErr(null);
    call.mutate(
      { method, path, body },
      {
        onSuccess: () => opts.onDone?.(),
        onError: (err) => {
          if (opts.onConflict && err instanceof ApiError && err.status === 409) opts.onConflict(errorDetail(err, ""));
          else setErr(errorDetail(err, "Couldn't save. Try again."));
        },
      },
    );
  }

  function setRole(m: Member, role: Role, replace = false) {
    run("PUT", "/reps", { term_id: termId, student_id: m.id, role: role || null, replace }, {
      onDone: () => setMember(null),
      onConflict: role
        ? (message) =>
            Alert.alert(`Make ${m.name} the ${role.toUpperCase()}?`, `${message} Make ${m.name} the ${role.toUpperCase()} instead? Both are told.`, [
              { text: "Keep", style: "cancel" },
              { text: "Replace", onPress: () => setRole(m, role, true) },
            ])
        : undefined,
    });
  }

  function addStudent(personId: number, name: string, move = false) {
    run("POST", "/students", move ? { user_ids: [personId], move: true } : { user_ids: [personId] }, {
      setErr: setPickError,
      onConflict: (message) =>
        Alert.alert(`Move ${name}?`, `${message} Move ${name} to ${c?.code}? They leave that section’s subjects (and its CR/GR) and join this one’s.`, [
          { text: "Cancel", style: "cancel" },
          { text: "Move", onPress: () => addStudent(personId, name, true) },
        ]),
    });
  }

  function remove(m: Member) {
    Alert.alert(`Remove ${m.name}?`, "Removing someone drops them from this section’s current subjects and its CR/GR. Their past work stays.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => run("DELETE", `/students/${m.id}`, undefined, { onDone: () => setMember(null) }) },
    ]);
  }

  async function refresh() {
    setRefreshing(true);
    await cohort.refetch();
    setRefreshing(false);
  }

  const active = c?.members.filter((m) => m.status === "active") ?? [];
  const left = c?.members.filter((m) => m.status === "left") ?? [];

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title={c ? c.label : "Section"} subtitle={c ? `Section · ${plural(c.students, "student")}${c.status === "archived" ? " · archived" : ""}` : undefined} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
        refreshControl={c ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={p.accent} /> : undefined}
      >
        {me.isPending ? (
          <Skeleton height={200} />
        ) : !allowed ? (
          <Empty icon="user" title="This area is for institution admins" body="Department coordinators can use it for their own departments too." />
        ) : notFound ? (
          <Empty icon="people" title="This section isn't one you manage." />
        ) : cohort.isPending ? (
          <>
            <Skeleton height={110} />
            <Skeleton height={140} />
            <Skeleton height={240} />
          </>
        ) : !c ? (
          <Failed onRetry={() => cohort.refetch()} />
        ) : (
          <>
            <View style={{ backgroundColor: p.field, borderRadius: radius.xl, padding: 18, gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ minWidth: 56, height: 56, paddingHorizontal: 10, borderRadius: 16, backgroundColor: p.accent, alignItems: "center", justifyContent: "center" }}>
                  <T style={{ fontFamily: font.bold, fontSize: 15, color: p.onAccent }}>{c.code}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T tone="onField" style={{ fontFamily: font.display, fontSize: 22, lineHeight: 26 }}>
                    {c.label}
                  </T>
                  <T variant="callout" tone="onFieldMuted">
                    Section · {plural(c.students, "student")}
                    {c.status === "archived" ? " · archived" : ""}
                  </T>
                </View>
              </View>
              {c.can_manage ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button label="Edit" variant="field" style={{ flex: 1 }} onPress={() => setEditing(true)} />
                  <Button
                    label={c.status === "active" ? "Archive" : "Restore"}
                    variant="field"
                    style={{ flex: 1 }}
                    disabled={call.isPending}
                    onPress={() =>
                      run("PUT", "", {
                        program_id: c.program_id,
                        code: c.code,
                        name: c.name,
                        shift: c.shift,
                        start_year: c.start_year,
                        end_year: c.end_year,
                        status: c.status === "active" ? "archived" : "active",
                      })
                    }
                  />
                </View>
              ) : null}
            </View>

            {terms.length > 0 ? (
              <View style={{ gap: 6 }}>
                <T variant="calloutStrong" tone="ink2">
                  Term
                </T>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {terms.map((t) => (
                    <Chip key={t.id} label={t.is_current ? `${t.name} · Current` : t.name} on={t.id === termId} onPress={() => setTermPick(t.id)} />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <FormError text={error} />

            <Panel title="CR and GR" detail={c.term ?? "no term"}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["cr", "gr"] as const).map((role) => {
                  const r = c.reps.find((x) => x.role === role);
                  return (
                    <View key={role} style={{ flex: 1, backgroundColor: p.fill, borderRadius: radius.md, padding: 12, gap: 2 }}>
                      <T variant="caption" tone="ink2">
                        {role.toUpperCase()}
                      </T>
                      <T variant="bodyStrong" tone={r ? "ink" : "ink3"}>
                        {r ? r.name : "Not chosen"}
                      </T>
                      {r?.chosen_by ? (
                        <T variant="callout" tone="ink2">
                          Chosen by {r.chosen_by}
                        </T>
                      ) : null}
                    </View>
                  );
                })}
              </View>
              <T variant="callout" tone="ink3">
                They act in every subject this section has in {c.term ?? "the term"}: cancel or shift lectures and take attendance. Each subject’s teacher is told,
                or approves first. Choose them from the students below; a new semester starts with the same ones.
              </T>
            </Panel>

            <Panel title="Subjects" count={c.subject_list.length} detail={c.term ?? "no term"}>
              {c.can_manage && termId ? (
                <Button label="Add subject" icon="plus" variant="secondary" disabled={c.status !== "active"} onPress={() => setAddingSubject(true)} />
              ) : null}
              {c.subject_list.length === 0 ? (
                <T variant="body" tone="ink2">
                  No subjects for this section in {c.term ?? "this term"} yet.
                </T>
              ) : (
                c.subject_list.map((x) => (
                  <LinkRow
                    key={x.id}
                    muted={x.status === "archived"}
                    label={`${x.course_code} ${x.course_title}. Open subject`}
                    onPress={() => router.push({ pathname: "/manage/academic/sections/[id]", params: { id: String(x.id) } })}
                    leading={<Dot color={x.color} />}
                    title={`${x.course_code} · ${x.course_title}`}
                    lines={[`${x.teachers.join(", ") || "No teacher yet"} · ${plural(x.students, "student")}${x.status === "archived" ? " · archived" : ""}`]}
                  />
                ))
              )}
            </Panel>

            <Panel title="Students" count={active.length}>
              {c.can_manage ? (
                <Button
                  label="Add students"
                  icon="plus"
                  variant="secondary"
                  disabled={c.status !== "active"}
                  onPress={() => {
                    setPickError(null);
                    setPicking(true);
                  }}
                />
              ) : null}
              {active.length === 0 ? (
                <T variant="body" tone="ink2">
                  No students yet. Adding one enrolls them in all of this section’s subjects.
                </T>
              ) : (
                <View>
                  {active.map((m, i) => (
                    <View key={m.id}>
                      {i > 0 ? <Divider inset={50} /> : null}
                      <Press
                        accessibilityRole="button"
                        accessibilityLabel={`${m.name}${m.role ? `, ${m.role.toUpperCase()}` : ""}${c.can_manage ? ". Change role or remove" : ""}`}
                        disabled={!c.can_manage}
                        scaleTo={0.99}
                        onPress={() => setMember(m)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}
                      >
                        <Avatar text={m.initials} size={38} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <T variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                              {m.name}
                            </T>
                            {m.role ? <Pill label={m.role.toUpperCase()} tone="accent" /> : null}
                          </View>
                          <T variant="callout" tone="ink2" numberOfLines={1}>
                            {m.email}
                          </T>
                        </View>
                      </Press>
                    </View>
                  ))}
                </View>
              )}
              {left.length > 0 ? <LeftList c={c} left={left} onAddBack={(m) => run("POST", "/students", { user_ids: [m.id] })} busy={call.isPending} /> : null}
              <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
                Removing someone drops them from this section’s current subjects and its CR/GR. Their past work stays.
              </T>
            </Panel>

            {structure ? <CohortFormSheet visible={editing} onClose={() => setEditing(false)} s={structure} cohort={c} /> : null}
            <PersonPickerSheet
              visible={picking}
              onClose={() => setPicking(false)}
              kind="student"
              title="Find students to add to the section"
              exclude={new Set(active.map((m) => m.id))}
              busy={call.isPending}
              error={pickError}
              onPick={(x) => addStudent(x.id, x.name)}
            />
            <Sheet visible={addingSubject} onClose={() => setAddingSubject(false)} title="Add subject">
              {addingSubject && termId ? <AddSubject c={c} termId={termId} students={active.length} onDone={() => setAddingSubject(false)} /> : null}
            </Sheet>
            <Sheet visible={!!member} onClose={() => setMember(null)} title={member?.name ?? ""}>
              {member ? (
                <SheetBody>
                  <T variant="callout" tone="ink2">
                    {member.email}
                  </T>
                  {termId ? (
                    <ChoiceField
                      label={`Role in ${c.term ?? "this term"}`}
                      options={ROLES}
                      value={member.role ?? ""}
                      onChange={(role) => {
                        if (role !== (member.role ?? "")) setRole(member, role);
                      }}
                      hint="The CR and GR act in every subject this section has this term."
                    />
                  ) : null}
                  <FormError text={error} />
                  <Button label="Remove from section" variant="danger" disabled={call.isPending} onPress={() => remove(member)} />
                </SheetBody>
              ) : null}
            </Sheet>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LeftList({ c, left, onAddBack, busy }: { c: CohortDetail; left: Member[]; onAddBack: (m: Member) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <SmallAction label={open ? `Hide who left (${left.length})` : `Left the section (${left.length})`} tone="quiet" onPress={() => setOpen((o) => !o)} />
      {open
        ? left.map((m) => (
            <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
              <View style={{ flex: 1 }}>
                <T variant="body" tone="ink2" numberOfLines={1}>
                  {m.name}
                </T>
                <T variant="callout" tone="ink3" numberOfLines={1}>
                  {m.email}
                </T>
              </View>
              {c.can_manage && c.status === "active" ? <SmallAction label="Add back" disabled={busy} onPress={() => onAddBack(m)} /> : null}
            </View>
          ))
        : null}
    </View>
  );
}

function AddSubject({ c, termId, students, onDone }: { c: CohortDetail; termId: number; students: number; onDone: () => void }) {
  const structure = useStructure().data;
  const save = useStructureSave();
  const [courseId, setCourseId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const taken = new Set(c.subject_list.map((x) => x.course_code));
  const courses = (structure?.courses ?? []).filter((x) => x.is_active && !taken.has(x.code));
  return (
    <SheetBody>
      <PickList
        label="Course"
        value={courseId}
        onChange={setCourseId}
        empty="Every active course is already a subject here."
        options={courses.map((x) => ({ key: x.id, label: x.code, detail: x.title, color: x.color }))}
      />
      <T variant="callout" tone="ink3">
        All {plural(students, "student")} of the section are enrolled in it.
      </T>
      <FormError text={error} />
      <Button
        label="Add subject"
        busy={save.isPending}
        disabled={!courseId}
        onPress={() => {
          setError(null);
          save.mutate(
            { method: "POST", path: "/sections", body: { course_id: courseId, term_id: termId, cohort_id: c.id } },
            { onSuccess: onDone, onError: (err) => setError(errorDetail(err, "Couldn't add the subject.")) },
          );
        }}
      />
    </SheetBody>
  );
}
