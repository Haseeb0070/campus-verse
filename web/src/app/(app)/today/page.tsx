"use client";

import Link from "next/link";
import { AssignmentStatusChip } from "@/components/assignment-status";
import { ClassRow } from "@/components/class-row";
import {
  AssignmentsIcon,
  BellIcon,
  CalendarIcon,
  ChatIcon,
  PinIcon,
  TimetableIcon,
  VideoIcon,
} from "@/components/icons";
import { useUnreadTotal } from "@/lib/chat";
import { categoryTone, useEvents } from "@/lib/events";
import {
  addDays,
  courseBg,
  formatDateTime,
  formatDay,
  formatTime,
  greeting,
  relativeTime,
  todayIn,
} from "@/lib/format";
import { useNotifications } from "@/lib/notifications";
import { useAssignments, useMe, useNextClass, useNotices, useTimetable } from "@/lib/queries";
import type { Assignment } from "@/lib/types";

/** Work the viewer still has to act on: hand in (student) or mark (teacher). */
function pending(list: Assignment[] | undefined) {
  return (list ?? []).filter((a) =>
    a.can_manage
      ? a.status === "published" && !a.grades_released
      : !a.my_attempts && (a.window === "open" || a.window === "late"),
  );
}

export default function TodayPage() {
  const me = useMe();
  const tz = me.data?.institution?.timezone;
  const today = todayIn(tz);
  const classes = useTimetable(today, 1);
  const next = useNextClass();
  const assignments = useAssignments();
  const unreadChat = useUnreadTotal();
  const unreadNotes = useNotifications().data?.unread ?? 0;

  const upNext = next.data;
  const now = Date.now();
  const inProgress =
    upNext && new Date(upNext.starts_at).getTime() <= now && new Date(upNext.ends_at).getTime() > now;
  const todays = classes.data ?? [];
  const live = todays.filter((c) => c.status !== "cancelled" && c.status !== "moved");
  const work = pending(assignments.data);
  const teaching = assignments.data?.some((a) => a.can_manage);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <p className="text-footnote font-semibold text-ink-2">{formatDay(today)}</p>
        <h1 className="mt-1 text-large-title font-bold">
          {greeting(tz)}, {me.data?.first_name || "there"}
        </h1>
      </header>

      <section aria-label="Up next" className="rounded-card border border-hero-line bg-hero p-6 text-white md:p-7">
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
              <span className={`size-2 rounded-full ${courseBg[upNext.color]}`} aria-hidden="true" />
              {inProgress ? "Happening now" : `Up next · ${relativeTime(upNext.starts_at)}`}
            </span>
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
                {upNext.date === today ? "" : `${formatDay(upNext.date, { month: "short" })}, `}
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
                href="/chat"
                className="press inline-flex h-10 items-center gap-2 rounded-control bg-white px-4 text-footnote font-semibold text-hero-ink"
              >
                <ChatIcon className="size-4" /> Section chat
              </Link>
              <Link
                href="/timetable"
                className="press inline-flex h-10 items-center gap-2 rounded-control border border-white/25 bg-white/10 px-4 text-footnote font-semibold hover:bg-white/20"
              >
                <TimetableIcon className="size-4" /> Timetable
              </Link>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat Icon={TimetableIcon} tone="bg-tone-blue" label="Classes today" value={classes.isSuccess ? live.length : "–"} sub={upNext && upNext.date === today ? `Next at ${formatTime(upNext.starts_at, tz)}` : "None left today"} />
        <Stat Icon={AssignmentsIcon} tone="bg-tone-amber" label={teaching ? "To mark" : "Due soon"} value={assignments.isSuccess ? work.length : "–"} sub={teaching ? "Waiting for grades" : "Still to hand in"} />
        <Stat Icon={ChatIcon} tone="bg-tone-green" label="Unread messages" value={unreadChat} sub="In your chats" href="/chat" />
        <Stat Icon={BellIcon} tone="bg-tone-violet" label="Notifications" value={unreadNotes} sub="Not read yet" href="/notifications" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Today's classes" count={todays.length} link={{ href: "/timetable", label: "Full week" }}>
          {classes.isSuccess && todays.length === 0 && (
            <p className="px-5 py-4 text-body text-ink-2">No classes today. Your next one is shown above.</p>
          )}
          <ul className="flex flex-col gap-1 p-2">
            {todays.map((occ) => (
              <ClassRow
                key={`${occ.meeting_id}-${occ.date}-${occ.status}`}
                occ={occ}
                timeZone={tz}
                attendance
                highlight={upNext?.meeting_id === occ.meeting_id && upNext.date === occ.date}
              />
            ))}
          </ul>
        </Card>

        <Card title={teaching ? "To mark" : "Due soon"} count={work.length} link={{ href: "/assignments", label: "All work" }}>
          {assignments.isSuccess && work.length === 0 && (
            <p className="px-5 py-4 text-body text-ink-2">{teaching ? "Nothing waiting." : "You're all caught up."}</p>
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
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <NoticesCard />
        <ComingUp today={today} tz={tz} />
      </div>
    </div>
  );
}

function Stat({
  Icon,
  tone,
  label,
  value,
  sub,
  href,
}: {
  Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode;
  tone: string;
  label: string;
  value: number | string;
  sub: string;
  href?: string;
}) {
  const body = (
    <>
      <span className={`grid size-10 shrink-0 place-items-center rounded-control text-white ${tone}`}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-caption font-semibold leading-tight text-ink-2">{label}</span>
        <span className="block text-title-2 font-bold tabular-nums">{value}</span>
        <span className="block text-caption leading-tight text-ink-3">{sub}</span>
      </span>
    </>
  );
  const cls = "glass flex flex-col items-start gap-2.5 rounded-card p-4 sm:flex-row sm:items-center sm:gap-3";
  return href ? (
    <Link href={href} className={`${cls} hover:border-accent/40`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Card({
  title,
  count,
  link,
  children,
}: {
  title: string;
  count?: number;
  link?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="glass flex flex-col overflow-hidden rounded-card">
      <div className="flex items-center gap-2 border-b border-divider px-5 py-4">
        <h2 className="text-title-2 font-bold">{title}</h2>
        {count != null && count > 0 && (
          <span className="rounded-full bg-accent/12 px-2 py-0.5 text-caption font-semibold text-accent-ink">{count}</span>
        )}
        {link && (
          <Link href={link.href} className="ml-auto text-footnote font-semibold text-accent-ink hover:underline">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function NoticesCard() {
  const notices = useNotices(3);
  return (
    <Card title="Notices" link={{ href: "/notices", label: "All notices" }}>
      {notices.data?.length === 0 && <p className="px-5 py-4 text-body text-ink-2">No notices for you yet.</p>}
      <ul className="divide-y divide-divider">
        {notices.data?.map((n) => (
          <li key={n.id}>
            <Link href={`/notices#notice-${n.id}`} className="flex flex-col gap-0.5 px-5 py-3.5 hover:bg-fill">
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
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ComingUp({ today, tz }: { today: string; tz?: string }) {
  const events = useEvents(today, addDays(today, 30));
  const list = (events.data ?? []).filter((e) => e.status !== "cancelled").slice(0, 3);
  return (
    <Card title="Coming up" link={{ href: "/calendar", label: "Calendar" }}>
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
