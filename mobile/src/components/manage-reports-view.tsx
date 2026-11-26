import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DownloadRow } from "@/components/files";
import { StackHeader } from "@/components/StackHeader";
import { Card, Chip, Divider, Empty, Failed, Press, Skeleton, T } from "@/components/ui";
import { formatDay, relativeTime } from "@/lib/format";
import { type Reports, useReports } from "@/lib/manage-admin";
import { useMe } from "@/lib/queries";
import { font, radius, useTheme } from "@/theme";

const PERIODS = [7, 30, 90];
const pct = (n: number | null) => (n === null ? "–" : `${n}%`);

/** The reports: the whole institution for admins, or (department) a coordinator's own
 *  departments, without the institution-only parts (feed, moderation, sync). */
export function ReportsView({ department = false }: { department?: boolean }) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const roles = useMe().data?.roles;
  const allowed = roles ? roles.includes(department ? "department_coordinator" : "institution_admin") : true;
  const [days, setDays] = useState(30);
  const report = useReports(days, department);
  const [refreshing, setRefreshing] = useState(false);
  const r = report.data;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader
        title={department ? "Department report" : "Reports"}
        subtitle={`${department ? "Your departments' sections. " : ""}Counts and rates only, never who did what`}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={p.accent}
            colors={[p.accent]}
            onRefresh={async () => {
              setRefreshing(true);
              await report.refetch();
              setRefreshing(false);
            }}
          />
        }
      >
        {!allowed ? (
          <Empty
            icon="chart"
            title="Not for you"
            body={department ? "The department report is for department coordinators." : "Reports are for your institution's admins."}
          />
        ) : (
          <>
            {/* One filter, above everything it scopes, so every number agrees. */}
            <View accessibilityRole="radiogroup" accessibilityLabel="Period" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {PERIODS.map((d) => (
                <Chip key={d} label={`Last ${d} days`} on={days === d} onPress={() => setDays(d)} />
              ))}
            </View>
            {!department ? (
              <Card style={{ paddingVertical: 6 }}>
                <DownloadRow label="Download (Excel)" path={`/api/manage/reports.csv?days=${days}`} name={`reports-${days}-days.csv`} />
              </Card>
            ) : null}

            {report.isPending ? (
              <>
                <Skeleton height={180} />
                <Skeleton height={220} />
              </>
            ) : report.isError && !r ? (
              <Failed onRetry={() => report.refetch()} />
            ) : r ? (
              <View style={{ gap: 12, opacity: report.isFetching && !refreshing ? 0.6 : 1 }}>
                <Body r={r} days={days} department={department} />
                <T variant="caption" tone="ink3" style={{ fontWeight: "400", paddingHorizontal: 4 }}>
                  {`Updated ${relativeTime(new Date(report.dataUpdatedAt).toISOString())}. Reports support decisions; they don't rank or score students or teachers.`}
                </T>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Body({ r, days, department }: { r: Reports; days: number; department: boolean }) {
  const bucket = (label: string) =>
    days <= 7
      ? formatDay(label, { weekday: "short", day: "numeric", month: "short" })
      : `Week of ${formatDay(label, { weekday: undefined, day: "numeric", month: "short" })}`;
  const reached = r.notices.reduce((n, x) => n + x.reached, 0);
  const read = r.notices.reduce((n, x) => n + x.read, 0);

  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <StatTile
          label="Signed in"
          value={String(r.people.active.students + r.people.active.teachers + r.people.active.staff)}
          detail={`${r.people.active.students} of ${r.people.students} students · ${r.people.active.teachers} of ${r.people.teachers} teachers`}
        />
        <StatTile label="Notices read" value={reached ? pct(Math.round((100 * read) / reached)) : "–"} detail={`${read} of ${reached} deliveries opened`} />
        <StatTile label="Work handed in" value={pct(r.assignments.submission_rate)} detail={`Across ${r.assignments.rows.length} assignments due`} />
        {r.attendance ? (
          <StatTile label="Attendance" value={pct(r.attendance.rate)} detail="Late counts as attended" />
        ) : department ? (
          <StatTile label="Students" value={String(r.people.students)} detail={`${r.people.teachers} teachers`} />
        ) : (
          <StatTile label="Open reports" value={String(r.moderation.open)} detail="Waiting for a moderator" />
        )}
      </View>

      <Card style={{ gap: 18 }}>
        <T variant="headline" accessibilityRole="header">
          Activity
        </T>
        {r.activity.map((a) => (
          <ColumnChart key={a.key} title={a.label} points={a.points} formatLabel={bucket} />
        ))}
      </Card>

      <Card style={{ gap: 12 }}>
        <T variant="headline" accessibilityRole="header">
          Notices and how many were read
        </T>
        {r.notices.length === 0 ? (
          <T variant="callout" tone="ink2">
            No notices in this period.
          </T>
        ) : (
          r.notices.map((n) => (
            <View key={n.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                <T variant="calloutStrong" numberOfLines={1} style={{ flex: 1 }}>
                  {n.title}
                </T>
                <T variant="caption" tone="ink2">
                  {n.read} of {n.reached}
                </T>
              </View>
              <Meter value={n.read_rate} label={`${n.title}: read by ${pct(n.read_rate)}`} />
            </View>
          ))
        )}
      </Card>

      <Card style={{ gap: 12 }}>
        <T variant="headline" accessibilityRole="header">
          Work handed in
        </T>
        {r.assignments.rows.length === 0 ? (
          <T variant="callout" tone="ink2">
            Nothing was due in this period.
          </T>
        ) : (
          r.assignments.rows.map((a) => (
            <Press
              key={a.id}
              accessibilityRole="link"
              accessibilityLabel={`${a.title}, ${a.section}. ${a.submitted} of ${a.students} handed in`}
              scaleTo={0.99}
              onPress={() => router.push({ pathname: "/assignment/[id]", params: { id: String(a.id) } })}
              style={{ gap: 6 }}
            >
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                <T variant="calloutStrong" tone="accentInk" numberOfLines={1} style={{ flex: 1 }}>
                  {a.title}
                </T>
                <T variant="caption" tone="ink2">
                  {a.section}
                </T>
              </View>
              <Meter value={a.submission_rate} label={`${a.title}: ${pct(a.submission_rate)} handed in`} />
              <T variant="caption" tone="ink2" style={{ fontWeight: "400" }}>
                {a.submitted} of {a.students} handed in{a.late ? ` · ${a.late} late` : ""} · {a.graded} graded
                {a.released ? " · grades released" : ""}
              </T>
            </Press>
          ))
        )}
      </Card>

      {r.attendance ? (
        <Card style={{ gap: 12 }}>
          <T variant="headline" accessibilityRole="header">
            Attendance by section
          </T>
          {r.attendance.sections.length === 0 ? (
            <T variant="callout" tone="ink2">
              No attendance recorded in this period.
            </T>
          ) : (
            r.attendance.sections.map((s) => (
              <View key={s.section} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                  <T variant="calloutStrong" style={{ flex: 1 }}>
                    {s.section}
                  </T>
                  <T variant="caption" tone="ink2">
                    {s.records} marks
                  </T>
                </View>
                <Meter value={s.rate} label={`${s.section}: ${pct(s.rate)} attended`} />
              </View>
            ))
          )}
        </Card>
      ) : null}

      <Card style={{ gap: 10 }}>
        <View>
          <T variant="headline" accessibilityRole="header">
            Course resources
          </T>
          <T variant="callout" tone="ink2">
            {r.resources.downloads} downloads by {r.resources.people} {r.resources.people === 1 ? "person" : "people"}
          </T>
        </View>
        {r.resources.top.length === 0 ? (
          <T variant="callout" tone="ink2">
            Nothing downloaded in this period.
          </T>
        ) : (
          r.resources.top.map((t, i) => (
            <View key={`${t.course}-${t.title}`} style={{ gap: 10 }}>
              {i > 0 ? <Divider /> : null}
              <View
                accessible
                accessibilityLabel={`${t.title}, ${t.course}: ${t.downloads} downloads by ${t.people} people`}
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <View style={{ flex: 1 }}>
                  <T variant="calloutStrong" numberOfLines={1}>
                    {t.title}
                  </T>
                  <T variant="caption" tone="ink2" numberOfLines={1} style={{ fontWeight: "400" }}>
                    {t.course}
                  </T>
                </View>
                <Figure value={t.downloads} label="Downloads" />
                <Figure value={t.people} label="People" />
              </View>
            </View>
          ))
        )}
      </Card>

      {!department ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <StatTile
            label="Feed"
            value={`${r.feed.posts} posts`}
            detail={`${r.feed.comments} comments · ${r.feed.people} ${r.feed.people === 1 ? "person" : "people"} posted`}
          />
          <StatTile
            label="Moderation"
            value={`${r.moderation.resolved} resolved`}
            detail={`${r.moderation.reported} reported · ${r.moderation.open} open${
              r.moderation.median_hours !== null ? ` · median ${r.moderation.median_hours} h to resolve` : ""
            }`}
          />
          <StatTile
            label="Sync"
            value={`${r.sync.applied} applied`}
            detail={`${r.sync.waiting} waiting for review · ${r.sync.sources} sources${r.sync.failing ? ` · ${r.sync.failing} failing` : ""}`}
          />
        </View>
      ) : null}
    </>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ alignItems: "flex-end", minWidth: 58 }}>
      <T variant="bodyStrong" style={{ fontVariant: ["tabular-nums"] }}>
        {value}
      </T>
      <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
        {label}
      </T>
    </View>
  );
}

/** A number with what it counts: half the width on a phone, two to a row. */
function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card style={{ flexGrow: 1, flexBasis: "45%", gap: 4 }}>
      <T variant="caption" tone="ink2">
        {label}
      </T>
      <T variant="title" style={{ fontVariant: ["tabular-nums"] }}>
        {value}
      </T>
      <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
        {detail}
      </T>
    </Card>
  );
}

