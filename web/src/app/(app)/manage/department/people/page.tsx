"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChipGroup } from "@/components/chip-group";
import { PageTitle } from "@/components/page-title";
import { apiFetch } from "@/lib/api";
import { relativeTime } from "@/lib/format";

interface DeptPerson {
  id: number;
  name: string;
  email: string;
  kind: "student" | "teacher" | "staff";
  external_id: string;
  sections: number;
  last_login: string | null;
}

const KINDS = [
  { value: "", label: "Everyone" },
  { value: "student", label: "Students" },
  { value: "teacher", label: "Teachers" },
];

/** For department coordinators: the students and teachers in their departments' sections. */
export default function DepartmentPeoplePage() {
  const [q, setQ] = useState("");
  const [typed, setTyped] = useState("");
  const [kind, setKind] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 250);
    return () => clearTimeout(t);
  }, [typed]);

  const people = useQuery({
    queryKey: ["manage", "department", "people", q, kind],
    queryFn: () =>
      apiFetch<DeptPerson[]>(
        `/api/manage/structure/department/people?q=${encodeURIComponent(q)}&kind=${kind}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-body font-semibold text-ink-2">Students and teachers in your departments&apos; sections</p>
          <PageTitle className="mt-1 text-large-title font-bold" text="Department people" />
        </div>
        <a
          href={`/api/manage/structure/department/people.csv${kind ? `?kind=${kind}` : ""}`}
          download
          className="press inline-flex h-9 items-center rounded-full bg-fill-strong px-3.5 text-footnote font-semibold"
        >
          Download (Excel)
        </a>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="min-w-64 flex-1">
          <span className="sr-only">Search people</span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Search by name, email or college ID"
            className="h-11 w-full rounded-full border border-transparent bg-fill px-4 text-body outline-none focus:border-accent"
          />
        </label>
        <ChipGroup label="Show" value={kind} onChange={setKind} options={KINDS} />
      </div>

      <section aria-label="People" className="glass rounded-card p-3">
        {people.isPending && <p className="p-3 text-body text-ink-2">Loading…</p>}
        {people.isError && (
          <p role="alert" className="p-3 text-body text-ink-2">
            This page is for department coordinators and admins.
          </p>
        )}
        {people.data?.length === 0 && <p className="p-3 text-body text-ink-2">Nobody matches.</p>}
        <ul className={people.isFetching ? "opacity-60" : ""}>
          {people.data?.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 border-b border-divider p-3 last:border-0">
              <span className="min-w-[12rem] flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-body font-semibold">{p.name}</span>
                  <span className="rounded-full bg-fill-strong px-2 py-0.5 text-caption font-semibold capitalize">{p.kind}</span>
                  {p.external_id && <span className="text-footnote text-ink-3">{p.external_id}</span>}
                </span>
                <span className="block text-footnote text-ink-2">
                  {p.email} · {p.sections} {p.sections === 1 ? "section" : "sections"} ·{" "}
                  {p.last_login ? `last signed in ${relativeTime(p.last_login)}` : "never signed in"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
