import { View } from "react-native";
import { formatDateTime, formatDay, formatTime } from "@/lib/format";
import type { Occurrence } from "@/lib/types";
import { useTheme } from "@/theme";
import { Icon } from "./Icon";
import { Button, Card, CourseTag, Pill, T } from "./ui";
import { router } from "expo-router";

export const KIND: Record<Occurrence["kind"], string> = { lecture: "Lecture", lab: "Lab", tutorial: "Tutorial" };

/** What changed about a class, in words, or null when nothing did. A "moved" class is the old
 *  slot (moved_to says where it went); a "rescheduled" one is the new slot (moved_from is the day
 *  it came from); a room change already carries the new room. */
export function changeOf(o: Occurrence, timeZone?: string): { label: string; tone: "warn" | "danger" } | null {
  const note = o.note ? `: ${o.note}` : "";
  if (o.status === "cancelled") return { label: `Cancelled${note}`, tone: "danger" };
  if (o.status === "moved") {
    return { label: o.moved_to ? `Moved to ${formatDateTime(o.moved_to, timeZone)}` : `Moved${note}`, tone: "danger" };
  }
  if (o.status === "rescheduled") {
    return {
      label: o.moved_from ? `Moved here from ${formatDay(o.moved_from, { month: "short" })}` : `Rescheduled${note}`,
      tone: "warn",
    };
  }
  if (o.status === "room_changed") return { label: `Room changed${o.note ? ` · ${o.note}` : ""}`, tone: "warn" };
  return null;
}

/** Not happening in this slot. */
export function isOff(o: Occurrence) {
  return o.status === "cancelled" || o.status === "moved";
}

export function place(o: Occurrence) {
  return o.mode === "online" ? "Online" : o.room || "Room to be confirmed";
}

/** One class in the timetable: times on the left, the card on the right; past ones fade. */
export function ClassCard({ o, timeZone, now }: { o: Occurrence; timeZone?: string; now: number }) {
  const p = useTheme();
  const done = new Date(o.ends_at).getTime() < now;
  const live = !done && new Date(o.starts_at).getTime() <= now;
  const change = changeOf(o, timeZone);
  const cancelled = isOff(o);
  const start = formatTime(o.starts_at, timeZone);
  const end = formatTime(o.ends_at, timeZone);

  return (
    <View
      // A class you teach keeps its Manage button reachable, so it isn't one merged element.
      accessible={!o.can_manage}
      accessibilityLabel={`${o.course_title}, ${o.course_code} ${o.section_code}, ${start} to ${end}, ${place(o)}${
        change ? `. ${change.label}` : ""
      }${done ? ". Done" : live ? ". On now" : ""}`}
      style={{ flexDirection: "row", gap: 12, opacity: done || cancelled ? 0.55 : 1 }}
    >
      <View style={{ width: 50, paddingTop: 14 }}>
        <T variant="bodyStrong" style={{ fontVariant: ["tabular-nums"], fontWeight: "700" }}>
          {start}
        </T>
        <T variant="caption" tone="ink3" style={{ fontWeight: "400", fontVariant: ["tabular-nums"] }}>
          {end}
        </T>
      </View>
      <Card style={{ flex: 1, gap: 6, borderColor: live ? p.accent : p.line }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <CourseTag color={o.color} label={`${o.course_code} · ${o.section_code}`} />
          {done ? (
            <T variant="caption" tone="ink3">
              Done
            </T>
          ) : live ? (
            <T variant="caption" tone="accentInk">
              On now
            </T>
          ) : (
            <T variant="caption" tone="ink3">
              {KIND[o.kind]}
            </T>
          )}
        </View>
        <T variant="headline" style={{ fontSize: 16, textDecorationLine: cancelled ? "line-through" : "none" }}>
          {o.course_title}
        </T>
        <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Icon name={o.mode === "online" ? "online" : "location"} size={14} color={p.ink2} />
            <T variant="callout" tone="ink2">
              {place(o)}
            </T>
          </View>
          {o.teachers.length ? (
            <T variant="callout" tone="ink2" numberOfLines={1}>
              {o.teachers.join(", ")}
            </T>
          ) : null}
        </View>
        {change ? <Pill label={change.label} tone={change.tone} icon={cancelled ? "close" : "swap"} /> : null}
        {o.can_manage ? (
          <Button
            label="Manage class"
            icon="pencil"
            variant="secondary"
            style={{ minHeight: 40, marginTop: 4 }}
            onPress={() => router.push({ pathname: "/class", params: { meeting: String(o.meeting_id), date: o.date } })}
          />
        ) : null}
      </Card>
    </View>
  );
}

export function dayHeading(date: string) {
  return formatDay(date);
}
