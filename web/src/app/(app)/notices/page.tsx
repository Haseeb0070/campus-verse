"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Pushpin, noteTilt } from "@/components/pushpin";
import { apiFetch } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useAudiences, useMyNotices, useNotices } from "@/lib/queries";
import type { MyNotice, Notice } from "@/lib/types";
import { PageTitle } from "@/components/page-title";

export default function NoticesPage() {
  const notices = useNotices();
  const audiences = useAudiences();
  const canPost = (audiences.data?.length ?? 0) > 0;
  const mine = useMyNotices(canPost);

  // Arriving from a link to one notice (/notices#notice-6): once the board has loaded, bring that
  // note into view and lift it for a moment. Client-side links don't trigger CSS :target.
  const [found, setFound] = useState<string | null>(null);
  useEffect(() => {
    if (!notices.data) return;
    const id = window.location.hash.slice(1);
    const note = id ? document.getElementById(id) : null;
    if (!note) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    note.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    setFound(id);
    const done = setTimeout(() => setFound(null), 2600);
    return () => clearTimeout(done);
  }, [notices.data]);

  const pinned = notices.data?.filter((n) => n.priority === "important") ?? [];
  const latest = notices.data?.filter((n) => n.priority !== "important") ?? [];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle className="text-large-title font-bold" text="Notices" />
          <p className="mt-1 text-body text-ink-2">From your teachers, department and campus.</p>
        </div>
        {canPost && (
          <Link
            href="/notices/new"
            className="press inline-flex h-11 items-center rounded-full bg-accent px-5 text-body font-semibold text-on-accent"
          >
            New notice
          </Link>
        )}
      </header>

      {canPost && (mine.data?.length ?? 0) > 0 && (
        <section aria-labelledby="mine-h" className="glass rounded-card p-5">
          <h2 id="mine-h" className="mb-2 px-1 text-headline font-semibold">
            Your notices
          </h2>
          <ul className="flex flex-col gap-1">
            {mine.data?.map((n) => <MyNoticeRow key={n.id} notice={n} />)}
          </ul>
        </section>
      )}

      {notices.isError && (
        <p role="alert" className="glass rounded-card p-6 text-body">
          Couldn&apos;t load notices. Check your connection and try again.
        </p>
      )}

      <section
        aria-labelledby="board-h"
        aria-busy={notices.isPending || undefined}
        className="rounded-card border border-board-line bg-board px-4 pt-7 pb-6 sm:px-7 sm:pt-9 sm:pb-8"
      >
        <h2 id="board-h" className="sr-only">
          Notice board
        </h2>
        {notices.isPending && <p className="text-body text-ink-2">Loading notices…</p>}
        {notices.data?.length === 0 && (
          <div className="note note-in relative mx-auto max-w-sm rounded-md bg-paper px-6 pt-7 pb-6 text-center" style={{ "--tilt": "-1deg" } as React.CSSProperties}>
            <Pushpin className="pin absolute -top-2.5 left-1/2 size-7 -translate-x-1/2 text-ink-3" />
            <p className="text-headline font-semibold">Nothing pinned up yet</p>
            <p className="mt-1 text-body text-ink-2">
              Notices from your teachers, department and campus will go up here.
            </p>
          </div>
        )}
        {pinned.length > 0 && <BoardGroup title="Pinned" notices={pinned} offset={0} found={found} />}
        {latest.length > 0 && (
          <BoardGroup
            title={pinned.length > 0 ? "Latest" : undefined}
            notices={latest}
            offset={pinned.length}
            found={found}
          />
        )}
      </section>
    </div>
  );
}

