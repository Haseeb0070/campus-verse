"use client";

import Link from "next/link";
import { AssignmentStatusChip } from "@/components/assignment-status";
import { courseBg, formatDateTime } from "@/lib/format";
import { useAssignments, useMe } from "@/lib/queries";
import type { Assignment } from "@/lib/types";
import { PageTitle } from "@/components/page-title";

function Row({ a, tz }: { a: Assignment; tz?: string }) {
  return (
    <li>
      <Link href={`/assignments/${a.id}`} className="press flex items-center gap-3 rounded-row p-3 hover:bg-fill">
        <span className={`h-10 w-1 shrink-0 rounded-full ${courseBg[a.color]}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold">{a.title}</span>
          <span className="block truncate text-footnote text-ink-2">
            {a.course_code} · {a.section_code} · Due {formatDateTime(a.due_at, tz)} · {a.max_points} pts
          </span>
        </span>
        <AssignmentStatusChip assignment={a} />
      </Link>
    </li>
  );
}

export default function AssignmentsPage() {
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const assignments = useAssignments();
  const teaches = me?.sections.some((s) => s.teaching);
  const list = assignments.data ?? [];

  const now = Date.now();
  const studentDone = (a: Assignment) => !a.can_manage && (a.my_attempts || a.window === "closed");
  const upcoming = list.filter((a) => new Date(a.due_at).getTime() >= now && !studentDone(a));
  const toDo = list.filter((a) => new Date(a.due_at).getTime() < now && !studentDone(a));
  const done = list.filter(studentDone);

  const groups: [string, Assignment[]][] = [
    ["Overdue", toDo],
    ["Coming up", upcoming],
    [teaches ? "Past" : "Done", done],
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-body font-semibold text-ink-2">
            {teaches ? "Work you've set and work you're doing" : "Coursework for your subjects"}
          </p>
          <PageTitle className="mt-1 text-large-title font-bold" text="Assignments" />
        </div>
        {teaches && (
          <Link
            href="/assignments/new"
            className="press inline-flex h-11 items-center rounded-full bg-accent px-5 text-body font-semibold text-on-accent"
          >
            New assignment
          </Link>
        )}
      </header>

      {assignments.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {assignments.isError && (
        <p role="alert" className="glass rounded-card p-6 text-body">
          Couldn&apos;t load assignments. Check your connection and try again.
        </p>
      )}
      {assignments.isSuccess && list.length === 0 && (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">No assignments yet</p>
          <p className="mt-1 text-body text-ink-2">
            {teaches
              ? "Set the first one for a subject you teach."
              : "Work your teachers set will show up here with its due date."}
          </p>
        </div>
      )}

      {groups
        .filter(([, items]) => items.length > 0)
        .map(([title, items]) => (
          <section key={title} aria-label={title} className="glass rounded-card p-4">
            <h2 className="mb-1 px-3 pt-1 text-headline font-semibold">{title}</h2>
            <ul className="stagger flex flex-col">
              {items.map((a) => (
                <Row key={a.id} a={a} tz={tz} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
