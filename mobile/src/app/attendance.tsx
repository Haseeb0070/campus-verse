import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DownloadRow } from "@/components/files";
import { ChoiceField, DateTimeField } from "@/components/form";
import { StackHeader } from "@/components/StackHeader";
import { Avatar, Button, Card, Empty, Failed, Field, Skeleton, T } from "@/components/ui";
import { errorDetail } from "@/lib/api";
import { dayToDate, isoDay, matchStudents, useReport } from "@/lib/attendance";
import { useTeaching } from "@/lib/coursework";
import { formatDateTime, formatDay, formatTime, todayIn } from "@/lib/format";
import { useMe, useTimetable } from "@/lib/queries";
import { useRepsMine } from "@/lib/reps";
import { type Mark, type SheetRow, useSaveSheet, useSheet } from "@/lib/teaching";
import { font, radius, useTheme } from "@/theme";

const MARKS: { key: Mark; short: string; label: string }[] = [
  { key: "present", short: "P", label: "Present" },
  { key: "late", short: "L", label: "Late" },
  { key: "absent", short: "A", label: "Absent" },
  { key: "excused", short: "E", label: "Excused" },
];

/** "Extra class": a register for a class that isn't on the timetable. */
const EXTRA = 0;

/**
 * Take a class's attendance: pick the subject, day and class (or arrive from a class with them
 * set), everyone starts present, tap anyone who isn't, then save. Teachers also see the term
 * summary for the subject. A CR or GR takes attendance for their own class's subjects.
 */
