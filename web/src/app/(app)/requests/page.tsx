"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageTitle } from "@/components/page-title";
import { Switch } from "@/components/switch";
import { RequestCard } from "@/components/rep-request-card";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/queries";
import { type RepsMine, useRepRequests, useRepsMine } from "@/lib/reps";

function TeacherSettings({ mine }: { mine: RepsMine }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (body: { without_approval: boolean } | { unblock: number }) =>
      "unblock" in body
        ? apiFetch<RepsMine>(`/api/reps/blocks/${body.unblock}`, { method: "DELETE" })
        : apiFetch<RepsMine>("/api/reps/settings", { method: "PUT", body: JSON.stringify(body) }),
    // The switch moves at once; the server's answer replaces it, or it springs back on failure.
    onMutate: (body) => {
      const before = qc.getQueryData<RepsMine>(["reps", "mine"]);
      if (before && "without_approval" in body) {
        qc.setQueryData<RepsMine>(["reps", "mine"], { ...before, without_approval: body.without_approval });
      }
      return { before };
    },
    onError: (_err, _body, ctx) => ctx?.before && qc.setQueryData(["reps", "mine"], ctx.before),
    onSuccess: (data) => qc.setQueryData(["reps", "mine"], data),
  });
  return (
    <section aria-labelledby="cr-settings-h" className="glass flex flex-col gap-4 rounded-card p-5">
      <h2 id="cr-settings-h" className="text-headline font-semibold">CR and GR changes to your lectures</h2>
      <span className="flex flex-wrap items-center justify-between gap-3 text-body">
        <span>
          Let them cancel and shift without asking me
          <span className="block text-footnote text-ink-2">
            Off: you approve each change, at least 15 minutes before the lecture. On: it happens at once
            and you&apos;re asked whether you knew.
          </span>
        </span>
        <Switch checked={mine.without_approval} onChange={(v) => save.mutate({ without_approval: v })}
          label="Let CR and GR change my lectures without asking me" />
      </span>
      {mine.blocked.length > 0 && (
        <div>
          <p className="text-footnote font-semibold text-ink-2">You took changes back from</p>
          <ul className="mt-1">
            {mine.blocked.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-1.5 text-body">
                {b.name}
                <button onClick={() => save.mutate({ unblock: b.id })}
                  className="press h-8 rounded-full bg-fill-strong px-3 text-footnote font-semibold">Allow again</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** CR/GR requests: approve or decline, answer "Did you know?", and (teachers) the setting. */
export default function RequestsPage() {
  const me = useMe().data;
  const mine = useRepsMine().data;
  const list = useRepRequests();
  const teacher = me?.sections.some((s) => s.teaching);
  const waiting = (list.data ?? []).filter((r) => r.can_decide || r.can_reply);
  const rest = (list.data ?? []).filter((r) => !(r.can_decide || r.can_reply));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <p className="text-body font-semibold text-ink-2">Lectures cancelled or shifted on CR and GR call</p>
        <PageTitle className="mt-1 text-large-title font-bold" text="Class requests" />
      </header>

      {teacher && mine && <TeacherSettings mine={mine} />}

      <section aria-labelledby="waiting-h" className="glass rounded-card px-5 py-3">
        <h2 id="waiting-h" className="pt-2 text-headline font-semibold">Waiting for you</h2>
        {list.isPending ? (
          <p className="py-3 text-body text-ink-2">Loading…</p>
        ) : waiting.length === 0 ? (
          <p className="py-3 text-body text-ink-2">Nothing right now.</p>
        ) : (
          <ul>{waiting.map((r) => <RequestCard key={r.id} r={r} />)}</ul>
        )}
      </section>

      {rest.length > 0 && (
        <section aria-labelledby="recent-h" className="glass rounded-card px-5 py-3">
          <h2 id="recent-h" className="pt-2 text-headline font-semibold">Recent</h2>
          <ul>{rest.map((r) => <RequestCard key={r.id} r={r} />)}</ul>
        </section>
      )}
    </div>
  );
}
