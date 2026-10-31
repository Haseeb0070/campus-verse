"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DocumentIcon, LinkIcon } from "@/components/icons";
import { courseBg, fileSize, relativeTime } from "@/lib/format";
import { fileUrl, kindLabels, useResources, useShareOptions } from "@/lib/resources";
import type { Resource, ResourceKind } from "@/lib/resources";
import { Select } from "@/components/select";

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function ResourceRow({ r }: { r: Resource }) {
  const meta = [
    r.kind_label,
    r.file ? fileSize(r.file.size) : hostOf(r.url),
    r.version > 1 ? `Updated ${relativeTime(r.updated_at)}` : relativeTime(r.created_at),
  ];
  if (r.can_manage) meta.push(r.audiences.join(", "));
  const Icon = r.url ? LinkIcon : DocumentIcon;

  return (
    <li className="flex items-center gap-1 rounded-row hover:bg-fill">
      <Link href={`/resources/${r.id}`} className="press flex min-w-0 flex-1 items-center gap-3 p-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-fill-strong text-ink-2">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-body font-semibold">{r.title}</span>
            {r.version > 1 && (
              <span className="shrink-0 rounded-md bg-fill-strong px-1.5 py-px text-caption font-semibold text-ink-2">
                v{r.version}
              </span>
            )}
          </span>
          <span className="block truncate text-footnote text-ink-2">{meta.join(" · ")}</span>
        </span>
      </Link>
      <a
        href={r.url || fileUrl(r.file!.id)}
        {...(r.url ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        aria-label={`${r.url ? "Open" : "Download"} ${r.title}`}
        className="press mr-2 shrink-0 rounded-full bg-fill-strong px-3.5 py-1.5 text-footnote font-semibold text-accent-ink"
      >
        {r.url ? "Open" : "Download"}
      </a>
    </li>
  );
}

function CourseGroup({ items }: { items: Resource[] }) {
  const first = items[0];
  return (
    <section aria-label={`${first.course_code} ${first.course_title}`} className="glass rounded-card p-3">
      <h2 className="flex items-center gap-2.5 px-3 pt-2 pb-1">
        <span className={`size-3 rounded ${courseBg[first.color]}`} aria-hidden="true" />
        <span className="text-headline font-semibold">{first.course_title}</span>
        <span className="text-footnote text-ink-2">
          {first.course_code} · {first.term}
        </span>
      </h2>
      <ul>
        {items.map((r) => (
          <ResourceRow key={r.id} r={r} />
        ))}
      </ul>
    </section>
  );
}

function byCourse(list: Resource[]) {
  const groups = new Map<number, Resource[]>();
  for (const r of list) groups.set(r.offering_id, [...(groups.get(r.offering_id) ?? []), r]);
  return [...groups.values()].sort((a, b) => a[0].course_code.localeCompare(b[0].course_code));
}

export default function ResourcesPage() {
  const resources = useResources();
  const canShare = (useShareOptions().data?.courses.length ?? 0) > 0;
  const [course, setCourse] = useState<number | null>(null);
  const [kind, setKind] = useState<ResourceKind | "">("");
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const all = useMemo(() => resources.data ?? [], [resources.data]);
  const courses = useMemo(
    () => byCourse(all).map((g) => ({ id: g[0].offering_id, code: g[0].course_code })),
    [all],
  );
  const needle = q.trim().toLowerCase();
  const matches = all.filter(
    (r) =>
      (course === null || r.offering_id === course) &&
      (!kind || r.kind === kind) &&
      (!needle || `${r.title} ${r.description}`.toLowerCase().includes(needle)),
  );
  const active = matches.filter((r) => r.status === "active");
  const archived = matches.filter((r) => r.status === "archived");
  const filtering = course !== null || kind !== "" || needle !== "";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-body font-semibold text-ink-2">
            {canShare ? "Material you share and material shared with you" : "Course material from your teachers"}
          </p>
          <h1 className="mt-1 text-large-title font-bold">Resources</h1>
        </div>
        {canShare && (
          <Link
            href="/resources/new"
            className="press inline-flex h-11 items-center rounded-full bg-accent px-5 text-body font-semibold text-on-accent"
          >
            Share a resource
          </Link>
        )}
      </header>

      {all.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {courses.length > 1 && (
            <div role="radiogroup" aria-label="Course" className="glass flex max-w-full gap-1 overflow-x-auto rounded-full p-1">
              {[{ id: null, code: "All courses" }, ...courses].map((c) => (
                <button key={c.id ?? "all"} role="radio" aria-checked={course === c.id} onClick={() => setCourse(c.id)}
                  className={`h-9 whitespace-nowrap rounded-full px-3.5 text-footnote font-semibold ${
                    course === c.id ? "bg-accent text-on-accent" : "text-ink-2"}`}>
                  {c.code}
                </button>
              ))}
            </div>
          )}
          <label>
            <span className="sr-only">Type</span>
            <Select value={kind} onChange={(v) => setKind(v as ResourceKind | "")} label="Type"
              className="glass h-11 min-w-40 rounded-full px-4 text-body font-semibold"
              options={[{ value: "", label: "All types" },
                ...Object.entries(kindLabels).map(([value, label]) => ({ value, label }))]} />
          </label>
          <label className="min-w-[12rem] flex-1">
            <span className="sr-only">Search resources</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search resources"
              className="glass h-11 w-full rounded-full px-4 text-body outline-none focus:ring-2 focus:ring-accent/50" />
          </label>
        </div>
      )}

      {resources.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {resources.isError && (
        <p role="alert" className="glass rounded-card p-6 text-body">
          Couldn&apos;t load resources. Check your connection and try again.
        </p>
      )}
      {resources.isSuccess && all.length === 0 && (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">Nothing shared yet</p>
          <p className="mt-1 text-body text-ink-2">
            {canShare
              ? "Share slides, notes, readings or links with the sections you teach."
              : "Slides, notes and readings your teachers share will be kept here, grouped by course."}
          </p>
        </div>
      )}
      {resources.isSuccess && all.length > 0 && active.length === 0 && filtering && (
        <p className="glass rounded-card p-6 text-body text-ink-2">
          Nothing matches.{" "}
          <button
            onClick={() => {
              setCourse(null);
              setKind("");
              setQ("");
            }}
            className="font-semibold text-accent-ink"
          >
            Clear filters
          </button>
        </p>
      )}

      {byCourse(active).map((items) => (
        <CourseGroup key={items[0].offering_id} items={items} />
      ))}

      {archived.length > 0 && (
        <div className="flex flex-col gap-3">
          <button
            aria-expanded={showArchived}
            onClick={() => setShowArchived((s) => !s)}
            className="press self-start rounded-full bg-fill-strong px-4 py-2 text-footnote font-semibold"
          >
            {showArchived ? "Hide archived" : `Show archived (${archived.length})`}
          </button>
          {showArchived && (
            <>
              <p className="px-1 text-footnote text-ink-2">
                Kept for reference. It may be out of date.
              </p>
              {byCourse(archived).map((items) => (
                <CourseGroup key={items[0].offering_id} items={items} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
