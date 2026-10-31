"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ChevronLeftIcon, DocumentIcon, LinkIcon } from "@/components/icons";
import { Linkified } from "@/components/linkified";
import { ApiError, apiFetch, errorDetail } from "@/lib/api";
import { courseBg, fileSize, formatDateTime, relativeTime } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { fileUrl, kindLabels, useResource, useShareOptions } from "@/lib/resources";
import type { Resource, ResourceKind } from "@/lib/resources";
import { Select } from "@/components/select";

const field =
  "h-11 w-full rounded-control border border-transparent bg-[var(--cv-bg)] px-3 text-body outline-none focus:border-accent";
const label = "flex flex-col gap-1.5 text-footnote font-semibold text-ink-2";
const primary =
  "press inline-flex h-11 items-center justify-center rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60";
const secondary =
  "press inline-flex h-10 items-center rounded-full bg-fill-strong px-4 text-footnote font-semibold disabled:opacity-60";

function useSave(id: number) {
  const queryClient = useQueryClient();
  return (r: Resource) => {
    queryClient.setQueryData(["resources", id], r);
    queryClient.invalidateQueries({ queryKey: ["resources"], exact: true });
  };
}

function ReplaceFile({ r, onDone }: { r: Resource; onDone: () => void }) {
  const rules = useShareOptions().data;
  const save = useSave(r.id);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    const max = rules?.max_mb ?? 20;
    if (!file) return setError("Choose the new file.");
    if (file.size > max * 1024 * 1024) return setError(`Files can be up to ${max} MB.`);
    const form = new FormData();
    form.append("file", file);
    form.append("note", note);
    setBusy(true);
    setError(null);
    try {
      save(await apiFetch<Resource>(`/api/resources/${r.id}/versions`, { method: "POST", body: form }));
      onDone();
    } catch (err) {
      setError(errorDetail(err, "Couldn't upload it. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        upload();
      }}
      className="flex flex-col gap-4 rounded-row bg-fill p-4"
    >
      <p className="text-body">
        Students get the new file. Version {r.version} stays in the history below, so nothing is lost.
      </p>
      <label className={label}>
        New file
        <input type="file" accept={rules?.accept} onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-body file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-fill-strong file:px-4 file:font-semibold" />
      </label>
      <label className={label}>
        What changed (optional, shown to students)
        <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)}
          placeholder="Fixed the example on slide 12" className={field} />
      </label>
      {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={secondary}>Cancel</button>
        <button type="submit" disabled={busy} className={primary}>{busy ? "Uploading…" : "Upload version " + (r.version + 1)}</button>
      </div>
    </form>
  );
}

