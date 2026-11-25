import { router } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, ScrollView, TextInput, View } from "react-native";
import { errorDetail } from "@/lib/api";
import { useAssignmentAction, useAssignmentRoster, useGrade } from "@/lib/coursework";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { Assignment, AssignmentRosterRow } from "@/lib/types";
import { font, radius, useTheme } from "@/theme";
import { DownloadRow, FileRow } from "./files";
import { FormError, Sheet, TextArea } from "./form";
import { Avatar, Button, Card, Divider, Pill, Press, Skeleton, T } from "./ui";

/**
 * The teacher's side of an assignment: change, publish or delete it; see who handed in; mark each
 * student (points and feedback); release the marks; download them for Excel.
 */
export function TeacherPanel({ a, tz }: { a: Assignment; tz?: string }) {
  const roster = useAssignmentRoster(a.id, true);
  const action = useAssignmentAction(a.id);
  const [marking, setMarking] = useState<AssignmentRosterRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ungraded = (a.student_count ?? 0) - (a.graded_count ?? 0);

  function run(kind: "publish" | "delete" | "release", after?: () => void) {
    setError(null);
    action.mutate(kind, {
      onSuccess: after,
      onError: (err) => setError(errorDetail(err, "That didn't work. Try again.")),
    });
  }

  function confirmDelete() {
    Alert.alert("Delete this assignment?", "Students lose it too. You can only delete it while nobody has handed in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => run("delete", () => (router.canGoBack() ? router.back() : router.replace("/work"))) },
    ]);
  }

  function confirmRelease() {
    Alert.alert(
      "Release marks?",
      `${ungraded > 0 ? `${ungraded} ${ungraded === 1 ? "student isn't" : "students aren't"} marked yet. ` : ""}Students will see their marks and feedback.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Release", onPress: () => run("release") },
      ],
    );
  }

  return (
    <>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <T variant="headline">Hand-ins</T>
          {a.status === "draft" ? <Pill label="Draft" tone="warn" /> : null}
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Count label="Handed in" value={`${a.submitted_count ?? 0} / ${a.student_count ?? 0}`} />
          <Count label="Marked" value={`${a.graded_count ?? 0}`} />
          <Count label="Marks" value={a.grades_released ? "Released" : "Not yet"} />
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            label="Edit"
            icon="pencil"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: "/assignment/edit", params: { id: String(a.id) } })}
          />
          {a.status === "draft" ? (
            <Button label="Publish" style={{ flex: 1 }} busy={action.isPending && action.variables === "publish"} onPress={() => run("publish")} />
          ) : !a.grades_released ? (
            <Button label="Release marks" style={{ flex: 1 }} busy={action.isPending && action.variables === "release"} onPress={confirmRelease} />
          ) : null}
        </View>
        {a.grades_released ? (
          <Pill label="Marks released to students" tone="success" icon="check" />
        ) : null}
        <FormError text={error} />
        <Divider />
        <DownloadRow label="Download marks (Excel)" path={`/api/assignments/${a.id}/grades.csv`} name={`${a.course_code} ${a.title} marks.csv`} />
        {(a.submitted_count ?? 0) === 0 ? (
          <Button label="Delete assignment" icon="trash" variant="danger" onPress={confirmDelete} />
        ) : null}
      </Card>

      <Card style={{ gap: 4 }}>
        <T variant="headline" style={{ marginBottom: 6 }}>
          Students
        </T>
        {roster.isPending ? (
          <>
            <Skeleton height={56} />
            <Skeleton height={56} />
          </>
        ) : !roster.data?.length ? (
          <T variant="body" tone="ink2">
            No students in this subject yet.
          </T>
        ) : (
          roster.data.map((row, i) => (
            <View key={row.student.id}>
              {i > 0 && <Divider inset={56} />}
              <StudentRow row={row} max={a.max_points} onPress={() => setMarking(row)} />
            </View>
          ))
        )}
      </Card>

      <GradeSheet a={a} tz={tz} row={marking} onClose={() => setMarking(null)} />
    </>
  );
}

function StudentRow({ row, max, onPress }: { row: AssignmentRosterRow; max: number; onPress: () => void }) {
  const latest = row.latest;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`${row.student.name}. ${latest ? "Handed in" : "Not handed in"}${row.grade ? `, marked ${Number(row.grade.points)} of ${max}` : ""}. Mark`}
      onPress={onPress}
      scaleTo={0.99}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 6 }}
    >
      <Avatar text={row.student.initials} size={40} />
      <View style={{ flex: 1 }}>
        <T variant="bodyStrong" numberOfLines={1}>
          {row.student.name}
        </T>
        <T variant="callout" tone={latest?.is_late ? "danger" : "ink3"} numberOfLines={1}>
          {latest
            ? `Handed in ${relativeTime(latest.submitted_at)}${latest.is_late ? " · late" : ""}${row.attempts > 1 ? ` · attempt ${row.attempts}` : ""}`
            : "Not handed in"}
        </T>
      </View>
      {row.grade ? (
        <T variant="bodyStrong" style={{ fontVariant: ["tabular-nums"] }}>
          {Number(row.grade.points)}/{max}
        </T>
      ) : (
        <T variant="calloutStrong" tone="accentInk">
          {latest ? "Mark" : "—"}
        </T>
      )}
    </Press>
  );
}

/** One student's latest hand-in, with their mark and feedback to fill in. */
function GradeSheet({ a, tz, row, onClose }: { a: Assignment; tz?: string; row: AssignmentRosterRow | null; onClose: () => void }) {
  const p = useTheme();
  const grade = useGrade(a.id);
  const [points, setPoints] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [forId, setForId] = useState<number | null>(null);

  // Start from the student's current mark each time the sheet opens on someone new.
  if (row && row.student.id !== forId) {
    setForId(row.student.id);
    setPoints(row.grade ? String(Number(row.grade.points)) : "");
    setFeedback(row.grade?.feedback ?? "");
    setError(null);
  }

  function save() {
    if (!row) return;
    const n = Number(points.replace(",", "."));
    if (points.trim() === "" || Number.isNaN(n) || n < 0 || n > a.max_points) {
      return setError(`Enter points from 0 to ${a.max_points}.`);
    }
    setError(null);
    grade.mutate(
      { studentId: row.student.id, points: n, feedback: feedback.trim() },
      {
        onSuccess: () => {
          setForId(null);
          onClose();
        },
        onError: (err) => setError(errorDetail(err, "Couldn't save the mark.")),
      },
    );
  }

  const latest = row?.latest;
  return (
    <Sheet visible={!!row} onClose={() => { setForId(null); onClose(); }} title={row ? row.student.name : ""}>
      <KeyboardAvoidingView behavior="padding">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
          {latest ? (
            <View style={{ backgroundColor: p.fill, borderRadius: radius.md, padding: 12, gap: 6 }}>
              <T variant="caption" tone="ink3">
                Attempt {latest.attempt} · {formatDateTime(latest.submitted_at, tz)}
                {latest.is_late ? " · late" : ""}
              </T>
              {latest.text ? (
                <T variant="body" selectable>
                  {latest.text}
                </T>
              ) : null}
              {latest.files.map((f) => (
                <FileRow key={f.id} f={f} path={`/api/assignments/files/${f.id}`} />
              ))}
            </View>
          ) : (
            <T variant="callout" tone="ink3">
              Nothing handed in. You can still give a mark.
            </T>
          )}
          <View style={{ gap: 6 }}>
            <T variant="calloutStrong" tone="ink2">
              Points (of {a.max_points})
            </T>
            <TextInput
              value={points}
              onChangeText={setPoints}
              keyboardType="decimal-pad"
              accessibilityLabel={`Points out of ${a.max_points}`}
              placeholder="0"
              placeholderTextColor={p.ink3}
              style={{
                minHeight: 50,
                width: 120,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: error ? p.danger : p.line,
                backgroundColor: p.surface,
                paddingHorizontal: 16,
                fontFamily: font.bold,
                fontSize: 18,
                color: p.ink,
              }}
            />
          </View>
          <TextArea label="Feedback" value={feedback} onChangeText={setFeedback} minHeight={90} placeholder="What went well, what to improve" />
          <FormError text={error} />
          <Button label="Save mark" busy={grade.isPending} onPress={save} />
          {!a.grades_released ? (
            <T variant="caption" tone="ink3" style={{ textAlign: "center", fontWeight: "400" }}>
              Students see marks once you release them.
            </T>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

function Count({ label, value }: { label: string; value: string }) {
  const p = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: p.fill, borderRadius: 14, padding: 12, gap: 2 }}>
      <T variant="caption" tone="ink3">
        {label}
      </T>
      <T variant="bodyStrong">{value}</T>
    </View>
  );
}
