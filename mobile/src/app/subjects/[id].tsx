import { useLocalSearchParams } from "expo-router";
import { Linking, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tileLabel } from "@/components/conversations";
import { DownloadRow } from "@/components/files";
import { StackHeader } from "@/components/StackHeader";
import { Avatar, Card, Divider, Failed, Pill, Press, Skeleton, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useRoster, useSectionReps } from "@/lib/coursework";
import type { Person } from "@/lib/types";
import { font, radius, useTheme } from "@/theme";

/** A subject's teachers and students, its CR and GR, and the class list and marks for Excel. */
export default function RosterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const roster = useRoster(Number(id));
  const reps = useSectionReps(Number(id));
  const r = roster.data;
  const roleOf = (studentId: number) => reps.data?.find((x) => x.student_id === studentId)?.role;
  const notYours = roster.error instanceof ApiError && [403, 404].includes(roster.error.status);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader
        title={r ? r.section.course_title : "Roster"}
        subtitle={r ? `${r.section.course_code} · ${r.section.code} · ${r.section.term}` : undefined}
      />
      {roster.isPending ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton height={120} />
          <Skeleton height={300} />
        </View>
      ) : !r ? (
        <Failed message={notYours ? "You can only see rosters for subjects you teach." : undefined} onRetry={() => roster.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}>
          <View style={{ backgroundColor: p.field, borderRadius: radius.xl, padding: 20, gap: 12, flexDirection: "row", alignItems: "center" }}>
            <Avatar text={tileLabel(r.section.course_code)} color={r.section.color} size={56} />
            <View style={{ flex: 1 }}>
              <T tone="onField" style={{ fontFamily: font.display, fontSize: 24, lineHeight: 28 }}>
                {r.section.course_title}
              </T>
              <T variant="callout" tone="onFieldMuted">
                {r.students.length} {r.students.length === 1 ? "student" : "students"} · {r.teachers.length}{" "}
                {r.teachers.length === 1 ? "teacher" : "teachers"}
              </T>
            </View>
          </View>

          <Card style={{ gap: 4 }}>
            <DownloadRow
              label="Class list (Excel)"
              path={`/api/sections/${id}/roster.csv`}
              name={`${r.section.course_code} ${r.section.code} class list.csv`}
            />
            <Divider inset={46} />
            <DownloadRow label="Marks (Excel)" path={`/api/sections/${id}/marks.csv`} name={`${r.section.course_code} ${r.section.code} marks.csv`} />
          </Card>

          <Card style={{ gap: 4 }}>
            <T variant="headline" style={{ marginBottom: 4 }}>
              Teachers
            </T>
            {r.teachers.map((t, i) => (
              <View key={t.id}>
                {i > 0 && <Divider inset={52} />}
                <PersonRow person={t} />
              </View>
            ))}
          </Card>

          <Card style={{ gap: 4 }}>
            <T variant="headline">
              Students{" "}
              <T variant="headline" tone="ink3">
                {r.students.length}
              </T>
            </T>
            {reps.isSuccess ? (
              <T variant="callout" tone="ink2" style={{ marginBottom: 4 }}>
                {(["cr", "gr"] as const)
                  .map((role) => `${role.toUpperCase()}: ${reps.data.find((x) => x.role === role)?.name ?? "not chosen yet"}`)
                  .join(" · ")}
              </T>
            ) : null}
            {r.students.length === 0 ? (
              <T variant="body" tone="ink2">
                No students enrolled yet.
              </T>
            ) : (
              r.students.map((s, i) => (
                <View key={s.id}>
                  {i > 0 && <Divider inset={52} />}
                  <PersonRow person={s} badge={roleOf(s.id)?.toUpperCase()} />
                </View>
              ))
            )}
            <T variant="caption" tone="ink3" style={{ marginTop: 8, fontWeight: "400" }}>
              Enrollment comes from your institution’s records. Ask your admin to fix anything that’s wrong.
            </T>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

function PersonRow({ person, badge }: { person: Person; badge?: string }) {
  return (
    <Press
      accessibilityRole="link"
      accessibilityLabel={`${person.name}${badge ? `, ${badge}` : ""}. Email ${person.email}`}
      onPress={() => Linking.openURL(`mailto:${person.email}`)}
      scaleTo={0.99}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 4 }}
    >
      <Avatar text={person.initials} size={40} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {person.name}
          </T>
          {badge ? <Pill label={badge} tone="accent" /> : null}
        </View>
        <T variant="callout" tone="ink3" numberOfLines={1}>
          {person.email}
        </T>
      </View>
    </Press>
  );
}
