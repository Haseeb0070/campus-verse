import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tileLabel } from "@/components/conversations";
import { FormError } from "@/components/form";
import { Panel, PersonPickerSheet, PickList, SmallAction } from "@/components/manage-academic";
import { StackHeader } from "@/components/StackHeader";
import { Avatar, Button, Card, Divider, Empty, Failed, Field, Pill, Skeleton, T } from "@/components/ui";
import { ApiError, errorDetail } from "@/lib/api";
import { canManageAcademic, plural, useSectionCall, useSectionDetail, useStructure } from "@/lib/manage-academic";
import { useMe } from "@/lib/queries";
import { font, radius, useTheme } from "@/theme";

const STATUS = {
  active: { label: "Enrolled", tone: "success" },
  dropped: { label: "Dropped", tone: "neutral" },
  completed: { label: "Completed", tone: "accent" },
} as const;

/** A subject (a course taught to a section in a term): its teachers and its students. */
export default function SubjectScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const allowed = canManageAcademic(me.data?.roles);
  const section = useSectionDetail(id, allowed);
  const programs = useStructure(allowed).data?.programs ?? [];
  const call = useSectionCall(id);
  const [picking, setPicking] = useState<"teacher" | "student" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const s = section.data;
  const notFound = section.error instanceof ApiError && [403, 404].includes(section.error.status);

  function run(method: string, path: string, body?: unknown, opts: { onDone?: () => void; setErr?: (e: string | null) => void } = {}) {
    const setErr = opts.setErr ?? setError;
    setErr(null);
    call.mutate(
      { method, path, body },
      { onSuccess: () => opts.onDone?.(), onError: (err) => setErr(errorDetail(err, "Couldn't save. Try again.")) },
    );
  }

  async function refresh() {
    setRefreshing(true);
    await section.refetch();
    setRefreshing(false);
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title={s ? `${s.course_code} · ${s.code}` : "Subject"} subtitle={s ? `${s.course_title} · ${s.term}` : undefined} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
        refreshControl={s ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={p.accent} /> : undefined}
      >
        {me.isPending ? (
          <Skeleton height={200} />
        ) : !allowed ? (
          <Empty icon="user" title="This area is for institution admins" body="Department coordinators can use it for their own departments too." />
        ) : notFound ? (
          <Empty icon="clipboard" title="This subject isn't one you manage." />
        ) : section.isPending ? (
          <>
            <Skeleton height={110} />
            <Skeleton height={140} />
            <Skeleton height={240} />
          </>
        ) : !s ? (
          <Failed onRetry={() => section.refetch()} />
        ) : (
          <>
            <View style={{ backgroundColor: p.field, borderRadius: radius.xl, padding: 18, gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Avatar text={tileLabel(s.course_code)} color={s.color} size={56} />
                <View style={{ flex: 1 }}>
                  <T tone="onField" style={{ fontFamily: font.display, fontSize: 22, lineHeight: 26 }}>
                    {s.course_code} · {s.code}
                  </T>
                  <T variant="callout" tone="onFieldMuted">
                    {s.course_title} · {s.term}
                    {s.status === "archived" ? " · archived" : ""}
                  </T>
                </View>
              </View>
              <Button
                label={s.status === "active" ? "Archive subject" : "Restore subject"}
                variant="field"
                disabled={call.isPending}
                onPress={() => run("PATCH", "", { status: s.status === "active" ? "archived" : "active" })}
              />
            </View>

            <FormError text={error} />

            {s.cohort_id ? (
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <T variant="calloutStrong" tone="ink2">
                    Taught to section
                  </T>
                  <T variant="bodyStrong">
                    {s.code} · {s.cohort}
                  </T>
                </View>
                <SmallAction
                  label="Open section"
                  onPress={() => router.push({ pathname: "/manage/academic/cohorts/[id]", params: { id: String(s.cohort_id) } })}
                />
              </Card>
            ) : (
              <Card style={{ gap: 12 }}>
                <Field label="Code" value={code ?? s.code} onChangeText={setCode} maxLength={16} autoCapitalize="characters" />
                {code !== null && code.trim() !== s.code ? (
                  <Button label="Save code" busy={call.isPending} onPress={() => run("PATCH", "", { code }, { onDone: () => setCode(null) })} />
                ) : null}
                <PickList
                  label="Program"
                  value={s.program_id ?? 0}
                  onChange={(v) => run("PATCH", "", v ? { program_id: v } : { clear_program: true })}
                  options={[{ key: 0, label: "None" }, ...programs.map((x) => ({ key: x.id, label: x.name, detail: x.code }))]}
                />
                <T variant="callout" tone="ink3">
                  This subject isn’t linked to a section, so its students are enrolled one by one.
                </T>
              </Card>
            )}

            <Panel title="Teachers" count={s.teacher_list.length}>
              <Button
                label="Add teacher"
                icon="plus"
                variant="secondary"
                onPress={() => {
                  setPickError(null);
                  setPicking("teacher");
                }}
              />
              {s.teacher_list.length === 0 ? (
                <T variant="body" tone="ink2">
                  No teacher yet. Students can’t get notices or work in this subject until there is one.
                </T>
              ) : (
                <View>
                  {s.teacher_list.map((t, i) => (
                    <View key={t.id}>
                      {i > 0 ? <Divider inset={50} /> : null}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}>
                        <Avatar text={t.initials} color={s.color} size={38} />
                        <View style={{ flex: 1 }}>
                          <T variant="bodyStrong" numberOfLines={1}>
                            {t.name}
                          </T>
                          <T variant="callout" tone="ink2" numberOfLines={1}>
                            {t.role === "lead" ? "Lead" : "Assistant"} · {t.email}
                          </T>
                        </View>
                        <SmallAction
                          label="Remove"
                          tone="danger"
                          disabled={call.isPending}
                          onPress={() =>
                            Alert.alert(`Remove ${t.name}?`, "They stop teaching this subject.", [
                              { text: "Cancel", style: "cancel" },
                              { text: "Remove", style: "destructive", onPress: () => run("DELETE", `/teachers/${t.id}`) },
                            ])
                          }
                        />
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Panel>

            <Panel title="Students" count={s.students}>
              <Button
                label="Enroll students"
                icon="plus"
                variant="secondary"
                disabled={s.status !== "active"}
                onPress={() => {
                  setPickError(null);
                  setPicking("student");
                }}
              />
              {s.student_list.length === 0 ? (
                <T variant="body" tone="ink2">
                  Nobody is enrolled yet.
                </T>
              ) : (
                <View>
                  {s.student_list.map((st, i) => (
                    <View key={st.id}>
                      {i > 0 ? <Divider inset={50} /> : null}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}>
                        <Avatar text={st.initials} size={38} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <T variant="bodyStrong" tone={st.status === "active" ? "ink" : "ink2"} numberOfLines={1}>
                            {st.name}
                          </T>
                          <T variant="callout" tone="ink2" numberOfLines={1}>
                            {st.email}
                          </T>
                          <Pill label={STATUS[st.status].label} tone={STATUS[st.status].tone} />
                        </View>
                        <SmallAction
                          label={st.status === "active" ? "Drop" : "Re-enroll"}
                          tone="quiet"
                          disabled={call.isPending}
                          onPress={() => run("PATCH", `/students/${st.id}`, { status: st.status === "active" ? "dropped" : "active" })}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              )}
              <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
                {s.cohort_id
                  ? "Everyone in the section is enrolled here. Drop someone who doesn't take this subject, or enroll someone from outside the section (a repeater, an elective). Dropping keeps their past work."
                  : "Dropping keeps the record and their past work; they just lose access."}
              </T>
            </Panel>

            <PersonPickerSheet
              visible={picking !== null}
              onClose={() => setPicking(null)}
              kind={picking ?? "student"}
              title={picking === "teacher" ? "Find a teacher" : "Find students to enroll"}
              exclude={
                new Set(picking === "teacher" ? s.teacher_list.map((t) => t.id) : s.student_list.filter((x) => x.status === "active").map((x) => x.id))
              }
              busy={call.isPending}
              error={pickError}
              onPick={(x) =>
                picking === "teacher"
                  ? run("POST", "/teachers", { user_id: x.id }, { setErr: setPickError, onDone: () => setPicking(null) })
                  : run("POST", "/students", { user_ids: [x.id] }, { setErr: setPickError })
              }
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
