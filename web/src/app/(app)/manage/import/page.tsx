"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Select } from "@/components/select";
import { Switch } from "@/components/switch";
import { apiFetch, errorDetail } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import {
  type ImportKind,
  type ImportRow,
  type ImportRun,
  type SyncSource,
  useImportRun,
  useImports,
  useSyncSources,
} from "@/lib/manage";
import { useMe } from "@/lib/queries";
import { PageTitle } from "@/components/page-title";

const statusChip: Record<ImportRow["status"], { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-success/15 text-ink" },
  update: { label: "Update", cls: "bg-accent/12 text-accent-ink" },
  unchanged: { label: "Unchanged", cls: "bg-fill-strong text-ink-2" },
  error: { label: "Error", cls: "bg-danger/12 text-danger-ink" },
};

const KINDS: Record<ImportKind, { label: string; about: string; missing: string; item: string }> = {
  timetable: {
    label: "Timetable",
    about: "Weekly classes for the current term, matched by course, section code, day and start time.",
    missing: "existing classes aren't in this file (kept as is)",
    item: "Subject",
  },
  people: {
    label: "People",
    about: "Students, teachers and staff, matched by your institution's ID, then email. New people get an invite to set a password.",
    missing: "",
    item: "Person",
  },
  enrollment: {
    label: "Enrollment",
    about: "Who is in which section, by email or ID: leave the course empty to put a student in the section and all its subjects (moving them from their old one), or give a course for one subject, or a teacher. People must exist first.",
    missing: "current enrollments aren't in this file (kept as is)",
    item: "Person",
  },
};

const SCHEDULES = [
  { value: "daily", label: "Every day" },
  { value: "hourly", label: "Every hour" },
  { value: "manual", label: "Only when I run it" },
];

const field =
  "h-11 w-full rounded-control border border-transparent bg-[var(--cv-bg)] px-3 text-body outline-none focus:border-accent";
const label = "flex flex-col gap-1.5 text-footnote font-semibold text-ink-2";

type Filter = "changes" | "problems" | "all";

function resultText(r: Record<string, number>) {
  const parts = Object.entries(r)
    .filter(([k, v]) => v && k !== "skipped")
    .map(([k, v]) => `${v} ${k.replace("_", " ")}`);
  return parts.length ? parts.join(", ") : "No changes";
}

