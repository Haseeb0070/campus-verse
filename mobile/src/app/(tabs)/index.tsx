import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, View } from "react-native";
import { changeOf, isOff, KIND, place } from "@/components/classes";
import { AdminToday } from "@/components/AdminToday";
import { Icon } from "@/components/Icon";
import { HeaderActions, Screen } from "@/components/Screen";
import { Button, Card, CourseTag, Divider, Failed, Pill, Press, SectionHeader, Skeleton, T } from "@/components/ui";
import { useConversations } from "@/lib/chat";
import { useNow } from "@/lib/now";
import { addDays, formatDay, formatTime, greeting, minutesUntil, relativeTime, todayIn } from "@/lib/format";
import { useAssignments, useMe, useNextClass, useNotices, useTimetable } from "@/lib/queries";
import type { Assignment, Conversation, Notice, Occurrence } from "@/lib/types";
import { ConversationRow } from "@/components/conversations";
import { EventRow } from "@/components/events";
import { useEvents } from "@/lib/events";
import { useFeed } from "@/lib/feed";
import { courseTone, font, radius, useTheme } from "@/theme";

export default function Today() {
  const me = useMe().data;
  // An admin with no classes of their own gets the college at a glance, not an empty timetable.
  if (me && me.sections.length === 0 && me.roles.includes("institution_admin")) return <AdminToday />;
  return <ClassToday />;
}

function ClassToday() {
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const now = useNow();
  const today = todayIn(tz, new Date(now));

  const next = useNextClass();
  const classes = useTimetable(me ? today : null, 1);
  const work = useAssignments();
  const chats = useConversations();
  const notices = useNotices(3);

  const firstName = me?.preferred_name || me?.first_name;
  // Verse perks up when a class is about to start.
  const soon = next.data && new Date(next.data.starts_at).getTime() > now && minutesUntil(next.data.starts_at, now) <= 15;

  return (
    <Screen
      eyebrow={formatDay(today, { weekday: undefined })}
      title={formatDay(today, { day: undefined, month: undefined })}
      actions={<HeaderActions profile />}
      verse={soon ? "excited" : "happy"}
      refreshKeys={[["timetable"], ["assignments"], ["chat"], ["notices"], ["notifications"]]}
    >
      <View style={{ paddingHorizontal: 16, gap: 26 }}>
        {firstName ? (
          <T variant="body" tone="ink2" style={{ marginTop: -8, paddingHorizontal: 4 }}>
            {greeting(tz, new Date(now))}, {firstName}.
          </T>
        ) : null}

        {next.isPending ? (
          <Skeleton height={250} style={{ borderRadius: radius.xl }} />
        ) : next.isError ? (
          <Failed onRetry={() => next.refetch()} />
        ) : next.data ? (
          <UpNext o={next.data} tz={tz} today={today} now={now} chats={chats.data} />
        ) : (
          <NothingNext />
        )}

        <View>
          <SectionHeader title="Rest of today" action="Week" onAction={() => router.navigate("/timetable")} />
          {classes.isPending ? (
            <Skeleton height={180} />
          ) : classes.isError ? (
            <Failed onRetry={() => classes.refetch()} />
          ) : classes.data?.length ? (
            <TodayList list={classes.data} tz={tz} now={now} nextId={next.data?.date === today ? next.data : null} />
          ) : (
            <Card>
              <T variant="body" tone="ink2">
                No classes today.
              </T>
            </Card>
          )}
        </View>

        <DueSoon list={work.data} pending={work.isPending} tz={tz} />
        <ComingUp tz={tz} today={today} />
        <RecentChats list={chats.data} pending={chats.isPending} tz={tz} />
        <FeedPeek />
        <LatestNotice list={notices.data} pending={notices.isPending} />
      </View>
    </Screen>
  );
}

