"use client";

import Link from "next/link";
import { AssignmentStatusChip } from "@/components/assignment-status";
import { ClassRow } from "@/components/class-row";
import { PinIcon, VideoIcon } from "@/components/icons";
import {
  courseBg,
  formatDateTime,
  formatDay,
  formatTime,
  greeting,
  relativeTime,
  todayIn,
} from "@/lib/format";
import { useAssignments, useMe, useNextClass, useNotices, useTimetable } from "@/lib/queries";

export default function TodayPage() {
  const me = useMe();
  const tz = me.data?.institution?.timezone;
  const today = todayIn(tz);
  const classes = useTimetable(today, 1);
  const next = useNextClass();
  const notices = useNotices(3);

  const upNext = next.data;
  const now = Date.now();
  const inProgress =
    upNext && new Date(upNext.starts_at).getTime() <= now && new Date(upNext.ends_at).getTime() > now;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header>
        <p className="text-body font-semibold text-ink-2">{formatDay(today)}</p>
        <h1 className="mt-1 text-large-title font-bold">
          {greeting(tz)}, {me.data?.first_name || "there"}
        </h1>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-label="Up next" className="glass flex flex-wrap items-start justify-between gap-6 rounded-card p-7">
          {next.isPending ? (
            <p className="text-body text-ink-2">Loading your next class…</p>
          ) : !upNext ? (
            <div>
              <p className="text-headline font-semibold">No classes coming up</p>
              <p className="mt-1 text-body text-ink-2">Nothing on your timetable for the next three weeks.</p>
            </div>
          ) : (
            <>
              <div className="flex min-w-[240px] flex-1 flex-col gap-3.5">
                <span className="inline-flex items-center gap-2 self-start rounded-full bg-fill-strong px-3 py-1.5 text-footnote font-semibold">
                  <span className={`size-2 rounded-full ${courseBg[upNext.color]}`} aria-hidden="true" />
                  {inProgress ? "Happening now" : `Up next · ${relativeTime(upNext.starts_at)}`}
                </span>
                <div>
                  <h2 className="text-title-1 font-bold">{upNext.course_title}</h2>
                  <p className="mt-1 text-body text-ink-2">
                    {upNext.course_code} · Section {upNext.section_code}
                    {upNext.teachers.length > 0 && ` · ${upNext.teachers.join(", ")}`}
                  </p>
                </div>
                <p className="flex items-center gap-2 text-body text-ink-2">
                  {upNext.mode === "online" ? (
                    <>
                      <VideoIcon className="size-5" /> Online
                    </>
                  ) : (
                    <>
                      <PinIcon className="size-5" /> {upNext.room || "Room to be confirmed"}
                    </>
                  )}
                  {upNext.status === "room_changed" && (
                    <span className="rounded-full bg-warning/18 px-2 py-0.5 text-caption font-semibold text-ink">
                      Room changed
                    </span>
                  )}
                </p>
                {upNext.mode === "online" && upNext.online_url && (
                  <a
                    href={upNext.online_url}
                    target="_blank"
                    rel="noreferrer"
                    className="press inline-flex h-11 items-center self-start rounded-full bg-accent px-5 text-body font-semibold text-on-accent"
                  >
                    Join class
                  </a>
                )}
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[clamp(3.5rem,8vw,5.25rem)] font-semibold leading-none tracking-[-0.045em] tabular-nums">
                  {formatTime(upNext.starts_at, tz)}
                </span>
                <span className="mt-1 text-body text-ink-2">
                  {upNext.date === today ? "until" : `${formatDay(upNext.date, { month: "short" })}, until`}{" "}
                  {formatTime(upNext.ends_at, tz)}
                </span>
              </div>
            </>
          )}
        </section>

        <section aria-labelledby="notices-h" className="glass flex flex-col gap-1 rounded-card p-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="notices-h" className="text-title-2 font-bold">
              Notices
            </h2>
            <Link href="/notices" className="text-footnote font-semibold text-accent-ink">
              See all
            </Link>
          </div>
          {notices.data?.length === 0 && <p className="text-body text-ink-2">No notices for you yet.</p>}
          <ul className="flex flex-col gap-1">
            {notices.data?.map((n) => (
              <li key={n.id} className="rounded-row p-2.5 hover:bg-fill">
                <Link href={`/notices#notice-${n.id}`} className="block">
                  {n.priority === "important" && (
                    <span className="mb-1 inline-block rounded-full bg-danger/12 px-2 py-0.5 text-caption font-semibold text-danger-ink">
                      Important
                    </span>
                  )}
                  <span className="block text-body font-semibold">{n.title}</span>
                  <span className="block text-footnote text-ink-2">
                    {n.author_name}
                    {n.published_at && ` · ${relativeTime(n.published_at)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section aria-labelledby="today-h" className="glass rounded-card p-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="today-h" className="text-title-2 font-bold">
            Today&apos;s classes
          </h2>
          <Link href="/timetable" className="text-footnote font-semibold text-accent-ink">
            Full timetable
          </Link>
        </div>
        {classes.data?.length === 0 && (
          <p className="py-2 text-body text-ink-2">No classes today. Your next one is shown above.</p>
        )}
        <ul className="flex flex-col gap-1">
          {classes.data?.map((occ) => (
            <ClassRow
              key={`${occ.meeting_id}-${occ.date}-${occ.status}`}
              occ={occ}
              timeZone={tz}
              highlight={upNext?.meeting_id === occ.meeting_id && upNext.date === occ.date}
            />
          ))}
        </ul>
      </section>

      <DueSoon tz={tz} />
      </div>
    </div>
  );
}

function DueSoon({ tz }: { tz?: string }) {
  const assignments = useAssignments();
  const items = (assignments.data ?? [])
    .filter((a) =>
      a.can_manage
        ? a.status === "published" && !a.grades_released
        : !a.my_attempts && (a.window === "open" || a.window === "late"),
    )
    .slice(0, 4);
  const teaching = assignments.data?.some((a) => a.can_manage);

  return (
    <section aria-labelledby="due-h" className="glass flex flex-col gap-1 rounded-card p-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="due-h" className="text-title-2 font-bold">
          {teaching ? "To mark" : "Due soon"}
        </h2>
        <Link href="/assignments" className="text-footnote font-semibold text-accent-ink">
          See all
        </Link>
      </div>
      {assignments.isSuccess && items.length === 0 && (
        <p className="text-body text-ink-2">{teaching ? "Nothing waiting." : "You're all caught up."}</p>
      )}
      <ul className="flex flex-col gap-1">
        {items.map((a) => (
          <li key={a.id}>
            <Link href={`/assignments/${a.id}`} className="flex flex-col gap-1.5 rounded-row p-2.5 hover:bg-fill">
              <span className="text-body font-semibold">{a.title}</span>
              <span className="flex flex-wrap items-center gap-2 text-footnote text-ink-2">
                {a.course_code} · {formatDateTime(a.due_at, tz)}
                <AssignmentStatusChip assignment={a} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
