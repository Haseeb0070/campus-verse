"use client";

import Link from "next/link";
import { AnimatedNumber } from "@/components/animated-number";
import BlurText from "@/components/reactbits/BlurText";
import { BellIcon, MoonIcon, TodayIcon } from "@/components/icons";
import { useModerationSummary } from "@/lib/feed";
import { formatDay, greeting, relativeTime, todayIn } from "@/lib/format";
import { useOverview } from "@/lib/manage";
import { useNotifications } from "@/lib/notifications";
import { useMe, useNotices } from "@/lib/queries";

const ACTIONS = [
  { href: "/manage/people", title: "People", detail: "Add, invite, edit and reset accounts" },
  { href: "/manage/academic", title: "Courses & sections", detail: "Terms, subjects, sections and teachers" },
  { href: "/manage/import", title: "Import a timetable", detail: "Upload a file and review it first" },
  { href: "/notices/new", title: "Post a notice", detail: "To the college, a department or a class" },
  { href: "/manage/reports", title: "Reports", detail: "Sign-ins, coursework, attendance, notices" },
  { href: "/manage/theme", title: "Theme", detail: "Colours, the guide and its name" },
];

/** Today for an admin who has no classes of their own: the college at a glance, what needs
 *  them, and the things they come here to do, instead of an empty timetable. */
export function AdminToday() {
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const today = todayIn(tz);
  const hello = greeting(tz);
  const DayIcon = hello === "Good evening" ? MoonIcon : TodayIcon;
  const data = useOverview().data;
  const moderation = useModerationSummary().data;
  const unreadNotes = useNotifications().data?.unread ?? 0;
  const notices = useNotices(5).data ?? [];

  const tiles = data
    ? [
        { label: "Students", value: data.students, detail: data.invited ? `${data.invited} invited, not signed in yet` : "All signed up" },
        { label: "Teachers", value: data.teachers, detail: `${data.staff} staff` },
        { label: "Active sections", value: data.sections, detail: `across ${data.departments} ${data.departments === 1 ? "department" : "departments"}` },
        { label: "Signed in this week", value: data.signed_in_week, detail: `of ${data.active_people} people` },
      ]
    : [];

  const attention = [
    ...(data?.pending_imports
      ? [{ text: `${data.pending_imports} timetable ${data.pending_imports === 1 ? "import is" : "imports are"} waiting for review`, href: "/manage/import", cta: "Review" }]
      : []),
    ...(moderation?.open
      ? [{ text: `${moderation.open} feed ${moderation.open === 1 ? "report" : "reports"} to look at`, href: "/moderation", cta: "Open" }]
      : []),
    ...(data?.room_clashes ?? []).slice(0, 4).map((c) => ({
      text: `${c.room} is double-booked ${formatDay(c.date, { month: "short" })} at ${c.time}: ${c.classes.join(" and ")}`,
      href: "/manage/academic",
      cta: "Fix",
    })),
  ];

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
            <BlurText
              key={me?.first_name ?? ""}
              text={`${hello}, ${me?.first_name || "there"}`}
              trigger="load"
              effect="drift"
              blur={4}
              distance={10}
              delay={70}
              stepDuration={0.45}
            />
          </h1>
          <p className="mt-1 text-body text-ink-2">
            {formatDay(today)}
            {me?.institution?.name && ` · ${me.institution.name}`}
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

      <section aria-label="The college at a glance" className="rounded-card border border-hero-line bg-hero p-6 text-white md:p-7 on-hero">
        <p className="text-footnote font-semibold text-white/80">The college at a glance</p>
        {data ? (
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label}>
                <dt className="text-footnote font-semibold text-white/80">{t.label}</dt>
                <dd className="mt-0.5 text-large-title font-bold tabular-nums text-white">
                  <AnimatedNumber value={String(t.value)} />
                </dd>
                <dd className="text-footnote text-white/75">{t.detail}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-body text-white/80">Loading…</p>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="attention-h" className="glass rounded-card p-5">
            <h2 id="attention-h" className="text-headline font-semibold">Needs you</h2>
            {attention.length === 0 ? (
              <p className="mt-2 text-body text-ink-2">Nothing right now. Imports, room clashes and feed reports show up here.</p>
            ) : (
              <ul className="mt-2">
                {attention.map((a) => (
                  <li key={a.text} className="flex flex-wrap items-center gap-3 border-b border-divider py-3 last:border-0">
                    <span className="min-w-0 flex-1 text-body">{a.text}</span>
                    <Link href={a.href} className="press rounded-full bg-fill-strong px-3.5 py-1.5 text-footnote font-semibold">
                      {a.cta}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="actions-h">
            <h2 id="actions-h" className="mb-3 text-headline font-semibold">Manage the college</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {ACTIONS.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className="press glass block h-full rounded-card p-4 hover:bg-fill">
                    <span className="block text-body font-semibold">{a.title}</span>
                    <span className="block text-footnote text-ink-2">{a.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section aria-labelledby="notices-h" className="glass rounded-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="notices-h" className="text-headline font-semibold">Latest notices</h2>
            <Link href="/notices" className="text-footnote font-semibold text-accent-ink">All notices</Link>
          </div>
          {notices.length === 0 ? (
            <p className="mt-2 text-body text-ink-2">No notices yet.</p>
          ) : (
            <ul className="mt-2">
              {notices.map((n) => (
                <li key={n.id} className="border-b border-divider py-3 last:border-0">
                  <Link href={`/notices/${n.id}`} className="block">
                    <span className="block text-body font-semibold">{n.title}</span>
                    <span className="block text-footnote text-ink-2">
                      {n.published_at ? relativeTime(n.published_at) : "Draft"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
