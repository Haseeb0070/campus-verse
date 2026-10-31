"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeftIcon } from "@/components/icons";
import { ApiError } from "@/lib/api";
import { courseBg } from "@/lib/format";
import { useRoster } from "@/lib/queries";
import type { Person } from "@/lib/types";

function PersonRow({ person, badge }: { person: Person; badge?: string }) {
  return (
    <li className="flex items-center gap-3 rounded-row p-2.5 hover:bg-fill">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-fill-strong text-caption font-semibold">
        {person.initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-body font-semibold">
          {person.name}
          {badge && (
            <span className="rounded-md bg-accent/12 px-1.5 py-px text-caption text-accent-ink">{badge}</span>
          )}
        </span>
        <a href={`mailto:${person.email}`} className="block truncate text-footnote text-ink-2 hover:underline">
          {person.email}
        </a>
      </span>
    </li>
  );
}

export default function RosterPage() {
  const { id } = useParams<{ id: string }>();
  const roster = useRoster(Number(id));
  const notFound = roster.error instanceof ApiError && roster.error.status === 404;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/sections" className="inline-flex items-center gap-1 text-footnote font-semibold text-accent-ink">
        <ChevronLeftIcon className="size-4" /> My sections
      </Link>

      {notFound && (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">This roster isn&apos;t available</p>
          <p className="mt-1 text-body text-ink-2">You can only see rosters for sections you teach.</p>
        </div>
      )}
      {roster.isPending && <p className="text-body text-ink-2">Loading…</p>}

      {roster.data && (
        <>
          <header className="flex items-center gap-4">
            <span
              className={`grid size-14 shrink-0 place-items-center rounded-[16px] text-headline font-bold text-white ${courseBg[roster.data.section.color]}`}
              aria-hidden="true"
            >
              {roster.data.section.code}
            </span>
            <div>
              <h1 className="text-title-1 font-bold">{roster.data.section.course_title}</h1>
              <p className="text-body text-ink-2">
                {roster.data.section.course_code} · Section {roster.data.section.code} ·{" "}
                {roster.data.section.term}
              </p>
            </div>
          </header>

          <section aria-labelledby="teachers-h" className="glass rounded-card p-5">
            <h2 id="teachers-h" className="mb-1 px-2.5 text-headline font-semibold">
              Teachers
            </h2>
            <ul>
              {roster.data.teachers.map((p) => (
                <PersonRow key={p.id} person={p} badge="Teacher" />
              ))}
            </ul>
          </section>

          <section aria-labelledby="students-h" className="glass rounded-card p-5">
            <h2 id="students-h" className="mb-1 px-2.5 text-headline font-semibold">
              Students <span className="text-ink-3">{roster.data.students.length}</span>
            </h2>
            {roster.data.students.length === 0 ? (
              <p className="px-2.5 py-2 text-body text-ink-2">No students enrolled yet.</p>
            ) : (
              <ul>
                {roster.data.students.map((p) => (
                  <PersonRow key={p.id} person={p} />
                ))}
              </ul>
            )}
            <p className="mt-2 px-2.5 text-caption text-ink-3">
              Enrollment comes from your institution&apos;s records. Ask your admin to fix anything
              that&apos;s wrong.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