function UpNext({
  o,
  tz,
  today,
  now,
  chats,
}: {
  o: Occurrence;
  tz?: string;
  today: string;
  now: number;
  chats?: Conversation[];
}) {
  const p = useTheme();
  const starts = new Date(o.starts_at).getTime();
  const onNow = starts <= now;
  const mins = minutesUntil(o.starts_at, now);
  const when = onNow
    ? "On now"
    : o.date === today
      ? mins < 60
        ? `Up next · in ${mins} min`
        : `Up next · ${relativeTime(o.starts_at, now)}`
      : o.date === addDays(today, 1)
        ? "Up next · Tomorrow"
        : `Up next · ${formatDay(o.date, { day: undefined, month: undefined })}`;
  const change = changeOf(o, tz);
  const chat = chats?.find((c) => c.kind === "section" && c.section_id === o.section_id);
  const teacher = o.teachers[0];

  return (
    <View
      accessibilityLabel={`${when}. ${o.course_title}, ${KIND[o.kind]}${teacher ? ` with ${teacher}` : ""}, ${formatTime(
        o.starts_at,
        tz,
      )} to ${formatTime(o.ends_at, tz)}, ${place(o)}.${change ? ` ${change.label}.` : ""}`}
      style={{ backgroundColor: p.field, borderRadius: radius.xl, padding: 20, gap: 16 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <T variant="caption" tone="onFieldMuted" style={{ letterSpacing: 0.3 }}>
          {when}
        </T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: p.fieldLine, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: courseTone(o.color, p).dot }} />
          <T variant="caption" tone="onField" style={{ fontFamily: font.bold }}>
            {o.course_code} · {o.section_code}
          </T>
        </View>
      </View>
      <View>
        <T tone="onField" style={{ fontFamily: font.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.5 }}>
          {o.course_title}
        </T>
        <T variant="body" tone="onFieldMuted" style={{ marginTop: 2 }}>
          {KIND[o.kind]}
          {teacher ? ` with ${teacher}` : ""}
        </T>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Fact icon="clock" label="Time" value={`${formatTime(o.starts_at, tz)} – ${formatTime(o.ends_at, tz)}`} />
        <Fact icon={o.mode === "online" ? "online" : "location"} label={o.mode === "online" ? "Online" : "Room"} value={place(o)} />
      </View>
      {change ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: p.warnBg, borderRadius: 12, padding: 10 }}>
          <Icon name="swap" size={16} color={p.warnInk} />
          <T variant="calloutStrong" style={{ color: p.warnInk, flex: 1 }}>
            {change.label}
          </T>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 10 }}>
        {chat ? (
          <Button
            label="Section chat"
            icon="chat"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: "/chat/[id]", params: { id: String(chat.id) } })}
          />
        ) : null}
        {o.mode === "online" && o.online_url ? (
          <Button label="Join" variant="field" style={{ flex: 1 }} onPress={() => Linking.openURL(o.online_url)} />
        ) : (
          <Button label="Timetable" variant="field" style={{ flex: chat ? 0 : 1 }} onPress={() => router.navigate("/timetable")} />
        )}
      </View>
    </View>
  );
}

function Fact({ icon, label, value }: { icon: "clock" | "location" | "online"; label: string; value: string }) {
  const p = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: p.fieldLine, padding: 12, gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name={icon} size={14} color={p.onFieldMuted} />
        <T variant="caption" tone="onFieldMuted">
          {label}
        </T>
      </View>
      <T tone="onField" style={{ fontFamily: font.bold, fontSize: 17, fontVariant: ["tabular-nums"] }} numberOfLines={1}>
        {value}
      </T>
    </View>
  );
}

function NothingNext() {
  const p = useTheme();
  return (
    <View style={{ backgroundColor: p.field, borderRadius: radius.xl, padding: 20, gap: 6 }}>
      <T variant="caption" tone="onFieldMuted">
        Up next
      </T>
      <T tone="onField" style={{ fontFamily: font.display, fontSize: 26 }}>
        Nothing scheduled
      </T>
      <T variant="body" tone="onFieldMuted">
        No more classes coming up this week. Enjoy the quiet.
      </T>
    </View>
  );
}

