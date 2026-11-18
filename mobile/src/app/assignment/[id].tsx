import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Divider, Failed, IconButton, Pill, Skeleton, T } from "@/components/ui";
import { errorDetail, type UploadFile } from "@/lib/api";
import { openFile, pickFiles } from "@/lib/files";
import { fileSize, formatDateTime, relativeTime } from "@/lib/format";
import { useAssignment, useMe, useSubmit, useUploadRules } from "@/lib/queries";
import type { Assignment, StoredFileInfo } from "@/lib/types";
import { font, radius, useTheme } from "@/theme";

export default function AssignmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const query = useAssignment(Number(id));
  const a = query.data;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title={a?.title ?? "Assignment"} subtitle={a ? `${a.course_code} · ${a.section_code} · ${a.course_title}` : undefined} />
      {query.isPending ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton height={160} />
          <Skeleton height={220} />
        </View>
      ) : query.isError || !a ? (
        <Failed onRetry={() => query.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
          <Overview a={a} tz={tz} />
          {a.instructions ? (
            <Card style={{ gap: 8 }}>
              <T variant="headline">Instructions</T>
              <T variant="body" tone="ink2" selectable>
                {a.instructions}
              </T>
            </Card>
          ) : null}
          {a.attachments.length ? (
            <Card style={{ gap: 8 }}>
              <T variant="headline">From your teacher</T>
              {a.attachments.map((f) => (
                <FileRow key={f.id} f={f} />
              ))}
            </Card>
          ) : null}
          {a.can_manage ? <TeacherSummary a={a} /> : <StudentSide a={a} tz={tz} />}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function Overview({ a, tz }: { a: Assignment; tz?: string }) {
  const p = useTheme();
  const windowNote = {
    not_open: { label: `Opens ${formatDateTime(a.available_from, tz)}`, tone: "neutral" as const },
    open: { label: `Due ${relativeTime(a.due_at)}`, tone: "accent" as const },
    late: { label: a.late_until ? `Late hand-ins until ${formatDateTime(a.late_until, tz)}` : "Late hand-ins allowed", tone: "warn" as const },
    closed: { label: "Closed", tone: "neutral" as const },
  }[a.window];
  return (
    <View style={{ backgroundColor: p.field, borderRadius: radius.xl, padding: 20, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ backgroundColor: p.fieldLine, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
          <T variant="caption" tone="onField" style={{ fontFamily: font.bold }}>
            {a.course_code} · {a.section_code}
          </T>
        </View>
        <Pill label={windowNote.label} tone={windowNote.tone} />
      </View>
      <T tone="onField" style={{ fontFamily: font.display, fontSize: 28, lineHeight: 32 }}>
        {a.title}
      </T>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Stat label="Due" value={formatDateTime(a.due_at, tz)} />
        <Stat label="Points" value={String(a.max_points)} />
        <Stat label="Hand in" value={{ text: "Text", file: "Files", both: "Text + files" }[a.submission_type]} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const p = useTheme();
  return (
    <View style={{ flex: 1, borderWidth: 1, borderColor: p.fieldLine, borderRadius: 14, padding: 10, gap: 2 }}>
      <T variant="caption" tone="onFieldMuted">
        {label}
      </T>
      <T variant="calloutStrong" tone="onField" numberOfLines={2}>
        {value}
      </T>
    </View>
  );
}

function FileRow({ f, onRemove }: { f: StoredFileInfo | UploadFile; onRemove?: () => void }) {
  const p = useTheme();
  const [busy, setBusy] = useState(false);
  const stored = "id" in f;
  const size = "size" in f && f.size ? fileSize(f.size) : "";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
      <Pressable
        accessibilityRole={stored ? "button" : undefined}
        accessibilityLabel={stored ? `Open ${f.name}` : f.name}
        disabled={!stored || busy}
        onPress={async () => {
          if (!stored) return;
          setBusy(true);
          try {
            await openFile(`/api/assignments/files/${f.id}`, f.name, f.content_type);
          } catch {
            Alert.alert("Couldn't open the file", "Check your connection and try again.");
          } finally {
            setBusy(false);
          }
        }}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: p.fill, alignItems: "center", justifyContent: "center" }}>
          {busy ? <ActivityIndicator size="small" color={p.ink2} /> : <Icon name="file" size={18} color={p.ink2} />}
        </View>
        <View style={{ flex: 1 }}>
          <T variant="calloutStrong" numberOfLines={1} tone={stored ? "accentInk" : "ink"}>
            {f.name}
          </T>
          {size ? (
            <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
              {size}
            </T>
          ) : null}
        </View>
      </Pressable>
      {onRemove ? <IconButton icon="close" label={`Remove ${f.name}`} variant="plain" size={36} onPress={onRemove} /> : null}
    </View>
  );
}

function StudentSide({ a, tz }: { a: Assignment; tz?: string }) {
  const p = useTheme();
  const submit = useSubmit(a.id);
  const rules = useUploadRules().data;
  const [text, setText] = useState("");
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const attempts = a.my_attempts ?? 0;
  const left = a.max_attempts > 0 ? a.max_attempts - attempts : Infinity;
  const canSubmit = (a.window === "open" || a.window === "late") && left > 0;
  const wantsText = a.submission_type !== "file";
  const wantsFiles = a.submission_type !== "text";
  const latest = a.my_submissions?.at(-1) ?? null; // the API lists attempts oldest first

  async function add() {
    const picked = await pickFiles(true);
    if (!picked) return;
    const max = (rules?.max_mb ?? 20) * 1024 * 1024;
    const tooBig = picked.find((f) => (f.size ?? 0) > max);
    if (tooBig) return setError(`${tooBig.name} is over ${rules?.max_mb ?? 20} MB.`);
    setError(null);
    setFiles((list) => [...list, ...picked]);
  }

  function send() {
    setError(null);
    if (wantsText && !wantsFiles && !text.trim()) return setError("Write your answer first.");
    if (wantsFiles && !wantsText && !files.length) return setError("Add at least one file.");
    if (!text.trim() && !files.length) return setError("Write an answer or add a file.");
    submit.mutate(
      { text: text.trim(), files },
      {
        onSuccess: () => {
          setText("");
          setFiles([]);
          setDone(true);
        },
        onError: (err) => setError(errorDetail(err, "Couldn't hand it in. Try again.")),
      },
    );
  }

  return (
    <>
      {a.my_grade && a.grades_released ? (
        <Card style={{ gap: 8, borderColor: p.accent }}>
          <T variant="caption" tone="accentInk">
            Your mark
          </T>
          <T style={{ fontFamily: font.display, fontSize: 34, color: p.ink }}>
            {a.my_grade.points}
            <T variant="headline" tone="ink3">
              {` / ${a.max_points}`}
            </T>
          </T>
          {a.my_grade.feedback ? (
            <T variant="body" tone="ink2" selectable>
              {a.my_grade.feedback}
            </T>
          ) : null}
        </Card>
      ) : null}

      {latest ? (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T variant="headline">Your hand-in</T>
            {latest.is_late ? <Pill label="Late" tone="warn" /> : <Pill label="On time" tone="success" icon="check" />}
          </View>
          <T variant="callout" tone="ink3">
            Attempt {latest.attempt}
            {a.max_attempts ? ` of ${a.max_attempts}` : ""} · {formatDateTime(latest.submitted_at, tz)}
          </T>
          {latest.text ? (
            <T variant="body" tone="ink2" selectable>
              {latest.text}
            </T>
          ) : null}
          {latest.files.map((f) => (
            <FileRow key={f.id} f={f} />
          ))}
        </Card>
      ) : null}

      {done ? (
        <Animated.View entering={FadeIn}>
          <Card style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Icon name="check" size={20} color={p.success} />
            <T variant="bodyStrong" style={{ flex: 1 }}>
              Handed in. Your teacher can see it now.
            </T>
          </Card>
        </Animated.View>
      ) : null}

      {canSubmit ? (
        <Card style={{ gap: 12 }}>
          <T variant="headline">{attempts ? "Hand in again" : "Hand in"}</T>
          {Number.isFinite(left) ? (
            <T variant="callout" tone="ink3">
              {left} {left === 1 ? "attempt" : "attempts"} left. Your latest one is the one that’s marked.
            </T>
          ) : null}
          {wantsText ? (
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder="Write your answer"
              placeholderTextColor={p.ink3}
              accessibilityLabel="Your answer"
              textAlignVertical="top"
              style={{
                minHeight: 130,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: p.line,
                backgroundColor: p.bg,
                padding: 14,
                fontFamily: font.regular,
                fontSize: 15,
                lineHeight: 21,
                color: p.ink,
              }}
            />
          ) : null}
          {wantsFiles ? (
            <View style={{ gap: 4 }}>
              {files.map((f, i) => (
                <View key={`${f.uri}-${i}`}>
                  {i > 0 && <Divider />}
                  <FileRow f={f} onRemove={() => setFiles((l) => l.filter((_, j) => j !== i))} />
                </View>
              ))}
              <Button label={files.length ? "Add another file" : "Add files"} icon="attach" variant="secondary" onPress={add} />
              {rules ? (
                <T variant="caption" tone="ink3" style={{ fontWeight: "400", textAlign: "center", marginTop: 4 }}>
                  Up to {rules.max_mb} MB each
                </T>
              ) : null}
            </View>
          ) : null}
          {error ? (
            <T variant="callout" tone="danger" accessibilityLiveRegion="polite">
              {error}
            </T>
          ) : null}
          <Button label={a.window === "late" ? "Hand in late" : "Hand in"} busy={submit.isPending} onPress={send} />
        </Card>
      ) : !latest ? (
        <Card>
          <T variant="body" tone="ink2">
            {a.window === "not_open"
              ? `You can hand this in from ${formatDateTime(a.available_from, tz)}.`
              : "This is closed. Ask your teacher if you need more time."}
          </T>
        </Card>
      ) : left <= 0 ? (
        <T variant="callout" tone="ink3" style={{ textAlign: "center" }}>
          You’ve used every attempt.
        </T>
      ) : null}
    </>
  );
}

function TeacherSummary({ a }: { a: Assignment }) {
  return (
    <Card style={{ gap: 10 }}>
      <T variant="headline">Hand-ins</T>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Count label="Handed in" value={`${a.submitted_count ?? 0} / ${a.student_count ?? 0}`} />
        <Count label="Marked" value={`${a.graded_count ?? 0}`} />
        <Count label="Marks" value={a.grades_released ? "Released" : "Not yet"} />
      </View>
      <T variant="callout" tone="ink3">
        Marking and releasing grades happen on the CampusVerse website, where there’s room for the whole roster.
      </T>
    </Card>
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

