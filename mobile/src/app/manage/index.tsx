import { useQueryClient } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/Icon";
import { ManageNotAllowed } from "@/components/manage-bits";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Divider, Failed, Press, SectionHeader, Skeleton, T } from "@/components/ui";
import { formatDateTime, formatDay } from "@/lib/format";
import { useAudit, useManageAccess, useOverview } from "@/lib/manage";
import { font, radius, useTheme } from "@/theme";

type Area = {
  href: string;
  label: string;
  detail: string;
  icon: IconName;
  coordinators?: boolean;
  coordinatorsOnly?: boolean;
};

/** Every Manage screen, in the website's order. Who sees which follows the website's Manage
 *  layout: admins get all but the coordinators' own department pages; coordinators get only
 *  the ones marked for them. */
const AREAS: Area[] = [
  { href: "/manage/people", label: "People", detail: "Accounts, invites and roles", icon: "people" },
  { href: "/manage/academic", label: "Sections & subjects", detail: "Departments, courses, sections and teachers", icon: "arch", coordinators: true },
  { href: "/manage/department/people", label: "Department people", detail: "Students and teachers in your departments' subjects", icon: "user", coordinators: true, coordinatorsOnly: true },
  { href: "/manage/department/reports", label: "Department report", detail: "Attendance and marks across your departments", icon: "chart", coordinators: true, coordinatorsOnly: true },
  { href: "/manage/import", label: "Imports & sync", detail: "Timetable, people and enrollment files", icon: "download" },
  { href: "/manage/reports", label: "Reports", detail: "Attendance, marks and activity", icon: "chart" },
  { href: "/manage/requests", label: "Requests", detail: "People asking to fix their records", icon: "flag" },
  { href: "/manage/audit", label: "Audit log", detail: "Every change, who made it and when", icon: "clipboard" },
  { href: "/manage/theme", label: "Theme", detail: "The college's colours and look", icon: "sun" },
];

