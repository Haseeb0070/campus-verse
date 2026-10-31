"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { apiFetch, errorDetail } from "@/lib/api";
import { type QueuedReport, reasonLabels, useModerationSummary, useReports } from "@/lib/feed";
import { relativeTime } from "@/lib/format";

export default function ModerationPage() {
  const summary = useModerationSummary().data;
  const reports = useReports();

  if (summary && !summary.can_moderate) {
    return (
      <div className="glass mx-auto max-w-xl rounded-card p-6">
        <p className="text-headline font-semibold">This area is for moderators</p>
        <p className="mt-1 text-body text-ink-2">Teachers moderate their sections; admins and moderators everything.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <p className="text-body font-semibold text-ink-2">Reports from your spaces</p>
        <h1 className="mt-1 text-large-title font-bold">Moderation</h1>
      </header>

      {reports.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {reports.data?.length === 0 && (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">No open reports</p>
          <p className="mt-1 text-body text-ink-2">When someone reports a post or comment you moderate, it shows up here.</p>
        </div>
      )}
      <ul className="flex flex-col gap-4">
        {reports.data?.map((r) => (
          <ReportCard key={r.id} report={r} />
        ))}
      </ul>
      <p className="px-1 text-footnote text-ink-3">
        Every decision is recorded in the audit log with your note. Authors are told when their content is hidden or
        removed, but not who reported it.
      </p>
    </div>
  );
}

function ReportCard({ report: r }: { report: QueuedReport }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(action: "dismiss" | "hide" | "remove") {
    setError(null);
    try {
      await apiFetch(`/api/feed/moderation/reports/${r.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ action, note }),
      });
      await queryClient.invalidateQueries({ queryKey: ["moderation"] });
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
    } catch (err) {
      setError(errorDetail(err, "That didn't work. Try again."));
    }
  }

  return (
    <li className="glass flex flex-col gap-3 rounded-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-danger/12 px-2.5 py-1 text-caption font-semibold text-danger-ink">
          {reasonLabels[r.reason] ?? r.reason}
        </span>
        {r.reports_on_target > 1 && (
          <span className="rounded-full bg-warning/18 px-2.5 py-1 text-caption font-semibold">
            {r.reports_on_target} reports on this {r.target_type}
          </span>
        )}
        <span className="text-footnote text-ink-2">
          Reported by {r.reporter} · {relativeTime(r.created_at)}
        </span>
      </div>
      {r.details && <p className="text-footnote text-ink-2">&ldquo;{r.details}&rdquo;</p>}

      <blockquote className="rounded-row bg-fill p-3">
        <p className="text-caption font-semibold text-ink-2">
          {r.target_type === "post" ? "Post" : "Comment"} by {r.author}
          {r.visibility === "hidden" && " · already hidden"}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-body">{r.body}</p>
        <Link href={`/feed#post-${r.post_id}`} className="mt-1 inline-block text-footnote font-semibold text-accent-ink">
          See it in the feed
        </Link>
      </blockquote>

      <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
        Note for the record (shown to the author if you hide or remove)
        <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)}
          placeholder="Breaks the academic integrity policy"
          className="h-11 rounded-control border border-transparent bg-fill px-3 text-body font-normal text-ink outline-none focus:border-accent" />
      </label>

      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={() => resolve("dismiss")} className="press h-10 rounded-full bg-fill-strong px-4 text-footnote font-semibold">
          Dismiss report
        </button>
        <button onClick={() => resolve("hide")} className="press h-10 rounded-full bg-accent px-4 text-footnote font-semibold text-on-accent">
          Hide {r.target_type}
        </button>
        {confirmRemove ? (
          <button onClick={() => resolve("remove")} className="press h-10 rounded-full bg-danger px-4 text-footnote font-semibold text-on-accent">
            Remove for good
          </button>
        ) : (
          <button onClick={() => setConfirmRemove(true)} className="press h-10 rounded-full px-4 text-footnote font-semibold text-danger-ink hover:bg-danger/10">
            Remove
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
    </li>
  );
}
