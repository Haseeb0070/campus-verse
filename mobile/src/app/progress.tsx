import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StackHeader } from "@/components/StackHeader";
import { Card, CourseTag, Divider, Empty, Failed, Skeleton, T } from "@/components/ui";
import { type CourseProgress, useProgress } from "@/lib/queries";
import { courseTone, font, radius, useTheme } from "@/theme";

export default function Progress() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const query = useProgress();

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Progress" subtitle="Released marks and attendance" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32 }}>
        {query.isPending ? (
          <>
            <Skeleton height={180} />
            <Skeleton height={180} />
          </>
        ) : query.isError ? (
          <Failed onRetry={() => query.refetch()} />
        ) : !query.data?.length ? (
          <Empty icon="chart" title="Nothing yet" body="Marks and attendance show here once your teachers release them." />
        ) : (
          query.data.map((c) => <CourseCard key={c.section_id} c={c} />)
        )}
      </ScrollView>
    </View>
  );
}

function CourseCard({ c }: { c: CourseProgress }) {
  const p = useTheme();
  const tone = courseTone(c.color, p);
  const pct = c.points !== null && c.max_points ? Math.round((Number(c.points) / c.max_points) * 100) : null;
  const att = c.attendance;

  return (
    <Card style={{ gap: 12 }}>
      <View>
        <CourseTag color={c.color} label={`${c.course_code} · ${c.section_code}`} />
        <T variant="headline" style={{ marginTop: 4 }}>
          {c.course_title}
        </T>
        <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
          {c.term}
        </T>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Figure
          label="Marks so far"
          value={c.points !== null ? `${trim(c.points)} / ${c.max_points}` : "—"}
          sub={pct !== null ? `${pct}%` : "None released"}
        />
        <Figure
          label="Attendance"
          value={att?.rate != null ? `${att.rate}%` : "—"}
          sub={att ? `${att.present + att.late} of ${att.sessions} classes` : "Not shared"}
        />
      </View>

      {pct !== null ? (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: pct }}
          style={{ height: 8, borderRadius: radius.pill, backgroundColor: p.fill, overflow: "hidden" }}
        >
          <View style={{ width: `${Math.min(100, pct)}%`, height: "100%", backgroundColor: tone.dot, borderRadius: radius.pill }} />
        </View>
      ) : null}

      {c.assignments.length ? (
        <View>
          {c.assignments.map((a, i) => (
            <View key={a.id}>
              {i > 0 && <Divider />}
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, gap: 10 }}>
                <T variant="callout" style={{ flex: 1 }}>
                  {a.title}
                </T>
                <T variant="calloutStrong" tone={a.points === null ? "ink3" : "ink"} style={{ fontVariant: ["tabular-nums"] }}>
                  {a.points === null ? "Not released" : `${trim(a.points)} / ${a.max_points}`}
                </T>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {att && (att.absent || att.excused) ? (
        <T variant="callout" tone="ink3">
          {att.absent} absent{att.late ? `, ${att.late} late` : ""}
          {att.excused ? `, ${att.excused} excused` : ""}.
        </T>
      ) : null}
      {[c.grades_source, c.attendance_source].filter(Boolean).map((line) => (
        <T key={line} variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
          {line}
        </T>
      ))}
    </Card>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
  const p = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: p.fill, borderRadius: 14, padding: 12, gap: 2 }}>
      <T variant="caption" tone="ink3">
        {label}
      </T>
      <T style={{ fontFamily: font.display, fontSize: 24, color: p.ink, fontVariant: ["tabular-nums"] }}>{value}</T>
      <T variant="caption" tone="ink2" style={{ fontWeight: "400" }}>
        {sub}
      </T>
    </View>
  );
}

/** "18.50" → "18.5", "20.00" → "20". */
function trim(points: string | number) {
  return String(Number(points));
}
