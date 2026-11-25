"use client";

import { errorDetail } from "@/lib/api";
import { formatDay, relativeTime } from "@/lib/format";
import { type RepRequest, repSummary, stageLabel, useRepAnswer } from "@/lib/reps";

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

function when(r: RepRequest) {
  const at = `${formatDay(r.date, { month: "short" })}${r.starts_at ? `, ${hhmm(r.starts_at)}` : ""}`;
  if (r.action === "shift" && r.new_date) {
    return `${at} → ${formatDay(r.new_date, { month: "short" })}${r.new_starts_at ? `, ${hhmm(r.new_starts_at)}` : ""}`;
  }
  return at;
}

/** One request, with the buttons this person may press. */
export function RequestCard({ r }: { r: RepRequest }) {
  const answer = useRepAnswer();
  const pending = r.can_decide || r.can_reply;
  const button = "press h-9 rounded-full px-3.5 text-footnote font-semibold disabled:opacity-60";
  return (
    <li id={`request-${r.id}`} className="flex flex-col gap-2 border-b border-divider py-4 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-body font-semibold">{repSummary(r)}</span>
        <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${
          pending ? "bg-warning/20 text-warning-ink" : r.stage === "applied" ? "bg-success/12 text-success-ink" : "bg-fill-strong text-ink-2"
        }`}>
          {r.can_reply ? "Did you know?" : stageLabel[r.stage]}
        </span>
      </div>
      <p className="text-footnote text-ink-2">
        {r.course_code} · {r.section_code} · {when(r)} · asked {relativeTime(r.created_at)}
        {r.note && ` · “${r.note}”`}
        {r.teacher_reply === "known" && " · The teacher knew"}
        {r.decided_by && !pending && ` · ${r.stage === "declined" ? "Declined" : "Approved"} by ${r.decided_by}`}
      </p>
      {r.can_decide && (
        <div className="flex flex-wrap gap-2">
          <button disabled={answer.isPending} onClick={() => answer.mutate({ id: r.id, kind: "decide", yes: true })}
            className={`${button} bg-accent text-on-accent`}>Approve</button>
          <button disabled={answer.isPending} onClick={() => answer.mutate({ id: r.id, kind: "decide", yes: false })}
            className={`${button} bg-fill-strong`}>Decline</button>
        </div>
      )}
      {r.can_reply && (
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={answer.isPending} onClick={() => answer.mutate({ id: r.id, kind: "reply", yes: true })}
            className={`${button} bg-accent text-on-accent`}>Yes, I knew</button>
          <button disabled={answer.isPending} onClick={() => answer.mutate({ id: r.id, kind: "reply", yes: false })}
            className={`${button} text-danger-ink hover:bg-danger/10`}>No, undo it</button>
          <span className="text-caption text-ink-3">“No” undoes it and stops {r.requester} changing your lectures.</span>
        </div>
      )}
      {answer.isError && <p role="alert" className="text-footnote text-danger-ink">{errorDetail(answer.error, "That didn't work.")}</p>}
    </li>
  );
}