function TodayList({ list, tz, now, nextId }: { list: Occurrence[]; tz?: string; now: number; nextId: Occurrence | null }) {
  const p = useTheme();
  return (
    <Card padded={false}>
      {list.map((o, i) => {
        const done = new Date(o.ends_at).getTime() < now;
        const isNext = nextId?.meeting_id === o.meeting_id && nextId.starts_at === o.starts_at;
        const cancelled = isOff(o);
        return (
          <View key={`${o.meeting_id}-${o.starts_at}`}>
            {i > 0 && <Divider />}
            <Press
              scaleTo={0.99}
              accessibilityRole="button"
              accessibilityLabel={`${formatTime(o.starts_at, tz)}, ${o.course_title}, ${place(o)}${cancelled ? ", cancelled" : done ? ", done" : isNext ? ", next" : ""}`}
              onPress={() => router.navigate("/timetable")}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 14, opacity: done || cancelled ? 0.55 : 1 }}
            >
              <View style={{ width: 46 }}>
                <T variant="bodyStrong" style={{ fontVariant: ["tabular-nums"], fontWeight: "700" }}>
                  {formatTime(o.starts_at, tz)}
                </T>
                <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
                  {formatTime(o.ends_at, tz)}
                </T>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <CourseTag color={o.color} label={`${o.course_code} · ${o.section_code}`} />
                <T variant="bodyStrong" numberOfLines={1} style={{ textDecorationLine: cancelled ? "line-through" : "none" }}>
                  {o.course_title}
                </T>
                <T variant="callout" tone="ink3">
                  {place(o)}
                </T>
              </View>
              {cancelled ? (
                <Pill label={o.status === "moved" ? "Moved" : "Cancelled"} tone="danger" />
              ) : done ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Icon name="check" size={14} color={p.ink3} />
                  <T variant="caption" tone="ink3">
                    Done
                  </T>
                </View>
              ) : isNext ? (
                <Pill label="Next" tone="accent" />
              ) : null}
            </Press>
          </View>
        );
      })}
    </Card>
  );
}

function DueSoon({ list, pending, tz }: { list?: Assignment[]; pending: boolean; tz?: string }) {
  const p = useTheme();
  const due = useMemo(
    () =>
      (list ?? [])
        .filter((a) => !a.can_manage && a.status === "published" && (a.window === "open" || a.window === "late") && !(a.my_attempts ?? 0))
        .sort((a, b) => a.due_at.localeCompare(b.due_at))
        .slice(0, 3),
    [list],
  );
  if (pending) return <Skeleton height={76} />;
  if (!due.length) return null;
  return (
    <View>
      <SectionHeader title="Due soon" action="All work" onAction={() => router.navigate("/work")} />
      <View style={{ gap: 10 }}>
        {due.map((a) => (
          <Press
            key={a.id}
            accessibilityRole="button"
            accessibilityLabel={`${a.title}, ${a.course_code}, due ${relativeTime(a.due_at)}`}
            onPress={() => router.push({ pathname: "/assignment/[id]", params: { id: String(a.id) } })}
          >
            <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: p.accentSoft, alignItems: "center", justifyContent: "center" }}>
                <Icon name="clipboard" size={20} color={p.accentInk} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <CourseTag color={a.color} label={a.course_code} />
                <T variant="bodyStrong" numberOfLines={1}>
                  {a.title}
                </T>
                <T variant="callout" tone={a.window === "late" ? "danger" : "accentInk"}>
                  {a.window === "late" ? "Late · " : "Due "}
                  {relativeTime(a.due_at)}, {formatTime(a.due_at, tz)}
                </T>
              </View>
              <Icon name="chevron" size={18} color={p.ink3} />
            </Card>
          </Press>
        ))}
      </View>
    </View>
  );
}

