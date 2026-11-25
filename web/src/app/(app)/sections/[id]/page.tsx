"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeftIcon } from "@/components/icons";
import { ApiError, apiFetch } from "@/lib/api";
import { courseBg, tileLabel } from "@/lib/format";
import { useRoster } from "@/lib/queries";
import type { Person } from "@/lib/types";

type Rep = { student_id: number; role: "cr" | "gr"; name: string; chosen_by: string };

/** The subject's CR and GR (its section's, this term). Admins and coordinators choose them. */
function useReps(sectionId: number) {
  const list = useQuery({
    queryKey: ["reps", "section", sectionId],
    queryFn: () => apiFetch<Rep[]>(`/api/reps/sections/${sectionId}`),
    retry: false,
  });
  const roleOf = (id: number) => list.data?.find((r) => r.student_id === id)?.role ?? "";
  return { list, roleOf, allowed: list.isSuccess };
}

function PersonRow({ person, badge, children }: { person: Person; badge?: string; children?: React.ReactNode }) {
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
      {children}
    </li>
  );
}

export default function RosterPage() {
  const { id } = useParams<{ id: string }>();
  const roster = useRoster(Number(id));
  const reps = useReps(Number(id));
  const notFound = roster.error instanceof ApiError && roster.error.status === 404;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/sections" className="inline-flex items-center gap-1 text-footnote font-semibold text-accent-ink">
        <ChevronLeftIcon className="size-4" /> My subjects
      </Link>

      {notFound && (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">This roster isn&apos;t available</p>
          <p className="mt-1 text-body text-ink-2">You can only see rosters for subjects you teach.</p>
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
              {tileLabel(roster.data.section.course_code)}
            </span>
            <div>
              <h1 className="text-title-1 font-bold">{roster.data.section.course_title}</h1>
              <p className="text-body text-ink-2">
                {roster.data.section.course_code} · {roster.data.section.code} · {roster.data.section.term}
              </p>
              {roster.data.section.section_label && (
                <p className="text-footnote text-ink-3">Section: {roster.data.section.section_label}</p>
              )}
            </div>
            <span className="ml-auto flex flex-wrap gap-2">
              <a href={`/api/sections/${id}/roster.csv`} download className="press inline-flex h-9 items-center rounded-full bg-fill-strong px-3.5 text-footnote font-semibold">Class list (Excel)</a>
              <a href={`/api/sections/${id}/marks.csv`} download className="press inline-flex h-9 items-center rounded-full bg-fill-strong px-3.5 text-footnote font-semibold">Marks (Excel)</a>
            </span>
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
            {reps.allowed && (
              <p className="mb-2 px-2.5 text-footnote text-ink-2">
                Section {roster.data.section.code}:{" "}
                {(["cr", "gr"] as const).map((role, i) => {
                  const r = reps.list.data?.find((x) => x.role === role);
                  return (
                    <span key={role}>
                      {i > 0 && " · "}
                      <span className="font-semibold text-ink">{role.toUpperCase()}</span> {r ? r.name : "not chosen yet"}
                    </span>
                  );
                })}
              </p>
            )}
            {roster.data.students.length === 0 ? (
              <p className="px-2.5 py-2 text-body text-ink-2">No students enrolled yet.</p>
            ) : (
              <ul>
                {roster.data.students.map((p) => (
                  <PersonRow key={p.id} person={p} badge={reps.roleOf(p.id).toUpperCase() || undefined} />
                ))}
              </ul>
            )}
            {reps.allowed && (
              <p className="mt-3 px-2.5 text-footnote text-ink-2">
                The CR and GR act for the whole section in every subject: they can cancel or shift lectures and
                take attendance. You&apos;re told, or approve first (your setting in Class requests). Admins choose
                them in Manage.
              </p>
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
