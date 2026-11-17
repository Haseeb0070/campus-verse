"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AssignmentStatusChip } from "@/components/assignment-status";
import { ConversationRow } from "@/components/chat/conversation-list";
import { ClassRow } from "@/components/class-row";
import { Pushpin } from "@/components/pushpin";
import AnimatedContent from "@/components/reactbits/AnimatedContent";
import BlurText from "@/components/reactbits/BlurText";
import CountUp from "@/components/reactbits/CountUp";
import {
  BellIcon,
  CalendarIcon,
  ChatIcon,
  CheckIcon,
  MoonIcon,
  PinIcon,
  TimetableIcon,
  TodayIcon,
  VideoIcon,
} from "@/components/icons";
import { useConversations } from "@/lib/chat";
import { categoryTone, useEvents } from "@/lib/events";
import {
  addDays,
  courseBg,
  formatDateTime,
  formatDay,
  formatTime,
  greeting,
  relativeTime,
  startsLabel,
  todayIn,
} from "@/lib/format";
import { useNotifications } from "@/lib/notifications";
import { useAssignments, useMe, useNextClass, useNotices, useTimetable } from "@/lib/queries";
import type { Assignment, Occurrence } from "@/lib/types";

/** Work the viewer still has to act on: hand in (student) or mark (teacher), soonest first. */
function pending(list: Assignment[] | undefined) {
  return (list ?? [])
    .filter((a) =>
      a.can_manage
        ? a.status === "published" && !a.grades_released
        : !a.my_attempts && (a.window === "open" || a.window === "late"),
    )
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
}

/** The current time, refreshed every 30 seconds so class progress and Done states keep up. */
function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}

/** One line on how the day is going, for the header. */
function dayStatus(live: Occurrence[], now: number) {
  const left = live.filter((o) => new Date(o.ends_at).getTime() > now).length;
  if (live.length === 0) return "No classes today";
  if (left === 0) return live.length === 1 ? "Your class is done for today" : `All ${live.length} classes done for today`;
  if (left === live.length) return `${live.length} ${live.length === 1 ? "class" : "classes"} today`;
  return `${left} of ${live.length} classes left today`;
}

