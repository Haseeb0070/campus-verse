"use client";

import { ChipGroup } from "@/components/chip-group";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PostCard } from "@/components/post-card";
import { apiFetch, errorDetail } from "@/lib/api";
import { useFeed, useFeedAudiences } from "@/lib/feed";
import { fileSize } from "@/lib/format";
import { Select } from "@/components/select";
import { PageTitle } from "@/components/page-title";

export default function FeedPage() {
  const audiences = useFeedAudiences();
  const [scope, setScope] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const feed = useFeed(scope, q);
  const posts = feed.data?.pages.flat() ?? [];

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <p className="text-body font-semibold text-ink-2">Questions, notes and news from your spaces</p>
        <PageTitle className="mt-1 text-large-title font-bold" text="Feed" />
      </header>

      <Composer />

      <div className="flex flex-wrap items-center gap-3">
        <ChipGroup label="Space" value={scope} onChange={setScope}
          options={[{ value: "", label: "Everything" }, ...(audiences.data ?? []).map((a) => ({ value: a.key, label: a.label }))]} />
        <label className="min-w-[12rem] flex-1">
          <span className="sr-only">Search posts</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search posts"
            className="glass h-11 w-full rounded-full px-4 text-body outline-none focus:ring-2 focus:ring-accent/50" />
        </label>
      </div>

      {feed.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {feed.isSuccess && posts.length === 0 && (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">{q ? "No posts match" : "Nothing here yet"}</p>
          <p className="mt-1 text-body text-ink-2">
            {q ? "Try other words." : "Ask a question or share something useful with your section."}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {posts.map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>

      {feed.hasNextPage && (
        <button onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage}
          className="press mx-auto h-10 rounded-full bg-fill-strong px-5 text-footnote font-semibold">
          {feed.isFetchingNextPage ? "Loading…" : "Show older posts"}
        </button>
      )}
    </div>
  );
}

function Composer() {
  const queryClient = useQueryClient();
  const audiences = useFeedAudiences();
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileKey, setFileKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = target || audiences.data?.[0]?.key || "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && files.length === 0) return setError("Write something or attach a file.");
    if (!chosen) return setError("Choose where to post.");
    if (files.length > 4) return setError("Attach up to 4 files.");
    const form = new FormData();
    form.append("body", body);
    form.append("targets", chosen);
    files.forEach((f) => form.append("files", f));
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/feed/posts", { method: "POST", body: form });
      setBody("");
      setFiles([]);
      setFileKey((k) => k + 1);
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
    } catch (err) {
      setError(errorDetail(err, "Couldn't post. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (audiences.isSuccess && audiences.data.length === 0) return null;

  return (
    <form onSubmit={submit} noValidate className="glass flex flex-col gap-3 rounded-card p-5">
      <label htmlFor="new-post" className="sr-only">New post</label>
      <textarea id="new-post" value={body} maxLength={5000} rows={3} onChange={(e) => setBody(e.target.value)}
        placeholder="Ask a question or share something useful"
        className="resize-none rounded-control bg-fill px-4 py-3 text-body outline-none focus:ring-2 focus:ring-accent/50" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-footnote font-semibold text-ink-2">
          Post to
          <Select value={chosen} onChange={setTarget} label="Post to"
            className="h-9 max-w-64 rounded-full bg-fill-strong px-3 text-footnote font-semibold text-ink"
            options={(audiences.data ?? []).map((a) => ({ value: a.key, label: a.label, detail: a.detail }))} />
        </label>
        <label className="press inline-flex h-9 cursor-pointer items-center rounded-full bg-fill-strong px-3 text-footnote font-semibold">
          Add photo or PDF
          <input key={fileKey} type="file" multiple accept=".png,.jpg,.jpeg,.pdf" className="sr-only"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        {files.length > 0 && (
          <span className="text-footnote text-ink-2">
            {files.map((f) => `${f.name} (${fileSize(f.size)})`).join(", ")}
          </span>
        )}
        <button type="submit" disabled={busy}
          className="press ml-auto h-10 rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60">
          {busy ? "Posting…" : "Post"}
        </button>
      </div>
      {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
    </form>
  );
}