export default function ImportPage() {
  const queryClient = useQueryClient();
  const tz = useMe().data?.institution?.timezone;
  const runs = useImports();
  const [kind, setKind] = useState<ImportKind>("timetable");
  const [selected, setSelected] = useState<number | null>(null);
  const runId = selected ?? runs.data?.find((r) => r.status === "preview")?.id ?? null;
  const run = useImportRun(runId);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choose a CSV or Excel file first.");
    setBusy("upload");
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const created = await apiFetch<ImportRun>(`/api/manage/imports/${kind}`, { method: "POST", body: form });
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
        <p className="text-body font-semibold text-ink-2">Smart Sync · CSV or Excel exports and scheduled feeds</p>
        <PageTitle className="mt-1 text-large-title font-bold" text="Imports & sync" />
      </header>

      <form onSubmit={upload} className="glass flex flex-col gap-4 rounded-card p-6" noValidate>
        <div role="radiogroup" aria-label="What you're importing" className="flex self-start rounded-control bg-fill p-1">
          {(Object.keys(KINDS) as ImportKind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={`h-9 rounded-[9px] px-4 text-footnote font-semibold ${kind === k ? "bg-[var(--cv-bg)] shadow-sm" : "text-ink-2"}`}>
              {KINDS[k].label}
            </button>
          ))}
        </div>
        <p className="text-body text-ink-2">
          {KINDS[kind].about} You&apos;ll see every change before anything is saved, and nothing is ever deleted.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input key={fileKey} type="file" accept=".csv,.xlsx,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label={`${KINDS[kind].label} file`}
            className="min-w-0 flex-1 text-body file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-fill-strong file:px-4 file:font-semibold" />
          <a href={`/api/manage/imports/${kind}/template.csv`} className="text-footnote font-semibold text-accent-ink">
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

      <SourcesCard tz={tz} onRun={(id) => { setSelected(id); }} />

      {(runs.data?.length ?? 0) > 0 && (
        <section aria-labelledby="hist-h" className="glass rounded-card p-5">
          <h2 id="hist-h" className="mb-1 px-1 text-headline font-semibold">Previous imports</h2>
          <ul>
            {runs.data?.map((r) => (
              <li key={r.id}>
                <button onClick={() => setSelected(r.id)} aria-current={r.id === runId ? "true" : undefined}
                  className={`press flex w-full flex-wrap items-center gap-3 rounded-row p-2.5 text-left ${
                    r.id === runId ? "bg-fill-strong" : "hover:bg-fill"}`}>
                  <span className="min-w-0 flex-1 text-body">
                    <span className="font-semibold">{KINDS[r.kind].label}</span>
                    <span className="text-footnote text-ink-2">
                      {" · "}{r.source ?? r.file_name} · {formatDateTime(r.created_at, tz)}
                    </span>
                  </span>
                  <span className="text-footnote text-ink-2">
                    {r.status === "applied" ? `Applied: ${resultText(r.result)}`
                      : r.status === "discarded" ? "Discarded" : "Waiting for review"}
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
  // Applying a file with no changes still records that the data was confirmed up to date.
  const action = changes
    ? `Apply ${changes} ${changes === 1 ? "change" : "changes"}`
    : `Confirm ${s.unchanged ?? 0} unchanged ${s.unchanged === 1 ? "row" : "rows"}`;
  const nothing = changes + (s.unchanged ?? 0) === 0;
  const rows = (run.rows ?? []).filter((r) =>
    filter === "all" ? true : filter === "problems" ? r.status === "error" || r.clash : r.status === "new" || r.status === "update",
  );
  const tiles: [string, number | undefined, string][] = [
    ["Rows read", s.rows, "text-ink"],
    ["New", s.new, "text-success-ink"],
    ["Updates", s.update, "text-accent-ink"],
    ["Unchanged", s.unchanged, "text-ink-2"],
    ["Errors", s.error, "text-danger-ink"],
    ...(run.kind === "timetable" ? [["Room clashes", s.clash, "text-warning-ink"] as [string, number | undefined, string]] : []),
  ];

  return (
    <section aria-label="Import preview" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-title-2 font-bold">{KINDS[run.kind].label} · {run.source ?? run.file_name}</h2>
        <span className={`rounded-full px-3 py-1 text-footnote font-semibold ${
          run.status === "preview" ? "bg-warning/18" : run.status === "applied" ? "bg-success/15" : "bg-fill-strong text-ink-2"}`}>
          {run.status === "preview" ? "Dry run · nothing changed yet"
            : run.status === "applied" ? `Applied ${run.applied_at ? formatDateTime(run.applied_at, tz) : ""}` : "Discarded"}
        </span>
        {run.term && <span className="text-footnote text-ink-2">{run.term}</span>}
      </div>
      {run.status === "preview" && run.held_reason && (
        <p className="rounded-row bg-warning/18 px-4 py-3 text-body">
          <span className="font-semibold">Waiting for you:</span> {run.held_reason}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {tiles.map(([text, value, cls]) => (
          <div key={text} className="glass rounded-[20px] p-4">
            <p className="text-caption font-semibold text-ink-2">{text}</p>
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
                className={`h-8 rounded-[9px] px-3 text-footnote font-semibold capitalize ${filter === f ? "bg-[var(--cv-bg)] shadow-sm" : "text-ink-2"}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 && <p className="px-1 py-3 text-body text-ink-2">Nothing in this view.</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-footnote">
              <thead className="text-caption text-ink-2">
                <tr>
                  {["Line", "Status", KINDS[run.kind].item, "Details"].map((h) => (
                    <th key={h} scope="col" className="px-2 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className={`border-t border-divider ${r.status === "error" ? "bg-danger/5" : ""}`}>
                    <td className="px-2 py-2.5 text-ink-3 tabular-nums">{r.line}</td>
                    <td className="px-2 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${statusChip[r.status].cls}`}>{statusChip[r.status].label}</span>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="block font-semibold">{r.label}</span>
                      <span className="block text-ink-2">{r.detail}</span>
                    </td>
                    <td className="px-2 py-2.5 text-ink-2">
                      {r.message}
                      {Object.entries(r.changes).map(([k, [a, b]]) => (
                        <span key={k} className="mr-3 inline-block">
                          {k.replace("_", " ")}: <span className="text-ink-3 line-through">{a || "blank"}</span> →{" "}
                          <span className="font-semibold text-ink">{b}</span>
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
            <summary className="cursor-pointer font-semibold">{s.not_in_file} {KINDS[run.kind].missing}</summary>
            <p className="mt-2">{run.not_in_file?.join(" · ")}</p>
          </details>
        )}
      </div>

      {run.status === "preview" && (
        <div className="glass flex flex-wrap items-center justify-between gap-4 rounded-card p-5">
          <p className="text-body">
            <span className="font-semibold">
              {action}
              {s.error ? ` and skip ${s.error} ${s.error === 1 ? "row" : "rows"} with errors` : ""}.
            </span>{" "}
            {changes ? "Nothing is deleted." : "This marks the data as just synchronized."}
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => onAct("discard")} disabled={busy !== null}
              className="press h-11 rounded-full bg-fill-strong px-5 text-body font-semibold">Discard</button>
            {confirm ? (
              <button onClick={() => onAct("apply")} disabled={busy !== null || nothing}
                className="press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60">
                {busy === "apply" ? "Applying…" : "Yes, apply now"}
              </button>
            ) : (
              <button onClick={() => setConfirm(true)} disabled={nothing}
                className="press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60">
                {action}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// Sync sources --------------------------------------------------------------------------------

function SourceForm({ initial, onDone }: { initial?: SyncSource; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<ImportKind>(initial?.kind ?? "timetable");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [auth, setAuth] = useState("");
  const [schedule, setSchedule] = useState(initial?.schedule ?? "daily");
  const [autoApply, setAutoApply] = useState(initial?.auto_apply ?? false);
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(initial ? `/api/manage/sync-sources/${initial.id}` : "/api/manage/sync-sources", {
        method: initial ? "PUT" : "POST",
        body: JSON.stringify({
          name, kind, url, schedule, auto_apply: autoApply, purpose,
          is_active: initial?.is_active ?? true, auth_header: auth ? auth : initial ? null : "",
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["manage", "sync-sources"] });
      onDone();
    } catch (err) {
      setError(errorDetail(err, "Couldn't save the source."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="flex flex-col gap-3 rounded-row bg-fill p-4">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className={label}>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Registrar timetable export" className={field} /></label>
        <label className={label}>Data
          <Select value={kind} onChange={(v) => setKind(v as ImportKind)} label="Data" className={field}
            options={(Object.keys(KINDS) as ImportKind[]).map((k) => ({ value: k, label: KINDS[k].label }))} />
        </label>
      </div>
      <label className={label}>Export address (https, CSV or Excel)
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://registrar.example.edu/exports/timetable.csv" className={field} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Authorization header (optional)
          <input type="password" autoComplete="off" value={auth} onChange={(e) => setAuth(e.target.value)}
            placeholder={initial?.has_auth ? "Saved. Type to replace it." : "Bearer …"} className={field} />
        </label>
        <label className={label}>How often
          <Select value={schedule} onChange={(v) => setSchedule(v as SyncSource["schedule"])} label="How often" className={field} options={SCHEDULES} />
        </label>
      </div>
      <label className={label}>Purpose
        <input value={purpose} maxLength={300} onChange={(e) => setPurpose(e.target.value)} placeholder="Weekly timetable from the registrar's office" className={field} />
      </label>
      <span className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-body font-semibold">Apply routine runs automatically</span>
          <span className="block text-footnote text-ink-2">Runs with errors, unusually many changes or missing records always wait for review.</span>
        </span>
        <Switch checked={autoApply} onChange={setAutoApply} label="Apply routine runs automatically" />
      </span>
      {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="press h-10 rounded-full bg-fill-strong px-4 text-footnote font-semibold">Cancel</button>
        <button type="submit" disabled={busy} className="press h-10 rounded-full bg-accent px-4 text-footnote font-semibold text-on-accent disabled:opacity-60">
          {initial ? "Save" : "Add source"}
        </button>
      </div>
    </form>
  );
}

function SourcesCard({ tz, onRun }: { tz?: string; onRun: (runId: number) => void }) {
  const queryClient = useQueryClient();
  const list = useSyncSources();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function runNow(s: SyncSource) {
    setBusy(s.id);
    setMessage(null);
    try {
      const run = await apiFetch<ImportRun>(`/api/manage/sync-sources/${s.id}/run`, { method: "POST" });
      setMessage({ ok: true, text: run.status === "applied" ? `${s.name}: applied ${resultText(run.result).toLowerCase()}.` : `${s.name}: preview ready below.` });
      onRun(run.id);
    } catch (err) {
      setMessage({ ok: false, text: errorDetail(err, "The sync failed.") });
    } finally {
      setBusy(null);
      await queryClient.invalidateQueries({ queryKey: ["manage"] });
    }
  }

  async function toggle(s: SyncSource) {
    await apiFetch(`/api/manage/sync-sources/${s.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: s.name, kind: s.kind, url: s.url, schedule: s.schedule, auto_apply: s.auto_apply,
        purpose: s.purpose, is_active: !s.is_active, auth_header: null }),
    }).catch(() => {});
    await queryClient.invalidateQueries({ queryKey: ["manage", "sync-sources"] });
  }

  return (
    <section aria-labelledby="sources-h" className="glass flex flex-col gap-3 rounded-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="sources-h" className="text-headline font-semibold">Sync sources</h2>
          <p className="text-footnote text-ink-2">Exports your institution publishes, fetched on a schedule and checked like an upload.</p>
        </div>
        <button onClick={() => setEditing(editing === "new" ? null : "new")}
          className="press h-10 rounded-full bg-fill-strong px-4 text-footnote font-semibold">Add source</button>
      </div>
      {editing === "new" && <SourceForm onDone={() => setEditing(null)} />}
      {message && <p role={message.ok ? "status" : "alert"} className={`text-footnote ${message.ok ? "text-success-ink" : "text-danger-ink"}`}>{message.text}</p>}
      {list.isSuccess && list.data.length === 0 && editing !== "new" && (
        <p className="text-body text-ink-2">No sources yet. Without one, upload exports by hand above.</p>
      )}
      <ul className="flex flex-col gap-1">
        {list.data?.map((s) => (
          <li key={s.id} className="rounded-row">
            {editing === s.id ? (
              <SourceForm initial={s} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-center gap-3 p-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold">
                    {s.name} {!s.is_active && <span className="font-normal text-ink-3">· paused</span>}
                  </span>
                  <span className="block truncate text-footnote text-ink-2">
                    {KINDS[s.kind].label} · {SCHEDULES.find((x) => x.value === s.schedule)?.label}
                    {s.auto_apply ? " · applies routine runs" : " · always reviewed"} · owner {s.owner}
                  </span>
                  <span className={`block text-footnote ${s.last_error ? "text-danger-ink" : "text-ink-2"}`}>
                    {s.last_error
                      ? `Last attempt failed ${s.last_attempt_at ? relativeTime(s.last_attempt_at) : ""}: ${s.last_error}`
                      : s.last_success_at ? `Last synced ${formatDateTime(s.last_success_at, tz)}` : "Not run yet"}
                  </span>
                </span>
                <button onClick={() => runNow(s)} disabled={busy !== null}
                  className="press h-9 rounded-full bg-accent px-3.5 text-footnote font-semibold text-on-accent disabled:opacity-60">
                  {busy === s.id ? "Running…" : "Run now"}
                </button>
                <button onClick={() => setEditing(s.id)} className="rounded-full px-3 py-1.5 text-footnote font-semibold text-accent-ink hover:bg-fill">Edit</button>
                <button onClick={() => toggle(s)} className="rounded-full px-3 py-1.5 text-footnote font-semibold text-ink-2 hover:bg-fill">
                  {s.is_active ? "Pause" : "Resume"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
