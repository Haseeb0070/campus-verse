"use client";

import Link from "next/link";
import { AnimatedNumber } from "@/components/animated-number";
import { formatDay, formatDateTime } from "@/lib/format";
import { useAudit, useOverview } from "@/lib/manage";
import { useMe } from "@/lib/queries";
import { PageTitle } from "@/components/page-title";

export default function ManageOverview() {
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const data = useOverview().data;
  const recent = useAudit("").data?.slice(0, 6);

  const tiles = data
    ? [
        ["Students", data.students, `${data.invited} invited, not signed up yet`],
        ["Teachers", data.teachers, `${data.staff} staff`],
        ["Active subjects", data.sections, `across ${data.departments} departments`],
        ["Signed in this week", data.signed_in_week, `of ${data.active_people} active people`],
      ]
    : [];

  const attention = [
    ...(data?.pending_imports
      ? [{ text: `${data.pending_imports} timetable import waiting for review`, href: "/manage/import", cta: "Review" }]
      : []),
    ...(data?.room_clashes ?? []).map((c) => ({
      text: `${c.room} is double-booked ${formatDay(c.date, { month: "short" })} at ${c.time}: ${c.classes.join(" and ")}`,
      href: "/timetable",
      cta: "See timetable",
    })),
  ];

  return (
    <>
      <header>
        <p className="text-body font-semibold text-ink-2">{me?.institution?.name}</p>
        <PageTitle className="mt-1 text-large-title font-bold" text="Overview" />
      </header>

      {me && !me.two_step && (
        <div className="glass flex flex-wrap items-center gap-3 rounded-card p-4">
          <span className="min-w-0 flex-1">
            <span className="block text-body font-semibold">Turn on two-step sign-in</span>
            <span className="block text-footnote text-ink-2">
              Your account can change everyone&apos;s access. A code from your phone keeps it safe
              even if your password leaks.
            </span>
          </span>
          <Link href="/profile" className="press inline-flex h-10 items-center rounded-full bg-accent px-4 text-footnote font-semibold text-on-accent">
            Set it up
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([label, value, sub]) => (
          <div key={String(label)} className="glass rounded-card p-5">
            <p className="text-footnote font-semibold text-ink-2">{label}</p>
            <p className="mt-1 text-title-1 font-bold tabular-nums">
              {typeof value === "string" || typeof value === "number" ? <AnimatedNumber value={value} /> : value}
            </p>
            <p className="text-footnote text-ink-3">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="att-h" className="glass rounded-card p-6">
          <h2 id="att-h" className="mb-2 text-title-2 font-bold">Needs your attention</h2>
          {data && attention.length === 0 && (
            <p className="text-body text-ink-2">Nothing right now. No room clashes in the coming week.</p>
          )}
          <ul className="flex flex-col gap-1">
            {attention.map((a) => (
              <li key={a.text} className="flex items-center gap-3 rounded-row p-2.5 hover:bg-fill">
                <span className="size-2.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-body">{a.text}</span>
                <Link href={a.href} className="press rounded-full bg-fill-strong px-3 py-1.5 text-footnote font-semibold">
                  {a.cta}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="recent-h" className="glass rounded-card p-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="recent-h" className="text-title-2 font-bold">Recent changes</h2>
            <Link href="/manage/audit" className="text-footnote font-semibold text-accent-ink">
              Full audit log
            </Link>
          </div>
          <ul className="flex flex-col">
            {recent?.map((e) => (
              <li key={e.id} className="flex gap-3 border-b border-divider py-2.5 last:border-0">
                <span className="w-28 shrink-0 text-footnote text-ink-3 tabular-nums">
                  {formatDateTime(e.created_at, tz)}
                </span>
                <span className="min-w-0 text-footnote">
                  <span className="font-semibold">{e.actor ?? "System"}</span> · {e.action}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