function EditDetails({ r, onDone }: { r: Resource; onDone: () => void }) {
  const save = useSave(r.id);
  const [title, setTitle] = useState(r.title);
  const [description, setDescription] = useState(r.description);
  const [kind, setKind] = useState<ResourceKind>(r.kind);
  const [url, setUrl] = useState(r.url);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) return setError("Give the resource a title.");
    setBusy(true);
    setError(null);
    try {
      save(
        await apiFetch<Resource>(`/api/resources/${r.id}`, {
          method: "PATCH",
          body: JSON.stringify({ title, description, kind, url: r.url ? url : null }),
        }),
      );
      onDone();
    } catch (err) {
      setError(errorDetail(err, "Couldn't save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4 rounded-row bg-fill p-4"
    >
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <label className={label}>
          Title
          <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)}
            className={`${field} font-semibold`} />
        </label>
        <label className={label}>
          Type
          <Select value={kind} onChange={(v) => setKind(v as ResourceKind)} label="Type" className={field}
            options={Object.entries(kindLabels).map(([value, text]) => ({ value, label: text }))} />
        </label>
      </div>
      {r.url && (
        <label className={label}>
          Link
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className={field} />
        </label>
      )}
      <label className={label}>
        Description
        <textarea value={description} rows={3} maxLength={2000} onChange={(e) => setDescription(e.target.value)}
          className={`${field} h-auto resize-y py-3`} />
      </label>
      {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={secondary}>Cancel</button>
        <button type="submit" disabled={busy} className={primary}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

export default function ResourcePage() {
  const id = Number(useParams<{ id: string }>().id);
  const tz = useMe().data?.institution?.timezone;
  const resource = useResource(id);
  const save = useSave(id);
  const [mode, setMode] = useState<"view" | "replace" | "edit">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notFound = resource.error instanceof ApiError && resource.error.status === 404;
  const r = resource.data;

  async function setArchived(archived: boolean) {
    setBusy(true);
    setError(null);
    try {
      save(await apiFetch<Resource>(`/api/resources/${id}/${archived ? "archive" : "restore"}`, { method: "POST" }));
    } catch (err) {
      setError(errorDetail(err, "Couldn't change it. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/resources" className="inline-flex items-center gap-1 self-start text-footnote font-semibold text-accent-ink">
        <ChevronLeftIcon className="size-4" /> Resources
      </Link>

      {resource.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {notFound && (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">This resource isn&apos;t available</p>
          <p className="mt-1 text-body text-ink-2">It may be shared with a section you&apos;re not in.</p>
        </div>
      )}

      {r && (
        <>
          <header>
            <p className="flex items-center gap-2 text-footnote font-semibold text-ink-2">
              <span className={`size-3 rounded ${courseBg[r.color]}`} aria-hidden="true" />
              {r.course_code} · {r.course_title}
            </p>
            <h1 className="mt-1 text-title-1 font-bold">{r.title}</h1>
            <p className="mt-1 text-body text-ink-2">
              {r.kind_label} · Shared by {r.shared_by} {relativeTime(r.created_at)}
            </p>
          </header>

          {r.status === "archived" && (
            <p className="rounded-row bg-fill-strong px-4 py-3 text-footnote">
              <span className="font-semibold">Archived{r.archived_at ? ` ${relativeTime(r.archived_at)}` : ""}.</span>{" "}
              Kept for reference; it may be out of date.
            </p>
          )}

          <section aria-label="File" className="glass flex flex-col gap-4 rounded-card p-5">
            <div className="flex flex-wrap items-center gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-fill-strong text-ink-2">
                {r.url ? <LinkIcon className="size-6" /> : <DocumentIcon className="size-6" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold">{r.file?.name ?? r.url}</span>
                <span className="block text-footnote text-ink-2">
                  {r.file
                    ? `${fileSize(r.file.size)} · Version ${r.version}${r.version > 1 ? `, updated ${relativeTime(r.updated_at)}` : ""}`
                    : "Opens in a new tab"}
                </span>
              </span>
              {r.file ? (
                <a href={fileUrl(r.file.id)} className={primary}>Download</a>
              ) : (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className={primary}>Open link</a>
              )}
            </div>
            {r.description && (
              <p className="whitespace-pre-wrap border-t border-divider pt-4 text-body">
                <Linkified text={r.description} />
              </p>
            )}
          </section>

          {r.can_manage && (
            <section aria-labelledby="manage-h" className="glass flex flex-col gap-4 rounded-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="manage-h" className="text-headline font-semibold">Manage</h2>
                  <p className="text-footnote text-ink-2">Shared with {r.audiences.join(", ")}</p>
                </div>
                {mode === "view" && (
                  <div className="flex flex-wrap gap-2">
                    {r.file && r.status === "active" && (
                      <button onClick={() => setMode("replace")} className={secondary}>Replace file</button>
                    )}
                    <button onClick={() => setMode("edit")} className={secondary}>Edit details</button>
                    <button onClick={() => setArchived(r.status === "active")} disabled={busy} className={secondary}>
                      {r.status === "active" ? "Archive" : "Restore"}
                    </button>
                  </div>
                )}
              </div>
              {mode === "replace" && <ReplaceFile r={r} onDone={() => setMode("view")} />}
              {mode === "edit" && <EditDetails key={r.updated_at} r={r} onDone={() => setMode("view")} />}
              {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
              {mode === "view" && r.status === "active" && (
                <p className="text-caption text-ink-3">
                  Archiving hides it from the main list but keeps it findable under Archived.
                </p>
              )}
            </section>
          )}

          {r.can_manage && r.versions.length > 0 && (
            <section aria-labelledby="history-h" className="glass rounded-card p-3">
              <h2 id="history-h" className="px-3 pt-2 pb-1 text-headline font-semibold">Version history</h2>
              <ol>
                {r.versions.map((v, i) => (
                  <li key={v.number} className="flex items-center gap-3 rounded-row p-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-fill-strong text-footnote font-semibold">
                      v{v.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-body font-semibold">
                        <span className="truncate">{v.note || v.file.name}</span>
                        {i === 0 && (
                          <span className="shrink-0 rounded-md bg-accent/12 px-1.5 py-px text-caption text-accent-ink">Current</span>
                        )}
                      </span>
                      <span className="block truncate text-footnote text-ink-2">
                        {v.uploaded_by} · {formatDateTime(v.created_at, tz)} · {fileSize(v.file.size)}
                      </span>
                    </span>
                    <a href={fileUrl(v.file.id)} aria-label={`Download version ${v.number}`}
                      className="press shrink-0 rounded-full bg-fill-strong px-3.5 py-1.5 text-footnote font-semibold text-accent-ink">
                      Download
                    </a>
                  </li>
                ))}
              </ol>
              <p className="px-3 pb-2 text-caption text-ink-3">Only the people who manage this resource see earlier versions.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
