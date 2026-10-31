"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useAudiences, useMyNotices, useNotices } from "@/lib/queries";
import type { MyNotice } from "@/lib/types";

export default function NoticesPage() {
  const notices = useNotices();
  const audiences = useAudiences();
  const canPost = (audiences.data?.length ?? 0) > 0;
  const mine = useMyNotices(canPost);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-body font-semibold text-ink-2">For your courses and campus</p>
          <h1 className="mt-1 text-large-title font-bold">Notices</h1>
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

      {notices.isPending && <p className="text-body text-ink-2">Loading notices…</p>}
      {notices.isError && (
        <p role="alert" className="glass rounded-card p-6 text-body">
          Couldn&apos;t load notices. Check your connection and try again.
        </p>
      )}
      {notices.data?.length === 0 && (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">No notices yet</p>
          <p className="mt-1 text-body text-ink-2">
            Notices from your teachers, department and campus will appear here.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {notices.data?.map((n) => (
          <li key={n.id} id={`notice-${n.id}`} className="glass scroll-mt-6 rounded-card p-6">
            <article>
              {n.priority === "important" && (
                <span className="mb-2 inline-block rounded-full bg-danger/12 px-2 py-0.5 text-caption font-semibold text-danger-ink">
                  Important
                </span>
              )}
              <h2 className="text-title-2 font-bold">{n.title}</h2>
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
        ))}
      </ul>
    </div>
  );
}

function MyNoticeRow({ notice: n }: { notice: MyNotice }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