/** The Manage hub: the website's Overview (for admins), then a row into each Manage screen. */
export default function ManageHub() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { me, loaded, admin, coordinator } = useManageAccess();
  const [refreshing, setRefreshing] = useState(false);
  const areas = AREAS.filter((a) => (admin ? !a.coordinatorsOnly : a.coordinators));

  async function refresh() {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["manage"] });
    setRefreshing(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Manage" subtitle={me?.institution?.name} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
        refreshControl={admin ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={p.ink3} /> : undefined}
      >
        {!loaded ? (
          <Skeleton height={160} />
        ) : !admin && !coordinator ? (
          <ManageNotAllowed />
        ) : (
          <>
            {admin && <AdminOverview />}
            {admin && <SectionHeader title="Everything in Manage" />}
            <Card padded={false}>
              {areas.map((a, i) => (
                <View key={a.href}>
                  {i > 0 && <Divider inset={64} />}
                  <AreaRow area={a} />
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function AreaRow({ area }: { area: Area }) {
  const p = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`${area.label}. ${area.detail}`}
      scaleTo={0.99}
      onPress={() => router.push(area.href as Href)}
      style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 14, paddingVertical: 12, minHeight: 60 }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: p.accentSoft, alignItems: "center", justifyContent: "center" }}>
        <Icon name={area.icon} size={18} color={p.accentInk} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="bodyStrong">{area.label}</T>
        <T variant="callout" tone="ink3" numberOfLines={2}>
          {area.detail}
        </T>
      </View>
      <Icon name="chevron" size={18} color={p.ink3} />
    </Press>
  );
}

function AdminOverview() {
  const p = useTheme();
  const { me } = useManageAccess();
  const tz = me?.institution?.timezone;
  const overview = useOverview(true);
  const audit = useAudit("");
  const data = overview.data;
  const recent = audit.data?.slice(0, 6);

  const tiles = data
    ? [
        { label: "Students", value: data.students, sub: `${data.invited} invited, not signed up yet` },
        { label: "Teachers", value: data.teachers, sub: `${data.staff} staff` },
        { label: "Active subjects", value: data.sections, sub: `across ${data.departments} departments` },
        { label: "Signed in this week", value: data.signed_in_week, sub: `of ${data.active_people} active people` },
      ]
    : [];

  const attention = data
    ? [
        ...(data.pending_imports
          ? [{ text: `${data.pending_imports} timetable import waiting for review`, href: "/manage/import", cta: "Review" }]
          : []),
        ...data.room_clashes.map((c) => ({
          text: `${c.room} is double-booked ${formatDay(c.date, { month: "short" })} at ${c.time}: ${c.classes.join(" and ")}`,
          href: "/timetable",
          cta: "See timetable",
        })),
      ]
    : [];

  return (
    <>
      {me && !me.two_step && (
        <Card style={{ gap: 10 }}>
          <View style={{ gap: 2 }}>
            <T variant="bodyStrong">Turn on two-step sign-in</T>
            <T variant="callout" tone="ink2">
              Your account can change everyone&apos;s access. A code from your phone keeps it safe even if your password leaks.
            </T>
          </View>
          <Button label="Set it up" onPress={() => router.push("/security")} style={{ alignSelf: "flex-start", minHeight: 40 }} />
        </Card>
      )}

      {overview.isPending ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={104} style={{ flexBasis: "47%", flexGrow: 1 }} />
          ))}
        </View>
      ) : overview.isError && !data ? (
        <Failed onRetry={() => overview.refetch()} />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {tiles.map((t) => (
            <Card key={t.label} style={{ flexBasis: "47%", flexGrow: 1, gap: 2 }}>
              <T variant="calloutStrong" tone="ink2">
                {t.label}
              </T>
              <T style={{ fontFamily: font.display, fontSize: 28, lineHeight: 34, fontVariant: ["tabular-nums"] }}>{t.value}</T>
              <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
                {t.sub}
              </T>
            </Card>
          ))}
        </View>
      )}

      {data && (
        <Card style={{ gap: 10 }}>
          <T variant="headline" accessibilityRole="header">
            Needs your attention
          </T>
          {attention.length === 0 ? (
            <T variant="callout" tone="ink2">
              Nothing right now. No room clashes in the coming week.
            </T>
          ) : (
            attention.map((a) => (
              <View key={a.text} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.warnInk }} />
                <T variant="callout" style={{ flex: 1 }}>
                  {a.text}
                </T>
                <Press
                  accessibilityRole="button"
                  onPress={() => router.push(a.href as Href)}
                  style={{ backgroundColor: p.fill, borderRadius: radius.pill, paddingHorizontal: 12, minHeight: 34, justifyContent: "center" }}
                >
                  <T variant="calloutStrong">{a.cta}</T>
                </Press>
              </View>
            ))
          )}
        </Card>
      )}

      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
          <T variant="headline" accessibilityRole="header">
            Recent changes
          </T>
          <Press accessibilityRole="link" onPress={() => router.push("/manage/audit" as Href)} hitSlop={12}>
            <T variant="calloutStrong" tone="accentInk">
              Full audit log
            </T>
          </Press>
        </View>
        {audit.isPending ? (
          <Skeleton height={120} />
        ) : !recent?.length ? (
          <T variant="callout" tone="ink2">
            No entries.
          </T>
        ) : (
          recent.map((e, i) => (
            <View key={e.id}>
              {i > 0 && <Divider />}
              <View style={{ paddingVertical: 8, gap: 2 }}>
                <T variant="caption" tone="ink3" style={{ fontWeight: "400", fontVariant: ["tabular-nums"] }}>
                  {formatDateTime(e.created_at, tz)}
                </T>
                <T variant="callout">
                  <T variant="calloutStrong">{e.actor ?? "System"}</T> · {e.action}
                </T>
              </View>
            </View>
          ))
        )}
      </Card>
    </>
  );
}