/** One run of notes on the board. `offset` continues the pin-in stagger from the group above. */
function BoardGroup({
  title,
  notices,
  offset,
  found,
}: {
  title?: string;
  notices: Notice[];
  offset: number;
  /** The note a link pointed at, lifted for a moment. */
  found: string | null;
}) {
  return (
    <div className="[&+&]:mt-10">
      {title && <h3 className="mb-5 text-footnote font-semibold text-ink-2">{title}</h3>}
      <ul className="grid grid-cols-1 items-start gap-x-7 gap-y-9 sm:grid-cols-2">
        {notices.map((n, i) => {
          const important = n.priority === "important";
          return (
            <li
              key={n.id}
              id={`notice-${n.id}`}
              className={`note note-in relative scroll-mt-10 rounded-md bg-paper px-5 pt-6 pb-5 sm:px-6 ${
                found === `notice-${n.id}` ? "note-found" : ""
              }`}
              style={
                {
                  "--tilt": `${noteTilt(n.id)}deg`,
                  "--delay": `${Math.min(offset + i, 8) * 55}ms`,
                } as React.CSSProperties
              }
            >
              <Pushpin
                className={`pin absolute -top-2.5 left-1/2 size-7 -translate-x-1/2 ${important ? "text-danger" : "text-accent"}`}
              />
              <article>
                {important && (
                  <span className="mb-2 inline-block rounded-full bg-danger/12 px-2 py-0.5 text-caption font-semibold text-danger-ink">
                    Important
                  </span>
                )}
                <h4 className="text-title-2 font-bold">{n.title}</h4>
                <p className="mt-1 text-footnote text-ink-2">
                  {n.author_name}
                  {n.published_at && (
                    <>
                      {" · "}
                      <time dateTime={n.published_at} title={new Date(n.published_at).toLocaleString()}>
                        {relativeTime(n.published_at)}
                      </time>
                    </>
                  )}
                </p>
                <p className="mt-3 whitespace-pre-line text-body">{n.body}</p>
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MyNoticeRow({ notice: n }: { notice: MyNotice }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  async function act(path: "publish" | "archive" | "unschedule") {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/notices/${n.id}/${path}`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["notices"] });
    } catch {
      setError(
        { publish: "Couldn't publish.", archive: "Couldn't archive.", unschedule: "Couldn't cancel." }[path] +
          " Try again.",
      );
    } finally {
      setBusy(false);
      setConfirmArchive(false);
    }
  }

  const audience = n.targets.map((t) => t.label).join(", ") || "No audience yet";
  const chip =
    n.status === "scheduled"
      ? { text: "Scheduled", cls: "bg-accent/12 text-accent-ink" }
      : n.status === "draft"
        ? { text: "Draft", cls: "bg-warning/18 text-ink" }
        : n.expired
          ? { text: "Expired", cls: "bg-fill-strong text-ink-2" }
          : { text: "Published", cls: "bg-success/15 text-ink" };
  const when =
    n.status === "scheduled" && n.publish_at
      ? ` · goes out ${formatDateTime(n.publish_at)}`
      : n.published_at
        ? ` · ${relativeTime(n.published_at)}`
        : ` · edited ${relativeTime(n.updated_at)}`;
  const until = n.expires_at && !n.expired ? ` · until ${formatDateTime(n.expires_at)}` : "";
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-row p-2.5 hover:bg-fill">
      <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${chip.cls}`}>{chip.text}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold">{n.title}</span>
        <span className="block truncate text-footnote text-ink-2">
          {audience} · {n.reach} {n.reach === 1 ? "person" : "people"}
          {when}
          {until}
        </span>
        {error && <span className="block text-footnote text-danger-ink">{error}</span>}
      </span>
      <span className="flex items-center gap-2 text-footnote font-semibold">
        {n.status === "scheduled" && (
          <button onClick={() => act("unschedule")} disabled={busy}
            className="rounded-full px-2 py-1.5 text-ink-2 hover:bg-fill-strong">
            Cancel schedule
          </button>
        )}
        {(n.status === "draft" || n.status === "scheduled") && n.targets.length > 0 && (
          <button
            onClick={() => act("publish")}
            disabled={busy}
            className="press rounded-full bg-accent px-3 py-1.5 text-on-accent disabled:opacity-60"
          >
            {n.status === "scheduled" ? "Publish now" : "Publish"}
          </button>
        )}
        {confirmArchive ? (
          <>
            <span className="text-ink-2">Remove from feeds?</span>
            <button onClick={() => act("archive")} disabled={busy} className="text-danger-ink">
              Archive
            </button>
            <button onClick={() => setConfirmArchive(false)}>Cancel</button>
          </>
        ) : (
          <button onClick={() => setConfirmArchive(true)} className="rounded-full px-2 py-1.5 text-ink-2 hover:bg-fill-strong">
            Archive
          </button>
        )}
      </span>
    </li>
  );
}