/** The next few events, exams and deadlines from the calendar, with the way into it. */
function ComingUp({ tz, today }: { tz?: string; today: string }) {
  const [range] = useState(() => ({
    start: new Date(`${today}T00:00:00`).toISOString(),
    end: new Date(`${addDays(today, 21)}T00:00:00`).toISOString(),
  }));
  const events = useEvents(range.start, range.end);
  const now = useNow(60_000);
  const next = (events.data ?? [])
    .filter((e) => e.status !== "cancelled" && new Date(e.ends_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 3);
  if (events.isPending) return <Skeleton height={96} />;
  return (
    <View>
      <SectionHeader title="Coming up" action="Calendar" onAction={() => router.push("/calendar")} />
      {next.length ? (
        <View style={{ gap: 10 }}>
          {next.map((e) => (
            <EventRow key={e.id} e={e} tz={tz} />
          ))}
        </View>
      ) : (
        <Card>
          <T variant="body" tone="ink2">
            Nothing on the calendar for the next three weeks.
          </T>
        </Card>
      )}
    </View>
  );
}

/** The newest post on the campus feed, and the way in. */
function FeedPeek() {
  const p = useTheme();
  const feed = useFeed();
  const post = feed.data?.pages[0]?.[0];
  if (feed.isPending) return <Skeleton height={90} />;
  return (
    <View>
      <SectionHeader title="Campus feed" action="Feed" onAction={() => router.push("/feed")} />
      <Press
        accessibilityRole="button"
        accessibilityLabel={post ? `Newest post, by ${post.author.name}: ${post.body}. Opens the feed.` : "Open the campus feed"}
        onPress={() => router.push("/feed")}
      >
        <Card style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: p.accentSoft, alignItems: "center", justifyContent: "center" }}>
            <Icon name="chat" size={20} color={p.accentInk} />
          </View>
          <View style={{ flex: 1 }}>
            {post ? (
              <>
                <T variant="calloutStrong" numberOfLines={1}>
                  {post.author.name} · {relativeTime(post.created_at)}
                </T>
                <T variant="callout" tone="ink2" numberOfLines={2}>
                  {post.body || "Shared a file"}
                </T>
              </>
            ) : (
              <T variant="body" tone="ink2">
                Nothing posted yet. Say hello to your classes.
              </T>
            )}
          </View>
          <Icon name="chevron" size={18} color={p.ink3} />
        </Card>
      </Press>
    </View>
  );
}

function RecentChats({ list, pending, tz }: { list?: Conversation[]; pending: boolean; tz?: string }) {
  const recent = (list ?? []).filter((c) => c.request_status === "accepted" && c.last_message).slice(0, 2);
  if (pending) return <Skeleton height={140} />;
  if (!recent.length) return null;
  return (
    <View>
      <SectionHeader title="Recent chats" action="All chats" onAction={() => router.navigate("/chat")} />
      <Card padded={false}>
        {recent.map((c, i) => (
          <View key={c.id}>
            {i > 0 && <Divider inset={74} />}
            <ConversationRow c={c} tz={tz} />
          </View>
        ))}
      </Card>
    </View>
  );
}

function LatestNotice({ list, pending }: { list?: Notice[]; pending: boolean }) {
  const n = list?.[0];
  if (pending) return <Skeleton height={110} />;
  if (!n) return null;
  return (
    <View>
      <SectionHeader title="Latest notice" action="Board" onAction={() => router.navigate("/notices")} />
      <Press accessibilityRole="button" onPress={() => router.navigate("/notices")}>
        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T variant="caption" tone="ink3" style={{ letterSpacing: 0.4, textTransform: "uppercase", flexShrink: 1 }} numberOfLines={1}>
              {n.author_name}
              {n.published_at ? ` · ${relativeTime(n.published_at)}` : ""}
            </T>
            {n.priority === "important" ? <Pill label="Important" tone="accent" /> : null}
          </View>
          <T variant="headline">{n.title}</T>
          <T variant="callout" tone="ink2" numberOfLines={3}>
            {n.body}
          </T>
        </Card>
      </Press>
    </View>
  );
}
