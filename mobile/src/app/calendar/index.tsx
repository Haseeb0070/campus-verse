import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, SectionList, View } from "react-native";
import { eventDay, EventRow } from "@/components/events";
import { StackHeader } from "@/components/StackHeader";
import { Icon } from "@/components/Icon";
import { Card, Chip, CourseTag, Empty, Failed, IconButton, Press, Skeleton, T } from "@/components/ui";
import { CATEGORY_LABEL, type CampusEvent, type EventCategory, useEventAudiences, useEvents } from "@/lib/events";
import { addDays, formatDay, formatTime, todayIn } from "@/lib/format";
import { useAssignments, useMe } from "@/lib/queries";
import type { Assignment } from "@/lib/types";
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

type Item = { kind: "event"; e: CampusEvent } | { kind: "due"; a: Assignment };
const itemKey = (i: Item) => (i.kind === "event" ? `e${i.e.id}` : `a${i.a.id}`);
const itemAt = (i: Item) => (i.kind === "event" ? i.e.starts_at : i.a.due_at);

/** Exams, deadlines, events and holidays for the next four months, a day at a time, with work due. */
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
  // Coursework due shows with the deadlines, as on the website's calendar.
  const work = useAssignments().data;
  // Teachers and staff who may put events in front of someone get the add button.
  const canAdd = (useEventAudiences().data?.length ?? 0) > 0;

  const sections = useMemo(() => {
    const keep = (e: CampusEvent) =>
      filter === "all" ? true : filter === "mine" ? e.my_status !== null : e.category === filter;
    const showWork = filter === "all" || filter === "deadline";
    const items: Item[] = [
      ...(query.data ?? []).filter(keep).map((e) => ({ kind: "event" as const, e })),
      ...(showWork ? (work ?? []) : [])
        .filter((a) => a.status === "published" && a.due_at >= range.start && a.due_at < range.end)
        .map((a) => ({ kind: "due" as const, a })),
    ].sort((x, y) => itemAt(x).localeCompare(itemAt(y)));
    const byDay = new Map<string, Item[]>();
    for (const item of items) {
      // An event that started before today and is still on shows under today.
      const own = item.kind === "event" ? eventDay(item.e, tz) : todayIn(tz, new Date(item.a.due_at));
      const day = own < today ? today : own;
      byDay.set(day, [...(byDay.get(day) ?? []), item]);
    }
    return [...byDay.entries()].map(([day, data]) => ({ day, data }));
  }, [query.data, work, filter, tz, today, range]);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader
        title="Calendar"
        subtitle="Exams, deadlines, events and holidays"
        actions={canAdd ? <IconButton icon="plus" label="Add an event" variant="plain" onPress={() => router.push("/calendar/edit")} /> : undefined}
      />
      <SectionList
        sections={sections}
        keyExtractor={itemKey}
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
        renderItem={({ item }) => (item.kind === "event" ? <EventRow e={item.e} tz={tz} /> : <DueRow a={item.a} tz={tz} />)}
        ListEmptyComponent={
          query.isPending ? (
            <View style={{ gap: 10, marginTop: 16 }}>
              <Skeleton height={88} />
              <Skeleton height={88} />
            </View>
          ) : query.isError && !query.data ? (
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

/** Coursework due that day: the subject, the title and the time, opening the assignment. */
function DueRow({ a, tz }: { a: Assignment; tz?: string }) {
  const p = useTheme();
  const done = (a.my_attempts ?? 0) > 0;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`${a.title}, ${a.course_code}, due ${formatTime(a.due_at, tz)}${done ? ", handed in" : ""}`}
      onPress={() => router.push({ pathname: "/assignment/[id]", params: { id: String(a.id) } })}
    >
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: p.warnBg, alignItems: "center", justifyContent: "center" }}>
          <Icon name="clipboard" size={20} color={p.warnInk} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <CourseTag color={a.color} label={a.course_code} />
          <T variant="bodyStrong" numberOfLines={2}>
            {a.title}
          </T>
          <T variant="callout" tone="ink3">
            Due {formatTime(a.due_at, tz)}
            {a.can_manage ? "" : done ? " · handed in" : ""}
          </T>
        </View>
        <Icon name="chevron" size={16} color={p.ink3} />
      </Card>
    </Press>
  );
}
