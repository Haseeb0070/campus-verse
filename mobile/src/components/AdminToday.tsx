import { router } from "expo-router";
import { Linking, View } from "react-native";
import { HeaderActions, Screen } from "@/components/Screen";
import { Button, Card, Divider, Failed, Pill, Press, SectionHeader, Skeleton, T } from "@/components/ui";
import { WEB_URL } from "@/lib/config";
import { formatDay, greeting, relativeTime, todayIn } from "@/lib/format";
import { useNow } from "@/lib/now";
import { type Overview, useMe, useNotices, useOverview } from "@/lib/queries";
import { font, radius, useTheme } from "@/theme";

/** Today for an admin with no classes of their own: the college at a glance and what needs
 *  them, instead of an empty timetable. Managing itself happens on the website. */
export function AdminToday() {
  const p = useTheme();
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const now = useNow();
  const today = todayIn(tz, new Date(now));
  const overview = useOverview(true);
  const notices = useNotices(3);
  const firstName = me?.preferred_name || me?.first_name;
  const data = overview.data;

  const attention = data
    ? [
        ...(data.pending_imports
          ? [`${data.pending_imports} timetable ${data.pending_imports === 1 ? "import is" : "imports are"} waiting for review`]
          : []),
        ...data.room_clashes
          .slice(0, 3)
          .map((c) => `${c.room} is double-booked ${formatDay(c.date, { month: "short" })} at ${c.time}`),
      ]
    : [];

  return (
    <Screen
      eyebrow={formatDay(today, { weekday: undefined })}
      title={formatDay(today, { day: undefined, month: undefined })}
      actions={<HeaderActions profile />}
      verse="happy"
      refreshKeys={[["manage"], ["notices"], ["notifications"]]}
    >
      <View style={{ paddingHorizontal: 16, gap: 26 }}>
        {firstName ? (
          <T variant="body" tone="ink2" style={{ marginTop: -8, paddingHorizontal: 4 }}>
            {greeting(tz, new Date(now))}, {firstName}.
          </T>
        ) : null}

        {overview.isPending ? (
          <Skeleton height={230} style={{ borderRadius: radius.xl }} />
        ) : overview.isError ? (
          <Failed onRetry={() => overview.refetch()} />
        ) : data ? (
          <View style={{ backgroundColor: p.field, borderRadius: radius.xl, padding: 20, gap: 18 }}>
            <T variant="caption" tone="onFieldMuted" style={{ letterSpacing: 0.3 }}>
              {me?.institution?.name ?? "Your college"}
            </T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 18 }}>
              {figures(data).map((f) => (
                <View key={f.label} style={{ width: "50%", paddingRight: 8 }}>
                  <T tone="onField" style={{ fontFamily: font.display, fontSize: 32, lineHeight: 36, fontVariant: ["tabular-nums"] }}>
                    {f.value}
                  </T>
                  <T variant="caption" tone="onField" style={{ fontFamily: font.bold }}>
                    {f.label}
                  </T>
                  <T variant="caption" tone="onFieldMuted">
                    {f.detail}
                  </T>
                </View>
              ))}
            </View>
            <Button label="Manage on the website" variant="field" onPress={() => Linking.openURL(`${WEB_URL}/manage`)} />
          </View>
        ) : null}

        <View>
          <SectionHeader title="Needs you" />
          <Card padded={attention.length === 0}>
            {attention.length === 0 ? (
              <T variant="body" tone="ink2">
                Nothing right now. Timetable imports and room clashes show up here.
              </T>
            ) : (
              attention.map((a, i) => (
                <View key={a}>
                  {i > 0 && <Divider />}
                  <T variant="body" style={{ padding: 16 }}>
                    {a}
                  </T>
                </View>
              ))
            )}
          </Card>
        </View>

        <View>
          <SectionHeader title="Latest notices" action="Board" onAction={() => router.navigate("/notices")} />
          {notices.isPending ? (
            <Skeleton height={140} />
          ) : notices.data?.length ? (
            <Card padded={false}>
              {notices.data.map((n, i) => (
                <View key={n.id}>
                  {i > 0 && <Divider />}
                  <Press accessibilityRole="button" onPress={() => router.navigate("/notices")}>
                    <View style={{ padding: 16, gap: 4 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <T variant="caption" tone="ink3" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {n.author_name}
                          {n.published_at ? ` · ${relativeTime(n.published_at)}` : ""}
                        </T>
                        {n.priority === "important" ? <Pill label="Important" tone="accent" /> : null}
                      </View>
                      <T variant="headline" numberOfLines={2}>
                        {n.title}
                      </T>
                    </View>
                  </Press>
                </View>
              ))}
            </Card>
          ) : (
            <Card>
              <T variant="body" tone="ink2">
                No notices yet.
              </T>
            </Card>
          )}
        </View>
      </View>
    </Screen>
  );
}

function figures(d: Overview) {
  return [
    { label: "Students", value: d.students, detail: d.invited ? `${d.invited} not signed up yet` : "All signed up" },
    { label: "Teachers", value: d.teachers, detail: `${d.staff} staff` },
    { label: "Active sections", value: d.sections, detail: `${d.departments} ${d.departments === 1 ? "department" : "departments"}` },
    { label: "Signed in this week", value: d.signed_in_week, detail: `of ${d.active_people} people` },
  ];
}
