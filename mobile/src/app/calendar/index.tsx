import { useMemo, useState } from "react";
import { ScrollView, SectionList, View } from "react-native";
import { eventDay, EventRow } from "@/components/events";
import { StackHeader } from "@/components/StackHeader";
import { Chip, Empty, Failed, Skeleton, T } from "@/components/ui";
import { CATEGORY_LABEL, type CampusEvent, type EventCategory, useEvents } from "@/lib/events";
import { addDays, formatDay, todayIn } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { useTheme } from "@/theme";

type Filter = "all" | "mine" | EventCategory;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "mine", label: "Signed up" },
  { key: "exam", label: CATEGORY_LABEL.exam },
  { key: "deadline", label: CATEGORY_LABEL.deadline },
  { key: "event", label: CATEGORY_LABEL.event },
  { key: "seminar", label: CATEGORY_LABEL.seminar },
  { key: "workshop", label: CATEGORY_LABEL.workshop },
  { key: "holiday", label: CATEGORY_LABEL.holiday },
];

/** Exams, deadlines, events and holidays for the next four months, a day at a time. */
export default function Calendar() {
  const p = useTheme();
  const tz = useMe().data?.institution?.timezone;
  const today = todayIn(tz);
  const [filter, setFilter] = useState<Filter>("all");
  const [range] = useState(() => ({
    start: new Date(`${today}T00:00:00`).toISOString(),
    end: new Date(`${addDays(today, 120)}T00:00:00`).toISOString(),
  }));
  const query = useEvents(range.start, range.end);

  const sections = useMemo(() => {
    const keep = (e: CampusEvent) =>
      filter === "all" ? true : filter === "mine" ? e.my_status !== null : e.category === filter;
    const byDay = new Map<string, CampusEvent[]>();
    for (const e of (query.data ?? []).filter(keep).sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
      // An event that started before today and is still on shows under today.
      const day = eventDay(e, tz) < today ? today : eventDay(e, tz);
      byDay.set(day, [...(byDay.get(day) ?? []), e]);
    }
    return [...byDay.entries()].map(([day, data]) => ({ day, data }));
  }, [query.data, filter, tz, today]);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Calendar" subtitle="Exams, deadlines, events and holidays" />
      <SectionList
        sections={sections}
        keyExtractor={(e) => String(e.id)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        onRefresh={() => query.refetch()}
        refreshing={query.isRefetching}
        ListHeaderComponent={
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
            {FILTERS.map((f) => (
              <Chip key={f.key} label={f.label} on={filter === f.key} onPress={() => setFilter(f.key)} />
            ))}
          </ScrollView>
        }
        renderSectionHeader={({ section }) => (
          <T variant="calloutStrong" tone="ink2" accessibilityRole="header" style={{ marginTop: 16, marginBottom: 8, paddingHorizontal: 4 }}>
            {section.day === today
              ? "Today"
              : section.day === addDays(today, 1)
                ? "Tomorrow"
                : formatDay(section.day, { month: "long" })}
          </T>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => <EventRow e={item} tz={tz} />}
        ListEmptyComponent={
          query.isPending ? (
            <View style={{ gap: 10, marginTop: 16 }}>
              <Skeleton height={88} />
              <Skeleton height={88} />
            </View>
          ) : query.isError ? (
            <Failed onRetry={() => query.refetch()} />
          ) : (
            <Empty
              icon="calendar"
              title={filter === "all" ? "Nothing coming up" : "Nothing here"}
              body={
                filter === "mine"
                  ? "Events you sign up for show here."
                  : filter === "all"
                    ? "Exams, deadlines and campus events for the next four months show here."
                    : "Try another filter."
              }
            />
          )
        }
      />
    </View>
  );
}
