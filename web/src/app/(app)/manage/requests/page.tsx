"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch, errorDetail } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useCorrectionQueue } from "@/lib/profile";
import type { ManagedCorrection } from "@/lib/profile";

function RequestRow({ c }: { c: ManagedCorrection }) {
  const queryClient = useQueryClient();
  const [response, setResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"resolved" | "declined" | null>(null);

  async function answer(status: "resolved" | "declined") {
    if (status === "declined" && !response.trim()) {
      return setError("Say why, so they know what to do next.");
    }
    setBusy(status);
    setError(null);
    try {
      await apiFetch(`/api/manage/corrections/${c.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ status, response }),
      });
      await queryClient.invalidateQueries({ queryKey: ["corrections", "queue"] });
    } catch (err) {
      setError(errorDetail(err, "Couldn't save. Try again."));
      setBusy(null);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-row bg-fill p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-fill-strong text-caption font-semibold">
          {c.person.initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold">{c.person.name}</span>
          <span className="block truncate text-footnote text-ink-2">
            {c.person.email} · {c.topic_label} · {relativeTime(c.created_at)}
          </span>
        </span>
      </div>
      <p className="whitespace-pre-wrap text-body">{c.details}</p>
      <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
        Reply (shown to them; needed when you decline)
        <input value={response} maxLength={500} onChange={(e) => setResponse(e.target.value)}
          placeholder="What you changed, or why not"
          className="h-11 w-full rounded-control border border-transparent bg-[var(--cv-bg)] px-3 text-body outline-none focus:border-accent" />
      </label>
      {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={() => answer("declined")} disabled={busy !== null}
          className="press h-10 rounded-full bg-fill-strong px-4 text-footnote font-semibold disabled:opacity-60">
          {busy === "declined" ? "Declining…" : "Decline"}
        </button>
        <button onClick={() => answer("resolved")} disabled={busy !== null}
          className="press h-10 rounded-full bg-accent px-4 text-footnote font-semibold text-on-accent disabled:opacity-60">
          {busy === "resolved" ? "Saving…" : "Mark as fixed"}
        </button>
      </div>
    </li>
  );
}

export default function RequestsPage() {
  const queue = useCorrectionQueue("open");
  const items = queue.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-body font-semibold text-ink-2">People asking to fix their records</p>
        <h1 className="mt-1 text-large-title font-bold">Requests</h1>
      </header>
      {queue.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {queue.isSuccess && items.length === 0 && (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">No open requests</p>
          <p className="mt-1 text-body text-ink-2">
            When someone reports a wrong name, email or enrollment from their profile, it shows up
            here. Fix the record under People or in the timetable import, then mark it fixed.
          </p>
        </div>
      )}
      {items.length > 0 && (
        <section aria-label="Open requests" className="glass rounded-card p-3">
          <ul className="flex flex-col gap-2">
            {items.map((c) => (
              <RequestRow key={c.id} c={c} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