/** A rate from 0 to 100 as a filled bar; an empty track when there's nothing to count. */
function Meter({ value, label }: { value: number | null; label: string }) {
  const p = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={value === null ? undefined : { min: 0, max: 100, now: value }}
      style={{ height: 8, borderRadius: radius.pill, backgroundColor: p.fill, overflow: "hidden" }}
    >
      {value !== null ? (
        <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", borderRadius: radius.pill, backgroundColor: p.accent }} />
      ) : null}
    </View>
  );
}

/** Columns for a count over time, with the first and last period named under them. */
function ColumnChart({
  title,
  points,
  formatLabel,
}: {
  title: string;
  points: { label: string; value: number }[];
  formatLabel: (label: string) => string;
}) {
  const p = useTheme();
  const max = Math.max(1, ...points.map((x) => x.value));
  const total = points.reduce((n, x) => n + x.value, 0);
  const H = 96;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <T variant="calloutStrong" style={{ flex: 1 }}>
          {title}
        </T>
        <T variant="caption" tone="ink2" style={{ fontVariant: ["tabular-nums"] }}>
          {total} in all
        </T>
      </View>
      <View
        accessible
        accessibilityLabel={`${title}: ${points.map((x) => `${formatLabel(x.label)}, ${x.value}`).join("; ")}`}
        style={{ height: H, flexDirection: "row", alignItems: "flex-end", gap: points.length > 14 ? 2 : 4 }}
      >
        {points.map((x) => (
          <View
            key={x.label}
            style={{
              flex: 1,
              height: x.value ? Math.max(3, (x.value / max) * H) : 2,
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
              backgroundColor: x.value ? p.accent : p.line,
            }}
          />
        ))}
      </View>
      {points.length > 0 ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }} importantForAccessibility="no-hide-descendants">
          <T variant="caption" tone="ink3" style={{ fontFamily: font.regular }}>
            {formatLabel(points[0].label)}
          </T>
          {points.length > 1 ? (
            <T variant="caption" tone="ink3" style={{ fontFamily: font.regular }}>
              {formatLabel(points[points.length - 1].label)}
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
