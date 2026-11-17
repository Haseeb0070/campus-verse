"use client";

import { ChipGroup } from "@/components/chip-group";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Select } from "@/components/select";
import { apiFetch } from "@/lib/api";
import { courseBg, relativeTime } from "@/lib/format";
import type { CourseColor } from "@/lib/types";
import { PageTitle } from "@/components/page-title";

interface Hit {
  id: number;
  title: string;
  snippet: string;
  link: string;
  date: string | null;
  course: string | null;
  color?: CourseColor | null;
  status?: string | null;
  draft?: boolean | null;
}

interface Results {
  query: string;
  total: number;
  results: Partial<Record<Kind, Hit[]>>;
}

type Kind = "notices" | "courses" | "resources" | "posts" | "events" | "assignments";

const KINDS: { key: Kind; label: string }[] = [
  { key: "notices", label: "Notices" },
  { key: "courses", label: "Courses" },
  { key: "resources", label: "Resources" },
  { key: "posts", label: "Feed" },
  { key: "events", label: "Events" },
  { key: "assignments", label: "Assignments" },
];
const PER_KIND = 6;

const field =
  "h-11 w-full rounded-full border border-transparent bg-fill px-4 text-body outline-none focus:border-accent";

/** The query's words, marked in place. Plain text in, React nodes out: never HTML. */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(pattern).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-[4px] bg-warning/30 px-0.5 text-ink">{part}</mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(params.get("q") ?? "");
  const kind = (params.get("type") ?? "") as Kind | "";
  const course = params.get("course") ?? "";
  const days = params.get("days") ?? "";
  const committed = params.get("q") ?? "";

  // Keep the address in step with what's typed, so results can be shared or bookmarked.
  function go(next: Record<string, string>) {
    const merged = { q: committed, type: kind, course, days, ...next };
    const sp = new URLSearchParams(Object.entries(merged).filter(([, v]) => v));
    router.replace(`/search?${sp}`);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim() !== committed) go({ q: q.trim() });
    }, 250);
    return () => clearTimeout(t);
  });

  useEffect(() => input.current?.focus(), []);

  const courses = useQuery({
    queryKey: ["search", "courses"],
    queryFn: () => apiFetch<{ id: number; code: string; title: string }[]>("/api/search/courses"),
    staleTime: 5 * 60_000,
  });
  const results = useQuery({
    queryKey: ["search", committed, kind, course, days],
    queryFn: () => {
      const sp = new URLSearchParams({ q: committed });
      if (kind) sp.set("type", kind);
      if (course) sp.set("course", course);
      if (days) sp.set("days", days);
      return apiFetch<Results>(`/api/search?${sp}`);
    },
    enabled: committed.length >= 2,
    placeholderData: keepPreviousData,
  });
  const words = committed.split(/\s+/).filter(Boolean);
  const groups = KINDS.filter((k) => (results.data?.results[k.key]?.length ?? 0) > 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <PageTitle className="text-large-title font-bold" text="Search" />
        <p className="mt-1 text-body text-ink-2">Only things you can already open show up here.</p>
      </header>

      <form role="search" onSubmit={(e) => { e.preventDefault(); go({ q: q.trim() }); }} className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="search-box">Search CampusVerse</label>
        <input id="search-box" ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Notices, courses, resources, events, assignments…"
          className="glass h-12 w-full rounded-full px-5 text-headline outline-none focus:ring-2 focus:ring-accent/50" />
        <div className="flex flex-wrap items-center gap-3">
          <ChipGroup label="Show" value={kind} onChange={(k) => go({ type: k })}
            options={[{ value: "", label: "Everything" }, ...KINDS.map((k) => ({ value: k.key, label: k.label }))]} />
          <label className="w-44">
            <span className="sr-only">Course</span>
            <Select value={course} onChange={(v) => go({ course: v })} label="Course" className={field}
              options={[{ value: "", label: "Any course" },
                ...(courses.data ?? []).map((c) => ({ value: String(c.id), label: c.code, detail: c.title }))]} />
          </label>
          <label className="w-40">
            <span className="sr-only">When</span>
            <Select value={days} onChange={(v) => go({ days: v })} label="When" className={field}
              options={[{ value: "", label: "Any time" }, { value: "7", label: "Past week" },
                { value: "30", label: "Past month" }, { value: "365", label: "Past year" }]} />
          </label>
        </div>
      </form>

      {committed.length < 2 ? (
        <p className="text-body text-ink-2">Type at least two letters.</p>
      ) : results.isPending ? (
        <p className="text-body text-ink-2">Searching…</p>
      ) : results.data && results.data.total === 0 ? (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">Nothing found for “{committed}”</p>
          <p className="mt-1 text-body text-ink-2">Try fewer words, or clear the filters.</p>
        </div>
      ) : (
        <div className={`flex flex-col gap-4 ${results.isFetching ? "opacity-60" : ""}`} aria-live="polite">
          {groups.map((g) => {
            const hits = results.data!.results[g.key]!;
            return (
              <section key={g.key} aria-labelledby={`h-${g.key}`} className="glass rounded-card p-3">
                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                  <h2 id={`h-${g.key}`} className="text-headline font-semibold">{g.label}</h2>
                  {!kind && hits.length >= PER_KIND && (
                    <button onClick={() => go({ type: g.key })} className="text-footnote font-semibold text-accent-ink">
                      See all
                    </button>
                  )}
                </div>
                <ul>
                  {hits.map((h) => (
                    <li key={h.id}>
                      <Link href={h.link} className="press flex gap-3 rounded-row p-3 hover:bg-fill">
                        {h.color ? (
                          <span className={`mt-1 h-9 w-1 shrink-0 rounded-full ${courseBg[h.color]}`} aria-hidden="true" />
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className={`block text-body font-semibold ${h.status === "cancelled" ? "text-ink-2 line-through" : ""}`}>
                            <Highlight text={h.title} words={words} />
                          </span>
                          {h.snippet && (
                            <span className="line-clamp-2 block text-footnote text-ink-2">
                              <Highlight text={h.snippet} words={words} />
                            </span>
                          )}
                          <span className="mt-0.5 block text-caption text-ink-3">
                            {[h.course, h.draft ? "Draft" : null, h.status === "cancelled" ? "Cancelled" : null,
                              h.date ? relativeTime(h.date) : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchInner />
    </Suspense>
  );
}
