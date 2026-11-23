import { router } from "expo-router";
import { View } from "react-native";
import type { CampusEvent, EventCategory } from "@/lib/events";
import { formatDay, formatTime, todayIn } from "@/lib/format";
import { font, type Palette, radius, useTheme } from "@/theme";
import { Icon } from "./Icon";
import { Card, Pill, Press, T } from "./ui";

/** A category's colours: exams in red, holidays in green, deadlines in amber, the rest accent. */
export function categoryTone(category: EventCategory, p: Palette) {
  if (category === "exam") return { bg: p.dangerSoft, fg: p.danger };
  if (category === "deadline") return { bg: p.warnBg, fg: p.warnInk };
  if (category === "holiday") return { bg: p.fill, fg: p.success };
  return { bg: p.accentSoft, fg: p.accentInk };
}

/** The event's day key (YYYY-MM-DD) in the college's time zone. */
export function eventDay(e: CampusEvent, tz?: string) {
  return todayIn(tz, new Date(e.starts_at));
}

export function whenText(e: CampusEvent, tz?: string) {
  const startDay = eventDay(e, tz);
  const endDay = todayIn(tz, new Date(e.ends_at));
  const day = (d: string) => formatDay(d, { weekday: "short", month: "short" });
  if (e.all_day) return startDay === endDay ? `${day(startDay)}, all day` : `${day(startDay)} – ${day(endDay)}`;
  const span = `${formatTime(e.starts_at, tz)} – ${formatTime(e.ends_at, tz)}`;
  return startDay === endDay ? `${day(startDay)}, ${span}` : `${day(startDay)} ${formatTime(e.starts_at, tz)} – ${day(endDay)} ${formatTime(e.ends_at, tz)}`;
}

export function whereText(e: CampusEvent) {
  if (e.mode === "online") return "Online";
  if (e.mode === "hybrid") return e.location ? `${e.location} and online` : "In person and online";
  return e.location;
}

/** One event in a list: a date tile, the title and when and where, and your place if you have one. */
export function EventRow({ e, tz }: { e: CampusEvent; tz?: string }) {
  const p = useTheme();
  const tone = categoryTone(e.category, p);
  const day = eventDay(e, tz);
  const cancelled = e.status === "cancelled";
  const where = whereText(e);
  return (
    <Press
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={`${e.category_label}: ${e.title}. ${whenText(e, tz)}${where ? `, ${where}` : ""}.${
        cancelled ? " Cancelled." : e.my_status === "going" ? " You're going." : e.my_status === "waitlisted" ? " You're on the waitlist." : ""
      }`}
      onPress={() => router.push({ pathname: "/calendar/[id]", params: { id: String(e.id) } })}
    >
      <Card style={{ flexDirection: "row", gap: 12, alignItems: "center", opacity: cancelled ? 0.6 : 1 }}>
        <View style={{ width: 48, borderRadius: radius.md, backgroundColor: tone.bg, alignItems: "center", paddingVertical: 6 }}>
          <T variant="caption" style={{ color: tone.fg, fontFamily: font.bold, textTransform: "uppercase", fontSize: 11 }}>
            {formatDay(day, { weekday: undefined, day: undefined, month: "short" })}
          </T>
          <T style={{ color: tone.fg, fontFamily: font.bold, fontSize: 20, lineHeight: 24 }}>{Number(day.slice(8))}</T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="caption" style={{ color: tone.fg, fontFamily: font.bold }}>
            {e.category_label}
          </T>
          <T variant="bodyStrong" numberOfLines={2} style={{ textDecorationLine: cancelled ? "line-through" : "none" }}>
            {e.title}
          </T>
          <T variant="callout" tone="ink3" numberOfLines={1}>
            {e.all_day ? "All day" : `${formatTime(e.starts_at, tz)} – ${formatTime(e.ends_at, tz)}`}
            {where ? ` · ${where}` : ""}
          </T>
          {cancelled ? (
            <Pill label="Cancelled" tone="danger" />
          ) : e.my_status === "going" ? (
            <Pill label="You're going" tone="success" icon="check" />
          ) : e.my_status === "waitlisted" ? (
            <Pill label={`Waitlist${e.my_waitlist_position ? ` · #${e.my_waitlist_position}` : ""}`} tone="warn" />
          ) : null}
        </View>
        <Icon name="chevron" size={16} color={p.ink3} />
      </Card>
    </Press>
  );
}
