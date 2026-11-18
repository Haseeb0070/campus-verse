import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn } from "react-native-reanimated";
import { ClassCard, isOff } from "@/components/classes";
import { HeaderActions, Screen } from "@/components/Screen";
import { Empty, Failed, IconButton, Skeleton, T } from "@/components/ui";
import { addDays, formatDay, formatTime, startOfWeek, todayIn } from "@/lib/format";
import { useNow } from "@/lib/now";
import { useMe, useTimetable } from "@/lib/queries";
import { font, radius, useTheme } from "@/theme";

export default function Timetable() {
  const p = useTheme();
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const now = useNow();

  const today = todayIn(tz, new Date(now));
  const [day, setDay] = useState(today);
  const week = startOfWeek(day);
  const query = useTimetable(me ? week : null, 7);

  const days = useMemo(() => {
    const all = Array.from({ length: 7 }, (_, i) => addDays(week, i));
    // Sunday only when something is on it.
    return query.data?.some((o) => o.date === all[6]) ? all : all.slice(0, 6);
  }, [week, query.data]);

  const list = (query.data ?? []).filter((o) => o.date === day);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    query.data?.forEach((o) => !isOff(o) && c.set(o.date, (c.get(o.date) ?? 0) + 1));
    return c;
  }, [query.data]);

  function move(by: number) {
    const target = addDays(day, by);
    setDay(target);
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
  }

  // Swipe sideways over the classes to step a day.
  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-24, 24])
    .failOffsetY([-14, 14])
    .onEnd((e) => {
      if (Math.abs(e.translationX) < 60 && Math.abs(e.velocityX) < 500) return;
      move(e.translationX < 0 ? 1 : -1);
    });

  // Where "now" falls among today's classes.
  const nowIndex = day === today ? list.findIndex((o) => new Date(o.ends_at).getTime() >= now) : -1;
  const showNow = day === today && list.length > 0;

  return (
    <Screen
      eyebrow={`Week of ${formatDay(week, { weekday: undefined })}`}
      title="Timetable"
      actions={<HeaderActions />}
      refreshKeys={[["timetable"]]}
      below={
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
          <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 6 }}>
            {days.map((d) => {
              const on = d === day;
              const isToday = d === today;
              const n = counts.get(d) ?? 0;
              return (
                <Pressable
                  key={d}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${formatDay(d)}${isToday ? ", today" : ""}, ${n} ${n === 1 ? "class" : "classes"}`}
                  onPress={() => setDay(d)}
                  style={{
                    flex: 1,
                    minHeight: 58,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: on ? p.accent : isToday ? p.accentInk : p.line,
                    backgroundColor: on ? p.accent : p.surface,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                  }}
                >
                  <Text style={{ fontFamily: font.semibold, fontSize: 12, color: on ? p.onAccent : p.ink2 }}>
                    {formatDay(d, { weekday: "short", day: undefined, month: undefined })}
                  </Text>
                  <Text style={{ fontFamily: font.bold, fontSize: 17, color: on ? p.onAccent : p.ink }}>{Number(d.slice(8))}</Text>
                  <View style={{ flexDirection: "row", gap: 2, height: 4 }}>
                    {Array.from({ length: Math.min(n, 4) }).map((_, i) => (
                      <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: on ? p.onAccent : p.ink3 }} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <IconButton icon="back" label="Previous week" variant="plain" size={40} onPress={() => setDay(addDays(day, -7))} />
            <Pressable accessibilityRole="button" disabled={day === today} onPress={() => setDay(today)} hitSlop={8}>
              <T variant="calloutStrong" tone={day === today ? "ink3" : "accentInk"}>
                {day === today ? formatDay(day) : `Back to today`}
              </T>
            </Pressable>
            <IconButton icon="chevron" label="Next week" variant="plain" size={40} onPress={() => setDay(addDays(day, 7))} />
          </View>
        </View>
      }
    >
      <GestureDetector gesture={swipe}>
        <View style={{ paddingHorizontal: 16, gap: 12, minHeight: 360 }}>
          {query.isPending ? (
            <>
              <Skeleton height={110} />
              <Skeleton height={110} />
              <Skeleton height={110} />
            </>
          ) : query.isError ? (
            <Failed onRetry={() => query.refetch()} />
          ) : list.length === 0 ? (
            <Empty icon="calendar" title="No classes" body={`Nothing on ${formatDay(day, { month: undefined })}. Swipe for other days.`} />
          ) : (
            <Animated.View key={day} entering={FadeIn.duration(180)} style={{ gap: 12 }}>
              {list.map((o, i) => (
                <View key={`${o.meeting_id}-${o.starts_at}`} style={{ gap: 12 }}>
                  {showNow && i === nowIndex ? <NowLine time={formatTime(new Date(now).toISOString(), tz)} /> : null}
                  <ClassCard o={o} timeZone={tz} now={now} />
                </View>
              ))}
              {showNow && nowIndex === -1 ? <NowLine time={formatTime(new Date(now).toISOString(), tz)} /> : null}
            </Animated.View>
          )}
        </View>
      </GestureDetector>
    </Screen>
  );
}

function NowLine({ time }: { time: string }) {
  const p = useTheme();
  return (
    <View accessibilityLabel={`Now, ${time}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.accent }} />
      <View style={{ flex: 1, height: 2, borderRadius: radius.pill, backgroundColor: p.accent }} />
      <T variant="caption" tone="accentInk" style={{ fontFamily: font.bold }}>
        Now · {time}
      </T>
    </View>
  );
}