export default function TodayPage() {
  const me = useMe();
  const tz = me.data?.institution?.timezone;
  const today = todayIn(tz);
  const classes = useTimetable(today, 1);
  const next = useNextClass();
  const assignments = useAssignments();
  const conversations = useConversations();
  const unreadNotes = useNotifications().data?.unread ?? 0;

  const upNext = next.data;
  const now = useNow();
  const startMs = upNext ? new Date(upNext.starts_at).getTime() : 0;
  const endMs = upNext ? new Date(upNext.ends_at).getTime() : 0;
  const inProgress = upNext && startMs <= now && endMs > now;
  const elapsed = inProgress ? (now - startMs) / (endMs - startMs) : 0;
  const hello = greeting(tz);
  const DayIcon = hello === "Good evening" ? MoonIcon : TodayIcon;
  const sectionChat = upNext && conversations.data?.find((c) => c.kind === "section" && c.section_id === upNext.section_id);
  const todays = classes.data ?? [];
  const live = todays.filter((c) => c.status !== "cancelled" && c.status !== "moved");
  const work = pending(assignments.data);
  const teaching = assignments.data?.some((a) => a.can_manage);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="flex items-center gap-3 text-large-title font-bold">
            <DayIcon
              className={`rise size-8 shrink-0 [&_.duo]:[fill-opacity:0.3] ${
                DayIcon === MoonIcon ? "text-accent-ink [&_path]:fill-current [&_path]:[fill-opacity:0.2]" : "text-warning"
              }`}
            />
            {/* Words settle in once, like ink taking; keyed so the name animates when it arrives. */}
            <BlurText
              key={me.data?.first_name ?? ""}
              text={`${hello}, ${me.data?.first_name || "there"}`}
              trigger="load"
              effect="drift"
              blur={4}
              distance={10}
              delay={70}
              stepDuration={0.45}
              className="gap-x-[0.2em]"
            />
          </h1>
          <p className="mt-1 text-body text-ink-2">
            {formatDay(today)}
            {classes.isSuccess && ` · ${dayStatus(live, now)}`}
          </p>
        </div>
        {unreadNotes > 0 && (
          <Link
            href="/notifications"
            className="press inline-flex h-10 items-center gap-2 rounded-full bg-fill px-4 text-footnote font-semibold hover:bg-fill-strong"
          >
            <BellIcon className="size-4" />
            {unreadNotes} new {unreadNotes === 1 ? "notification" : "notifications"}
          </Link>
        )}
      </header>

      <AnimatedContent trigger="mount" distance={18} duration={0.7} ease="power3.out" delay={0.05}>
      <section
        aria-label="Up next"
        className="relative overflow-hidden rounded-card border border-hero-line bg-hero p-6 text-white md:p-7 on-hero"
      >
        {next.isPending ? (
          <p className="text-body text-white/80">Loading your next class…</p>
        ) : !upNext ? (
          <div>
            <p className="text-headline font-semibold">No classes coming up</p>
            <p className="mt-1 text-body text-white/80">Nothing on your timetable for the next three weeks.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <span className="inline-flex items-center gap-2 self-start rounded-full bg-white/12 px-3 py-1 text-footnote font-semibold">
              <span
                className={`size-2 rounded-full ${courseBg[upNext.color]} ${inProgress ? "breathe" : ""}`}
                aria-hidden="true"
              />
              {inProgress
                ? `Happening now · ${Math.max(1, Math.round((endMs - now) / 60_000))} min left`
                : startsLabel(upNext.date, upNext.starts_at, today, tz, now)}
            </span>
            {inProgress && (
              <div
                role="progressbar"
                aria-label="Class progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(elapsed * 100)}
                className="absolute inset-x-0 bottom-0 h-1 bg-white/10"
              >
                <div
                  className={`h-full origin-left transition-transform duration-1000 ease-out ${courseBg[upNext.color]}`}
                  style={{ transform: `scaleX(${elapsed})` }}
                />
              </div>
            )}
            <div>
              <h2 className="text-title-1 font-bold">{upNext.course_title}</h2>
              <p className="mt-1 text-body text-white/80">
                {upNext.course_code} · Section {upNext.section_code}
                {upNext.teachers.length > 0 && ` · ${upNext.teachers.join(", ")}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-footnote font-semibold">
              <span className="inline-flex items-center gap-2 rounded-control border border-white/15 bg-white/10 px-3 py-1.5">
                {upNext.mode === "online" ? <VideoIcon className="size-4" /> : <PinIcon className="size-4" />}
                {upNext.mode === "online" ? "Online" : upNext.room || "Room to be confirmed"}
              </span>
              <span className="inline-flex items-center gap-2 rounded-control border border-white/15 bg-white/10 px-3 py-1.5 tabular-nums">
                <TimetableIcon className="size-4" />
                {/* Today and tomorrow are already named in the label above. */}
                {upNext.date === today || upNext.date === addDays(today, 1)
                  ? ""
                  : `${formatDay(upNext.date, { month: "short" })}, `}
                {formatTime(upNext.starts_at, tz)} – {formatTime(upNext.ends_at, tz)}
              </span>
              {upNext.status === "room_changed" && (
                <span className="rounded-full bg-warning px-2.5 py-1 text-caption font-semibold text-on-warning">
                  Room changed
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2.5">
              {upNext.mode === "online" && upNext.online_url && (
                <a
                  href={upNext.online_url}
                  target="_blank"
                  rel="noreferrer"
                  className="press inline-flex h-10 items-center gap-2 rounded-control bg-white px-4 text-footnote font-semibold text-hero-ink"
                >
                  <VideoIcon className="size-4" /> Join class
                </a>
              )}
              <Link
                href={sectionChat ? `/chat/${sectionChat.id}` : "/chat"}
                className="press inline-flex h-10 items-center gap-2 rounded-control bg-white px-4 text-footnote font-semibold text-hero-ink"
              >
                <ChatIcon className="size-4" /> Section chat
                {sectionChat && sectionChat.unread > 0 && (
                  <span className="rounded-full bg-accent px-1.5 text-caption text-on-accent">
                    {sectionChat.unread}
                    <span className="sr-only"> unread</span>
                  </span>
                )}
              </Link>
            </div>
          </div>
        )}
      </section>
      </AnimatedContent>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <AnimatedContent
          trigger="mount"
          distance={22}
          duration={0.65}
          stagger={0.08}
          delay={0.15}
          className="flex min-w-0 flex-col gap-5"
        >
          <RecentChats myId={me.data?.id} />

          <Card title="Today's classes" count={live.length} query={classes} link={{ href: "/timetable", label: "Full week" }}>
            {classes.isSuccess && todays.length === 0 && (
              <EmptyNote Icon={TimetableIcon} tone="bg-accent/12 text-accent-ink" title="No classes today">
                Your next one is shown above.
              </EmptyNote>
            )}
            <ul className="flex flex-col gap-1 p-2">
              {todays.map((occ) => (
                <ClassRow
                  key={`${occ.meeting_id}-${occ.date}-${occ.status}`}
                  occ={occ}
                  timeZone={tz}
                  attendance
                  past={new Date(occ.ends_at).getTime() <= now}
                  highlight={upNext?.meeting_id === occ.meeting_id && upNext.date === occ.date}
                />
              ))}
            </ul>
          </Card>
        </AnimatedContent>

        <AnimatedContent
          trigger="mount"
          distance={22}
          duration={0.65}
          stagger={0.08}
          delay={0.22}
          className="flex min-w-0 flex-col gap-5"
        >
          <Card
            title={teaching ? "To mark" : "Due soon"}
            count={work.length}
            query={assignments}
            link={{ href: "/assignments", label: "All work" }}
          >
            {assignments.isSuccess && work.length === 0 && (
              <EmptyNote
                Icon={CheckIcon}
                draw
                tone="bg-success/12 text-success-ink"
                title={teaching ? "Nothing to mark" : "You're all caught up"}
              >
                {teaching ? "New hand-ins show up here." : "Nothing to hand in right now. Enjoy the breathing room."}
              </EmptyNote>
            )}
            <ul className="divide-y divide-divider">
              {work.slice(0, 4).map((a) => (
                <li key={a.id}>
                  <Link href={`/assignments/${a.id}`} className="flex flex-col gap-1 px-5 py-3.5 hover:bg-fill">
                    <span className="text-body font-semibold">{a.title}</span>
                    <span className="flex flex-wrap items-center gap-2 text-footnote text-ink-2">
                      <span className="font-semibold text-accent-ink">{a.course_code}</span>· Due {formatDateTime(a.due_at, tz)}
                      <AssignmentStatusChip assignment={a} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <ComingUp today={today} tz={tz} />
          <NoticesCard />
        </AnimatedContent>
      </div>
    </div>
  );
}

function Card({
  title,
  count,
  countLabel,
  link,
  query,
  children,
}: {
  title: string;
  count?: number;
  /** What the count means, for screen readers ("unread"). */
  countLabel?: string;
  link?: { href: string; label: string };
  /** The card's main query: drives the loading and error states. */
  query?: { isPending: boolean; isError: boolean; refetch: () => unknown };
  children: React.ReactNode;
}) {
  return (
    <section className="glass flex flex-col overflow-hidden rounded-card" aria-busy={query?.isPending || undefined}>
      <div className="flex items-center gap-2 border-b border-divider px-5 py-4">
        <h2 className="text-title-2 font-bold">{title}</h2>
        {count != null && count > 0 && (
          <span className="rounded-full bg-accent/12 px-2 py-0.5 text-caption font-semibold tabular-nums text-accent-ink">
            <CountUp to={count} duration={0.9} trigger="load" mode="roll" />
            {countLabel && <span className="sr-only"> {countLabel}</span>}
          </span>
        )}
        {link && (
          <Link
            href={link.href}
            className="ml-auto inline-flex min-h-6 items-center text-footnote font-semibold text-accent-ink hover:underline"
          >
            {link.label}
          </Link>
        )}
      </div>
      {query?.isPending ? (
        <p className="px-5 py-4 text-body text-ink-3">Loading…</p>
      ) : query?.isError ? (
        <div role="alert" className="flex items-center justify-between gap-3 px-5 py-4">
          <p className="text-body text-ink-2">Couldn&apos;t load this. Check your connection.</p>
          <button
            onClick={() => query.refetch()}
            className="press shrink-0 rounded-full bg-fill-strong px-3 py-1.5 text-footnote font-semibold"
          >
            Try again
          </button>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/** A friendlier empty card: a tinted spot icon, a short title and one line of help. */
function EmptyNote({
  Icon,
  tone,
  title,
  draw = false,
  children,
}: {
  Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode;
  tone: string;
  title: string;
  /** Draw the icon's stroke in (for a check). */
  draw?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-4">
      <span className={`grid size-11 shrink-0 place-items-center rounded-full ${tone}`}>
        <Icon className={`size-5 [&_.duo]:[fill-opacity:0.24] ${draw ? "draw" : ""}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-body font-semibold">{title}</span>
        <span className="block text-footnote text-ink-2">{children}</span>
      </span>
    </div>
  );
}

function RecentChats({ myId }: { myId?: number }) {
  const conversations = useConversations();
  const list = (conversations.data ?? []).filter((c) => c.last_message).slice(0, 3);
  const unread = conversations.data?.reduce((sum, c) => sum + c.unread, 0) ?? 0;
  // Messages already on screen. A row whose last message isn't in here arrived since the last
  // render, so it settles in; nothing animates on the first load.
  const seen = useRef<Set<number> | null>(null);
  const arrived = (id: number | undefined) => id != null && seen.current != null && !seen.current.has(id);
  useEffect(() => {
    if (conversations.data) seen.current = new Set(conversations.data.flatMap((c) => c.last_message?.id ?? []));
  });
  return (
    <Card title="Recent chats" count={unread} countLabel="unread" query={conversations} link={{ href: "/chat", label: "All chats" }}>
      {conversations.isSuccess && list.length === 0 && (
        <EmptyNote Icon={ChatIcon} tone="bg-accent/12 text-accent-ink" title="No messages yet">
          Every section you&apos;re in has its own chat. Say hello in{" "}
          <Link href="/chat" className="font-semibold text-accent-ink hover:underline">
            Chat
          </Link>
          .
        </EmptyNote>
      )}
      <ul className="flex flex-col gap-0.5 p-2">
        {list.map((c) => (
          <li key={c.id}>
            <ConversationRow conversation={c} myId={myId} arriving={arrived(c.last_message?.id)} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function NoticesCard() {
  const notices = useNotices(3);
  return (
    <Card title="Notices" query={notices} link={{ href: "/notices", label: "All notices" }}>
      {notices.data?.length === 0 && <p className="px-5 py-4 text-body text-ink-2">No notices for you yet.</p>}
      <ul className="divide-y divide-divider">
        {notices.data?.map((n) => (
          <li key={n.id}>
            <Link href={`/notices#notice-${n.id}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-fill">
              <Pushpin
                className={`mt-0.5 size-5 shrink-0 ${n.priority === "important" ? "text-danger" : "text-accent"}`}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  {n.priority === "important" && (
                    <span className="rounded-full bg-danger/12 px-2 py-0.5 text-caption font-semibold text-danger-ink">
                      Important
                    </span>
                  )}
                  <span className="text-body font-semibold">{n.title}</span>
                </span>
                <span className="text-footnote text-ink-2">
                  {n.author_name}
                  {n.published_at && ` · ${relativeTime(n.published_at)}`}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ComingUp({ today, tz }: { today: string; tz?: string }) {
  const events = useEvents(today, addDays(today, 30));
  const list = (events.data ?? [])
    .filter((e) => e.status !== "cancelled")
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 3);
  return (
    <Card title="Coming up" query={events} link={{ href: "/calendar", label: "Calendar" }}>
      {events.isSuccess && list.length === 0 && (
        <p className="px-5 py-4 text-body text-ink-2">Nothing on the calendar for the next month.</p>
      )}
      <ul className="divide-y divide-divider">
        {list.map((e) => (
          <li key={e.id}>
            <Link href={`/calendar/${e.id}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-fill">
              <CalendarIcon className="mt-0.5 size-5 shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold">{e.title}</span>
                <span className="block text-footnote text-ink-2">
                  {e.all_day ? formatDay(e.starts_at.slice(0, 10)) : formatDateTime(e.starts_at, tz)}
                  {e.location && ` · ${e.location}`}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-caption font-semibold ${categoryTone[e.category]}`}>
                {e.category_label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