export default function Attendance() {
  const params = useLocalSearchParams<{ section?: string; date?: string; meeting?: string }>();
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const today = todayIn(tz);
  const student = me?.kind === "student";
  const teaching = useTeaching(!!me && !student);
  const reps = useRepsMine(student).data;
  const sections = student
    ? (me?.sections ?? [])
        .filter((s) => reps?.sections[String(s.id)])
        .map((s) => ({ id: s.id, course_code: s.course_code, code: s.code }))
    : (teaching.data ?? []).map((s) => ({ id: s.id, course_code: s.course_code, code: s.code }));

  const [picked, setPicked] = useState<number | null>(params.section ? Number(params.section) : null);
  const sectionId = picked ?? sections[0]?.id ?? null;
  const [day, setDay] = useState(params.date || today);
  // undefined: the subject's first class that day; EXTRA: a class not on the timetable.
  const [meetingPick, setMeetingPick] = useState<number | undefined>(params.meeting ? Number(params.meeting) : undefined);
  const classes = useTimetable(day, 1);
  const sectionClasses = (classes.data ?? []).filter(
    (o) => o.section_id === sectionId && o.date === day && o.status !== "cancelled" && o.status !== "moved",
  );
  const meetingId = meetingPick !== undefined ? meetingPick : (sectionClasses[0]?.meeting_id ?? EXTRA);
  const [showReport, setShowReport] = useState(false);
  useEffect(() => setShowReport(false), [sectionId]);

  const ready = sectionId !== null && (meetingPick !== undefined || !classes.isPending);
  const sheet = useSheet(sectionId ?? 0, day, meetingId || undefined, ready);
  const save = useSaveSheet(sectionId ?? 0);
  // Your taps, over what's saved (or everyone present on a new sheet).
  const [edits, setEdits] = useState<Record<number, Mark>>({});
  const [saved, setSaved] = useState(false);
  // A register that's already taken opens read-only; Change unlocks it.
  const [changing, setChanging] = useState(false);
  useEffect(() => {
    setEdits({});
    setSaved(false);
    setChanging(false);
  }, [sectionId, day, meetingId]);

  const s = sheet.data;
  const marks: Record<number, Mark> = Object.fromEntries(
    (s?.marks ?? []).map((m) => [m.student_id, edits[m.student_id] ?? m.status ?? "present"]),
  );
  const readOnly = !!s && s.locked && !s.can_correct;
  const blocked = !!s && !s.saved && !!s.taken_elsewhere;
  const frozen = readOnly || blocked || (!!s && s.saved && !changing);
  const counts = MARKS.map((m) => ({ ...m, n: Object.values(marks).filter((v) => v === m.key).length }));

  function set(id: number, mark: Mark) {
    setSaved(false);
    setEdits((all) => ({ ...all, [id]: mark }));
  }

  /** Quick marking: the matched students get `mark`; with `restTo`, everyone else gets that. */
  function applyMany(ids: number[], mark: Mark, restTo?: Mark) {
    if (!s) return;
    setSaved(false);
    setEdits((all) => {
      const next = restTo ? Object.fromEntries(s.marks.map((m) => [m.student_id, restTo])) : { ...all };
      for (const id of ids) next[id] = mark;
      return next;
    });
  }

  function everyonePresent() {
    if (!s) return;
    setSaved(false);
    setEdits(Object.fromEntries(s.marks.map((m) => [m.student_id, "present" as Mark])));
  }

  function submit() {
    if (!s) return;
    save.mutate(
      {
        date: s.date,
        meeting_id: s.meeting_id,
        change: s.saved,
        marks: s.marks.map((m) => ({ student_id: m.student_id, status: marks[m.student_id] ?? "present", note: m.note })),
      },
      {
        onSuccess: () => {
          setSaved(true);
          setChanging(false);
          setEdits({});
          qc.invalidateQueries({ queryKey: ["attendance", "report"] });
        },
      },
    );
  }

  if (me && !me.institution?.attendance_enabled) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <StackHeader title="Attendance" />
        <Empty icon="check" title="Attendance is off" body="Attendance isn't switched on for your institution." />
      </View>
    );
  }

  const picker = (
    <View style={{ gap: 12, marginBottom: 8 }}>
      <Card style={{ gap: 14 }}>
        {sections.length > 1 ? (
          <ChoiceField
            label="Subject"
            value={sectionId}
            onChange={(id) => {
              setPicked(id);
              setMeetingPick(undefined);
            }}
            options={sections.map((x) => ({ key: x.id, label: `${x.course_code} · ${x.code}` }))}
          />
        ) : null}
        <DateTimeField
          label="Day"
          withTime={false}
          maxDate={dayToDate(today)}
          value={dayToDate(day)}
          onChange={(d) => {
            setDay(isoDay(d));
            setMeetingPick(undefined);
          }}
        />
        <ChoiceField
          label="Class"
          value={meetingId}
          onChange={setMeetingPick}
          options={[
            ...sectionClasses.map((o) => ({
              key: o.meeting_id,
              label: `${formatTime(o.starts_at, tz)}–${formatTime(o.ends_at, tz)} · ${o.room || "Online"}`,
            })),
            { key: EXTRA, label: "Extra class" },
          ]}
          hint={meetingId === EXTRA ? "A class that isn't on the timetable." : undefined}
        />
      </Card>
      {!student && sectionId !== null ? (
        <Button
          label={showReport ? "Hide term summary" : "Term summary"}
          icon="chart"
          variant="secondary"
          onPress={() => setShowReport((r) => !r)}
        />
      ) : null}
      {showReport && sectionId !== null ? <TermSummary sectionId={sectionId} /> : null}
      {s ? (
        <>
          <T variant="callout" tone="ink2">
            {s.saved && s.saved_at
              ? `Already taken by ${s.taken_by ?? "a teacher"}, ${formatDateTime(s.saved_at, tz)}. ${
                  changing ? "Changes are kept in the record's history." : "Tap Change to edit it."}`
              : s.taken_elsewhere
                ? `Attendance for this subject is already taken today${
                    s.taken_elsewhere.time ? ` (${s.taken_elsewhere.time} class)` : " (extra class)"
                  } by ${s.taken_elsewhere.taken_by}. Open that class to change it.`
                : "Not taken yet. Everyone starts as present: tap anyone who isn't."}
            {readOnly ? " It's been more than 48 hours, so only a coordinator can change it now." : ""}
          </T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T variant="calloutStrong" accessibilityLiveRegion="polite" style={{ flex: 1 }}>
              {counts.filter((c) => c.n).map((c) => `${c.n} ${c.label.toLowerCase()}`).join(" · ") || "No students"}
            </T>
            {!frozen && s.marks.length ? (
              <Button label="Everyone present" variant="secondary" style={{ minHeight: 36 }} onPress={everyonePresent} />
            ) : null}
          </View>
          {!frozen && s.marks.length ? <QuickMark rows={s.marks} onApply={applyMany} /> : null}
          {sectionId !== null && (s.saved || student || s.can_correct) ? (
            <Card style={{ gap: 4 }}>
              <T variant="calloutStrong" tone="ink2">
                Share as Excel
              </T>
              {s.saved ? (
                <DownloadRow
                  label="This subject's register"
                  icon="file"
                  contentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  path={`/api/attendance/sections/${sectionId}/day.xlsx?day=${day}`}
                  name={`${s.title} attendance ${day}.xlsx`}
                />
              ) : null}
              {student || s.can_correct ? (
                <DownloadRow
                  label="The whole day, every subject"
                  icon="calendar"
                  contentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  path={`/api/attendance/sections/${sectionId}/class-day.xlsx?day=${day}`}
                  name={`Class attendance ${day}.xlsx`}
                />
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader
        title="Attendance"
        subtitle={s ? `${s.title} · ${formatDay(s.date, { month: "short" })}` : formatDay(day, { month: "short" })}
      />
      {me && sections.length === 0 && !teaching.isPending ? (
        <Empty icon="people" title="No subjects" body="You can take attendance for the subjects you teach, or as a class rep." />
      ) : !ready || sheet.isPending ? (
        <View style={{ padding: 16, gap: 10 }}>
          <Skeleton height={180} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : !s ? (
        <Failed message={errorDetail(sheet.error, "Couldn't open the register.")} onRetry={() => sheet.refetch()} />
      ) : (
        <>
          <FlatList
            data={s.marks}
            keyExtractor={(m) => String(m.student_id)}
            contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 16 }}
            ListHeaderComponent={picker}
            ListEmptyComponent={
              <T variant="body" tone="ink2">
                Nobody is enrolled in this subject yet.
              </T>
            }
            renderItem={({ item }) => (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: p.surface,
                  borderRadius: radius.lg,
                  borderWidth: p.cards.border ? 1 : 0,
                  borderColor: p.line,
                  padding: 10,
                }}
              >
                <Avatar text={item.initials} color="sky" size={36} />
                <View style={{ flex: 1 }}>
                  <T variant="bodyStrong" numberOfLines={1}>
                    {item.name}
                  </T>
                  {item.college_roll || item.university_roll ? (
                    <T variant="caption" tone="ink2" numberOfLines={1} style={{ fontWeight: "400", fontVariant: ["tabular-nums"] }}>
                      {[item.college_roll && `Roll ${item.college_roll}`, item.university_roll && `Uni ${item.university_roll}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </T>
                  ) : null}
                </View>
                <View accessibilityRole="radiogroup" accessibilityLabel={`${item.name}'s attendance`} style={{ flexDirection: "row", gap: 4 }}>
                  {MARKS.map((m) => {
                    const on = marks[item.student_id] === m.key;
                    const tone = m.key === "absent" ? p.danger : m.key === "late" ? p.warnInk : m.key === "excused" ? p.ink2 : p.success;
                    return (
                      <Pressable
                        key={m.key}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on, disabled: frozen }}
                        accessibilityLabel={`${m.label}, ${item.name}`}
                        disabled={frozen}
                        onPress={() => set(item.student_id, m.key)}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: on ? tone : p.fill,
                        }}
                      >
                        <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? p.surface : p.ink2 }}>{m.short}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          />
          {!readOnly && s.marks.length ? (
            <View style={{ backgroundColor: p.surface, borderTopWidth: 1, borderTopColor: p.line, padding: 12, paddingBottom: Math.max(insets.bottom, 10) + 4, gap: 8 }}>
              {save.isError ? (
                <T variant="callout" tone="danger" accessibilityLiveRegion="polite">
                  {errorDetail(save.error, "Couldn't save the register. Try again.")}
                </T>
              ) : null}
              {saved ? (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Button label="Saved" icon="check" variant="secondary" style={{ flex: 1 }} disabled />
                  <Button label="Done" style={{ flex: 1 }} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
                </View>
              ) : blocked ? (
                <Button
                  label="Open that class"
                  variant="secondary"
                  onPress={() => setMeetingPick(s.taken_elsewhere?.meeting_id ?? EXTRA)}
                />
              ) : s.saved && !changing ? (
                <Button label="Change attendance" icon="pencil" variant="secondary" onPress={() => setChanging(true)} />
              ) : s.saved ? (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    style={{ flex: 1 }}
                    onPress={() => {
                      setEdits({});
                      setChanging(false);
                      save.reset();
                    }}
                  />
                  <Button label="Save changes" style={{ flex: 1 }} busy={save.isPending} onPress={submit} />
                </View>
              ) : (
                <Button label="Save attendance" busy={save.isPending} onPress={submit} />
              )}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

/**
 * Marks many students at once from what's typed: college rolls, university rolls or names (the
 * usual way: everyone present, then type the absentees). Nothing is saved until Save.
 */
function QuickMark({ rows, onApply }: { rows: SheetRow[]; onApply: (ids: number[], mark: Mark, restTo?: Mark) => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function apply(mark: Mark, onlyThese = false) {
    const found = matchStudents(text, rows);
    const issues = [
      found.notFound.length ? `Not found: ${found.notFound.join(", ")}` : "",
      found.ambiguous.length ? `More than one student fits: ${found.ambiguous.join(", ")} (use the roll number)` : "",
    ]
      .filter(Boolean)
      .join(". ");
    setProblem(issues || null);
    if (found.ids.length === 0) {
      setResult(null);
      if (!issues) setProblem("Type roll numbers or names first.");
      return;
    }
    onApply(found.ids, mark, onlyThese ? "absent" : undefined);
    const picked = rows.filter((r) => found.ids.includes(r.student_id));
    setResult(
      onlyThese
        ? `${picked.length} present, the other ${rows.length - picked.length} absent.`
        : `${picked.length} marked ${mark}: ${picked.map((r) => r.college_roll || r.name).join(", ")}.`,
    );
    if (!issues) setText("");
  }

  return (
    <Card style={{ gap: 10 }}>
      <Field
        label="Quick mark by college roll, university roll or name"
        value={text}
        onChangeText={setText}
        placeholder="503 507 512, or 126201, or Ali Raza"
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => apply("absent")}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button label="Absent" variant="secondary" style={{ minHeight: 36 }} onPress={() => apply("absent")} />
        <Button label="Late" variant="secondary" style={{ minHeight: 36 }} onPress={() => apply("late")} />
        <Button label="Present" variant="secondary" style={{ minHeight: 36 }} onPress={() => apply("present")} />
        <Button label="Only these present" variant="secondary" style={{ minHeight: 36 }} onPress={() => apply("present", true)} />
      </View>
      {result ? (
        <T variant="callout" tone="ink2" accessibilityLiveRegion="polite">
          {result}
        </T>
      ) : null}
      {problem ? (
        <T variant="callout" tone="danger" accessibilityLiveRegion="polite">
          {problem}
        </T>
      ) : null}
      <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
        Separate with spaces or commas; 503-520 marks a range of college rolls. Nothing is saved until you press Save.
      </T>
    </Card>
  );
}

/** Each student's attendance this term in one subject, and the Excel download. */
function TermSummary({ sectionId }: { sectionId: number }) {
  const p = useTheme();
  const report = useReport(sectionId, true);
  if (report.isPending) return <Skeleton height={160} />;
  if (!report.data) return <Failed onRetry={() => report.refetch()} />;
  const n = report.data.sessions.length;
  return (
    <Card style={{ gap: 10 }}>
      <T variant="headline">
        This term <T variant="headline" tone="ink3">{`${n} ${n === 1 ? "class" : "classes"} recorded`}</T>
      </T>
      {report.data.students.map((st) => {
        const low = st.summary.rate !== null && st.summary.rate < 75;
        return (
          <View key={st.student_id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong" numberOfLines={1}>
                {st.name}
              </T>
              <T variant="callout" tone="ink3">
                {st.summary.absent} absent · {st.summary.late} late{st.summary.excused ? ` · ${st.summary.excused} excused` : ""}
              </T>
            </View>
            <T variant="bodyStrong" style={{ color: low ? p.danger : p.ink, fontVariant: ["tabular-nums"] }}>
              {st.summary.rate === null ? "–" : `${st.summary.rate}%`}
            </T>
          </View>
        );
      })}
      <DownloadRow label="Download (Excel)" path={`/api/attendance/sections/${sectionId}/report.csv`} name={`attendance-${sectionId}.csv`} />
      <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
        Late counts as attended; excused classes don't count either way.
      </T>
    </Card>
  );
}
