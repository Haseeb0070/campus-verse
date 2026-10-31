"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch, errorDetail } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { type ImportRow, type ImportRun, useImportRun, useImports } from "@/lib/manage";
import { useMe } from "@/lib/queries";

const statusChip: Record<ImportRow["status"], { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-success/15 text-ink" },
  update: { label: "Update", cls: "bg-accent/12 text-accent-ink" },
  unchanged: { label: "Unchanged", cls: "bg-fill-strong text-ink-2" },
  error: { label: "Error", cls: "bg-danger/12 text-danger-ink" },
};

type Filter = "changes" | "problems" | "all";

export default function ImportPage() {
  const queryClient = useQueryClient();
  const tz = useMe().data?.institution?.timezone;
  const runs = useImports();
  const [selected, setSelected] = useState<number | null>(null);
  const runId = selected ?? runs.data?.find((r) => r.status === "preview")?.id ?? null;
  const run = useImportRun(runId);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choose a CSV file first.");
    setBusy("upload");
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const created = await apiFetch<ImportRun>("/api/manage/imports/timetable", { method: "POST", body: form });
      setSelected(created.id);
      setFile(null);
      setFileKey((k) => k + 1);
      await queryClient.invalidateQueries({ queryKey: ["manage"] });
    } catch (err) {
      setError(errorDetail(err, "Couldn't read that file."));
    } finally {
      setBusy(null);
    }
  }

  async function act(action: "apply" | "discard") {
    if (!runId) return;
    setBusy(action);
    setError(null);
    try {
      await apiFetch(`/api/manage/imports/${runId}/${action}`, { method: "POST" });
      setSelected(runId);
      await queryClient.invalidateQueries({ queryKey: ["manage"] });
      await queryClient.invalidateQueries({ queryKey: ["timetable"] });
    } catch (err) {
      setError(errorDetail(err, "That didn't work. Try again."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header>
        <p className="text-body font-semibold text-ink-2">Smart Sync · CSV or Excel export</p>
        <h1 className="mt-1 text-large-title font-bold">Timetable import</h1>
      </header>

      <form onSubmit={upload} className="glass flex flex-col gap-4 rounded-card p-6" noValidate>
        <p className="text-body text-ink-2">
          Upload the timetable as a CSV. You&apos;ll see every change before anything is saved. Classes are matched by
          course, section, day and start time. Classes missing from the file are listed but never deleted.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            key={fileKey}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-label="Timetable CSV file"
            className="min-w-0 flex-1 text-body file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-fill-strong file:px-4 file:font-semibold"
          />
          <a href="/api/manage/imports/template.csv" className="text-footnote font-semibold text-accent-ink">
            Download template
          </a>
          <button type="submit" disabled={busy !== null}
            className="press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60">
            {busy === "upload" ? "Checking…" : "Preview import"}
          </button>
        </div>
        {error && <p role="alert" className="rounded-row bg-danger/10 px-4 py-3 text-footnote font-medium text-danger-ink">{error}</p>}
      </form>

      {run.data && <RunView run={run.data} tz={tz} busy={busy} onAct={act} />}

      {(runs.data?.length ?? 0) > 0 && (
        <section aria-labelledby="hist-h" className="glass rounded-card p-5">
          <h2 id="hist-h" className="mb-1 px-1 text-headline font-semibold">Previous imports</h2>
          <ul>
            {runs.data?.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelected(r.id)}
                  aria-current={r.id === runId ? "true" : undefined}
                  className={`press flex w-full flex-wrap items-center gap-3 rounded-row p-2.5 text-left ${
                    r.id === runId ? "bg-fill-strong" : "hover:bg-fill"
                  }`}
                >
                  <span className="min-w-0 flex-1 text-body">
                    <span className="font-semibold">{r.file_name}</span>
                    <span className="text-footnote text-ink-2"> · {formatDateTime(r.created_at, tz)} · {r.created_by}</span>
                  </span>
                  <span className="text-footnote text-ink-2">
                    {r.status === "applied"
                      ? `Applied: ${r.result.created ?? 0} new, ${r.result.updated ?? 0} updated`
                      : r.status === "discarded"
                        ? "Discarded"
                        : "Waiting for review"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function RunView({ run, tz, busy, onAct }: {
  run: ImportRun; tz?: string; busy: string | null; onAct: (a: "apply" | "discard") => void;
}) {
  const [filter, setFilter] = useState<Filter>("changes");
  const [confirm, setConfirm] = useState(false);
  const s = run.summary;
  const changes = (s.new ?? 0) + (s.update ?? 0);
  const rows = (run.rows ?? []).filter((r) =>
    filter === "all" ? true : filter === "problems" ? r.status === "error" || r.clash : r.status === "new" || r.status === "update",
  );

  const tiles: [string, number | undefined, string][] = [
    ["Rows read", s.rows, "text-ink"],
    ["New", s.new, "text-success-ink"],
    ["Updates", s.update, "text-accent-ink"],
    ["Unchanged", s.unchanged, "text-ink-2"],
    ["Errors", s.error, "text-danger-ink"],
    ["Room clashes", s.clash, "text-warning-ink"],
  ];

  return (
    <section aria-label="Import preview" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-title-2 font-bold">{run.file_name}</h2>
        <span className={`rounded-full px-3 py-1 text-footnote font-semibold ${
          run.status === "preview" ? "bg-warning/18" : run.status === "applied" ? "bg-success/15" : "bg-fill-strong text-ink-2"}`}>
          {run.status === "preview"
            ? "Dry run · nothing changed yet"
            : run.status === "applied"
              ? `Applied ${run.applied_at ? formatDateTime(run.applied_at, tz) : ""}`
              : "Discarded"}
        </span>
        <span className="text-footnote text-ink-2">{run.term}</span>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {tiles.map(([label, value, cls]) => (
          <div key={label} className="glass rounded-[20px] p-4">
            <p className="text-caption font-semibold text-ink-2">{label}</p>
            <p className={`text-title-2 font-bold tabular-nums ${cls}`}>{value ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="glass rounded-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3 px-1">
          <h3 className="text-headline font-semibold">Rows</h3>
          <div role="radiogroup" aria-label="Show" className="flex rounded-control bg-fill p-1">
            {(["changes", "problems", "all"] as const).map((f) => (
              <button key={f} role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}
                className={`h-8 rounded-[9px] px-3 text-footnote font-semibold capitalize ${
                  filter === f ? "bg-[var(--cv-bg)] shadow-sm" : "text-ink-2"}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 && <p className="px-1 py-3 text-body text-ink-2">Nothing in this view.</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-footnote">
              <thead className="text-caption text-ink-2">
                <tr>
                  {["Line", "Status", "Section", "When", "Room", "Details"].map((h) => (
                    <th key={h} scope="col" className="px-2 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className={`border-t border-divider ${r.status === "error" ? "bg-danger/5" : ""}`}>
                    <td className="px-2 py-2.5 text-ink-3 tabular-nums">{r.line}</td>
                    <td className="px-2 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${statusChip[r.status].cls}`}>
                        {statusChip[r.status].label}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 font-semibold">{r.section}</td>
                    <td className="px-2 py-2.5 tabular-nums">{r.day && `${r.day} ${r.start}–${r.end}`}</td>
                    <td className="px-2 py-2.5">{r.mode === "online" ? "Online" : r.room}</td>
                    <td className="px-2 py-2.5 text-ink-2">
                      {r.message}
                      {Object.entries(r.changes).map(([k, [a, b]]) => (
                        <span key={k} className="mr-3 inline-block">
                          {k}: <span className="text-ink-3 line-through">{a}</span> → <span className="font-semibold text-ink">{b}</span>
                        </span>
                      ))}
                      {r.clash && (
                        <span className="mt-1 block font-medium text-ink">
                          <span className="mr-1.5 rounded-full bg-warning/18 px-1.5 py-px text-caption font-semibold">Clash</span>
                          {r.clash}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(run.not_in_file?.length ?? 0) > 0 && (
          <details className="mt-3 px-1 text-footnote text-ink-2">
            <summary className="cursor-pointer font-semibold">
              {s.not_in_file} existing {s.not_in_file === 1 ? "class isn't" : "classes aren't"} in this file (kept as is)
            </summary>
            <p className="mt-2">{run.not_in_file?.join(" · ")}</p>
          </details>
        )}
      </div>

      {run.status === "preview" && (
        <div className="glass flex flex-wrap items-center justify-between gap-4 rounded-card p-5">
          <p className="text-body">
            <span className="font-semibold">
              Apply {changes} {changes === 1 ? "change" : "changes"}
              {s.error ? ` and skip ${s.error} ${s.error === 1 ? "row" : "rows"} with errors` : ""}.
            </span>{" "}
            Nothing is deleted.
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => onAct("discard")} disabled={busy !== null}
              className="press h-11 rounded-full bg-fill-strong px-5 text-body font-semibold">
              Discard
            </button>
            {confirm ? (
              <button onClick={() => onAct("apply")} disabled={busy !== null || changes === 0}
                className="press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60">
                {busy === "apply" ? "Applying…" : "Yes, apply now"}
              </button>
            ) : (
              <button onClick={() => setConfirm(true)} disabled={changes === 0}
                className="press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60">
                Apply {changes} {changes === 1 ? "change" : "changes"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
