"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, errorDetail } from "@/lib/api";
import { reasonLabels } from "@/lib/feed";

export function ReportDialog({
  target,
  onClose,
}: {
  target: { type: "post" | "comment"; id: number };
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return setError("Choose a reason.");
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/feed/reports", {
        method: "POST",
        body: JSON.stringify({ target_type: target.type, target_id: target.id, reason, details }),
      });
      setSent(true);
    } catch (err) {
      setError(errorDetail(err, "Couldn't send the report. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="report-title"
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-card border border-divider bg-[var(--cv-bg)] p-0 text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      {sent ? (
        <div className="arrive flex flex-col gap-4 p-6">
          <h2 id="report-title" className="text-title-2 font-bold">Thanks for telling us</h2>
          <p className="text-body text-ink-2">
            A moderator will review it. The author isn&apos;t told who reported them.
          </p>
          <button onClick={() => dialog.current?.close()}
            className="press h-11 self-end rounded-full bg-accent px-5 text-body font-semibold text-on-accent">
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="arrive flex flex-col gap-4 p-6">
          <h2 id="report-title" className="text-title-2 font-bold">Report this {target.type}</h2>
          <fieldset className="flex flex-col gap-1">
            <legend className="sr-only">Reason</legend>
            {Object.entries(reasonLabels).map(([value, label]) => (
              <label key={value} className="flex items-center gap-3 rounded-row p-2.5 text-body hover:bg-fill">
                <input type="radio" name="reason" value={value} checked={reason === value}
                  onChange={() => setReason(value)} className="size-4 accent-[var(--cv-accent)]" />
                {label}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
            Anything else a moderator should know? (optional)
            <textarea value={details} maxLength={500} rows={3} onChange={(e) => setDetails(e.target.value)}
              className="resize-none rounded-control border border-transparent bg-fill px-3 py-2 text-body font-normal text-ink outline-none focus:border-accent" />
          </label>
          {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => dialog.current?.close()}
              className="press h-11 rounded-full bg-fill-strong px-5 text-body font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60">
              {busy ? "Sending…" : "Send report"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
