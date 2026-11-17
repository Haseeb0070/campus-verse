"use client";

import Link from "next/link";
import { useConversations } from "@/lib/chat";
import { courseBg } from "@/lib/format";
import { useTeaching } from "@/lib/queries";
import { PageTitle } from "@/components/page-title";

export default function SectionsPage() {
  const sections = useTeaching();
  const conversations = useConversations();
  const chatFor = (sectionId: number) =>
    conversations.data?.find((c) => c.section_id === sectionId)?.id;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header>
        <p className="text-body font-semibold text-ink-2">Sections you teach</p>
        <PageTitle className="mt-1 text-large-title font-bold" text="My sections" />
      </header>

      {sections.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {sections.data?.length === 0 && (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">You&apos;re not teaching any sections</p>
          <p className="mt-1 text-body text-ink-2">
            Sections appear here once your admin assigns you to them.
          </p>
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {sections.data?.map((s) => {
          const chatId = chatFor(s.id);
          return (
            <li key={s.id} className="glass flex flex-col gap-4 rounded-card p-5">
              <div className="flex items-center gap-3">
                <span
                  className={`grid size-12 shrink-0 place-items-center rounded-[14px] text-body font-bold text-white ${courseBg[s.color]}`}
                  aria-hidden="true"
                >
                  {s.code}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-headline font-semibold">{s.course_title}</span>
                  <span className="block text-footnote text-ink-2">
                    {s.course_code} · Section {s.code} · {s.term}
                  </span>
                </span>
              </div>
              <p className="text-body">
                <span className="text-title-2 font-bold tabular-nums">{s.students}</span>{" "}
                <span className="text-ink-2">{s.students === 1 ? "student" : "students"}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/sections/${s.id}`}
                  className="press rounded-full bg-accent px-4 py-2 text-footnote font-semibold text-on-accent"
                >
                  Roster
                </Link>
                {chatId && (
                  <Link
                    href={`/chat/${chatId}`}
                    className="press rounded-full bg-fill-strong px-4 py-2 text-footnote font-semibold"
                  >
                    Section chat
                  </Link>
                )}
                <Link
                  href="/notices/new"
                  className="press rounded-full bg-fill-strong px-4 py-2 text-footnote font-semibold"
                >
                  Post a notice
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
