import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StackHeader } from "@/components/StackHeader";
import { Avatar, Button, Failed, Skeleton, T } from "@/components/ui";
import { errorDetail } from "@/lib/api";
import { formatDateTime, formatDay } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { type Mark, useSaveSheet, useSheet } from "@/lib/teaching";
import { font, radius, useTheme } from "@/theme";

const MARKS: { key: Mark; short: string; label: string }[] = [
  { key: "present", short: "P", label: "Present" },
  { key: "late", short: "L", label: "Late" },
  { key: "absent", short: "A", label: "Absent" },
  { key: "excused", short: "E", label: "Excused" },
];

/** Take a class's attendance: everyone starts present, tap anyone who isn't, then save. */
export default function Attendance() {
  const { section, date, meeting } = useLocalSearchParams<{ section: string; date: string; meeting?: string }>();
  const sectionId = Number(section);
  const meetingId = meeting ? Number(meeting) : undefined;
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const tz = useMe().data?.institution?.timezone;
  const sheet = useSheet(sectionId, date, meetingId);
  const save = useSaveSheet(sectionId);
  // Your taps, over what's saved (or everyone present on a new sheet).
  const [edits, setEdits] = useState<Record<number, Mark>>({});
  const [saved, setSaved] = useState(false);

  const s = sheet.data;
  const marks: Record<number, Mark> = Object.fromEntries(
    (s?.marks ?? []).map((m) => [m.student_id, edits[m.student_id] ?? m.status ?? "present"]),
  );
  const readOnly = !!s && s.locked && !s.can_correct;
  const counts = MARKS.map((m) => ({ ...m, n: Object.values(marks).filter((v) => v === m.key).length }));

  function set(id: number, mark: Mark) {
    setSaved(false);
    setEdits((all) => ({ ...all, [id]: mark }));
  }

  function submit() {
    if (!s) return;
    save.mutate(
      {
        date: s.date,
        meeting_id: s.meeting_id,
        marks: s.marks.map((m) => ({ student_id: m.student_id, status: marks[m.student_id] ?? "present", note: m.note })),
      },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Attendance" subtitle={s ? `${s.title} · ${formatDay(s.date, { month: "short" })}` : undefined} />
      {sheet.isPending ? (
        <View style={{ padding: 16, gap: 10 }}>
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : sheet.isError || !s ? (
        <Failed message={errorDetail(sheet.error, "Couldn't open the register.")} onRetry={() => sheet.refetch()} />
      ) : (
        <>
          <FlatList
            data={s.marks}
            keyExtractor={(m) => String(m.student_id)}
            contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 16 }}
            ListHeaderComponent={
              <View style={{ gap: 8, marginBottom: 8 }}>
                <T variant="callout" tone="ink2">
                  {s.saved && s.saved_at
                    ? `Saved by ${s.taken_by ?? "a teacher"}, ${formatDateTime(s.saved_at, tz)}.`
                    : "Not taken yet. Everyone starts as present: tap anyone who isn't."}
                  {readOnly ? " It's been more than 48 hours, so only a coordinator can change it now." : ""}
                </T>
                <T variant="calloutStrong" accessibilityLiveRegion="polite">
                  {counts.filter((c) => c.n).map((c) => `${c.n} ${c.label.toLowerCase()}`).join(" · ") || "No students"}
                </T>
              </View>
            }
            renderItem={({ item }) => (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: p.surface,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: p.line,
                  padding: 10,
                }}
              >
                <Avatar text={item.initials} color="sky" size={36} />
                <T variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                  {item.name}
                </T>
                <View accessibilityRole="radiogroup" accessibilityLabel={`${item.name}'s attendance`} style={{ flexDirection: "row", gap: 4 }}>
                  {MARKS.map((m) => {
                    const on = marks[item.student_id] === m.key;
                    const tone = m.key === "absent" ? p.danger : m.key === "late" ? p.warnInk : m.key === "excused" ? p.ink2 : p.success;
                    return (
                      <Pressable
                        key={m.key}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on, disabled: readOnly }}
                        accessibilityLabel={`${m.label}, ${item.name}`}
                        disabled={readOnly}
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
          {!readOnly ? (
            <View style={{ backgroundColor: p.surface, borderTopWidth: 1, borderTopColor: p.line, padding: 12, paddingBottom: Math.max(insets.bottom, 10) + 4, gap: 8 }}>
              {save.isError ? (
                <T variant="callout" tone="danger" accessibilityLiveRegion="polite">
                  {errorDetail(save.error, "Couldn't save the register. Try again.")}
                </T>
              ) : null}
              {saved ? (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Button label="Saved" icon="check" variant="secondary" style={{ flex: 1 }} disabled />
                  <Button label="Done" style={{ flex: 1 }} onPress={() => router.back()} />
                </View>
              ) : (
                <Button label={s.saved ? "Save changes" : "Save attendance"} busy={save.isPending} onPress={submit} />
              )}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
