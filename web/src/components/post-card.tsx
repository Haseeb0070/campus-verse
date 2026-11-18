"use client";

import { useQueryClient } from "@tanstack/react-query";
import PulseHeart from "@/components/reactbits/PulseHeart";
import { useState } from "react";
import { apiFetch, errorDetail } from "@/lib/api";
import {
  type FeedComment,
  type FeedPerson,
  type FeedPost,
  useComments,
} from "@/lib/feed";
import { relativeTime } from "@/lib/format";
import { PaperclipIcon } from "./icons";
import { Linkified } from "./linkified";
import { ReportDialog } from "./report-dialog";

function Who({ person, size = "size-10" }: { person: FeedPerson; size?: string }) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-full bg-fill-strong text-caption font-semibold`}>
      {person.initials}
    </span>
  );
}

function RoleBadge({ person }: { person: FeedPerson }) {
  if (person.kind === "student") return null;
  return (
    <span className="rounded-md bg-accent/12 px-1.5 py-px text-caption font-semibold text-accent-ink">
      {person.kind === "teacher" ? "Teacher" : "Staff"}
    </span>
  );
}

async function moderate(type: "post" | "comment", id: number, action: "hide" | "restore") {
  await apiFetch("/api/feed/moderation/actions", {
    method: "POST",
    body: JSON.stringify({ target_type: type, target_id: id, action }),
  });
}

export function PostCard({ post }: { post: FeedPost }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState<{ type: "post" | "comment"; id: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["feed"] });
  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(errorDetail(err, "That didn't work. Try again."));
    }
  }

  if (post.visibility === "removed") {
    return (
      <article id={`post-${post.id}`} className="glass scroll-mt-6 rounded-card p-5 text-body text-ink-2">
        Your post from {relativeTime(post.created_at)} was removed by a moderator.
      </article>
    );
  }

  const images = post.attachments.filter((a) => a.content_type.startsWith("image/"));
  const files = post.attachments.filter((a) => !a.content_type.startsWith("image/"));

  return (
    <article id={`post-${post.id}`} className="glass scroll-mt-6 rounded-card p-5">
      {post.visibility === "hidden" && (
        <p className="mb-3 rounded-row bg-warning/15 px-3 py-2 text-footnote font-medium">
          Hidden by a moderator. {post.mine ? "Only you and moderators can see it." : "Students can't see it."}
          {post.can_moderate && (
            <button onClick={() => run(() => moderate("post", post.id, "restore"))} className="ml-2 font-semibold text-accent-ink">
              Restore
            </button>
          )}
        </p>
      )}

      <header className="flex items-start gap-3">
        <Who person={post.author} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-body font-semibold">
            {post.author.name} <RoleBadge person={post.author} />
          </p>
          <p className="text-footnote text-ink-2">
            {post.audiences.join(", ")} · <time dateTime={post.created_at}>{relativeTime(post.created_at)}</time>
          </p>
        </div>
        <div className="flex shrink-0 gap-1 text-footnote font-semibold">
          {post.can_moderate && post.visibility === "visible" && !post.mine && (
            <button onClick={() => run(() => moderate("post", post.id, "hide"))}
              className="press rounded-full px-2.5 py-1 text-ink-2 hover:bg-fill-strong">
              Hide
            </button>
          )}
          {!post.mine && (
            <button onClick={() => setReporting({ type: "post", id: post.id })}
              className="press rounded-full px-2.5 py-1 text-ink-2 hover:bg-fill-strong">
              Report
            </button>
          )}
          {post.mine &&
            (confirmDelete ? (
              <span className="flex items-center gap-1.5">
                <button onClick={() => run(() => apiFetch(`/api/feed/posts/${post.id}`, { method: "DELETE" }))}
                  className="rounded-full px-2 py-1 text-danger-ink">
                  Delete post
                </button>
                <button onClick={() => setConfirmDelete(false)} className="rounded-full px-2 py-1">Cancel</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="press rounded-full px-2.5 py-1 text-ink-2 hover:bg-fill-strong">
                Delete
              </button>
            ))}
        </div>
      </header>

      {post.body && (
        <p className="mt-3 whitespace-pre-wrap break-words text-body">
          <Linkified text={post.body} />
        </p>
      )}

      {images.length > 0 && (
        <div className={`mt-3 grid gap-2 ${images.length > 1 ? "grid-cols-2" : ""}`}>
          {images.map((img) => (
            <a key={img.id} href={`/api/feed/files/${img.id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- permission-checked API image */}
              <img src={`/api/feed/files/${img.id}`} alt={img.name} loading="lazy"
                className="max-h-96 w-full rounded-row bg-fill object-cover" />
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {files.map((f) => (
            <a key={f.id} href={`/api/feed/files/${f.id}`}
              className="press inline-flex items-center gap-2 rounded-full bg-fill-strong px-3 py-1.5 text-footnote font-semibold">
              <PaperclipIcon className="size-4" /> {f.name}
            </a>
          ))}
        </div>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-2">
        {/* One like per person: React Bits PulseHeart shrinks the heart to a dot, changes colour
            and pulses back while the count rolls over. */}
        <PulseHeart
          liked={post.reacted}
          count={post.reaction_count}
          icon="heart"
          label="Like"
          disabled={post.visibility !== "visible"}
          onChange={() => run(() => apiFetch(`/api/feed/posts/${post.id}/reactions`, { method: "POST" }))}
          size={18}
          corner={999}
          className="[&_.tabular-nums]:!text-[12px]"
          likedColor="var(--cv-accent)"
          idleColor="var(--cv-ink-3)"
          pillColor="var(--cv-fill)"
          textColor="var(--cv-ink-2)"
        />
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="press ml-auto h-8 rounded-full px-3 text-footnote font-semibold text-ink-2 hover:bg-fill-strong">
          {post.comment_count === 0 ? "Comment" : `${post.comment_count} ${post.comment_count === 1 ? "comment" : "comments"}`}
        </button>
      </footer>

      {error && <p role="alert" className="mt-2 text-footnote text-danger-ink">{error}</p>}
      {open && <Comments post={post} onReport={(id) => setReporting({ type: "comment", id })} />}
      {reporting && <ReportDialog target={reporting} onClose={() => setReporting(null)} />}
    </article>
  );
}

function Comments({ post, onReport }: { post: FeedPost; onReport: (id: number) => void }) {
  const queryClient = useQueryClient();
  const comments = useComments(post.id, true);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const top = (comments.data ?? []).filter((c) => !c.parent_id);
  const replies = (id: number) => (comments.data ?? []).filter((c) => c.parent_id === id);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setError(null);
    try {
      await apiFetch(`/api/feed/posts/${post.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: draft, parent_id: replyTo?.id ?? null }),
      });
      setDraft("");
      setReplyTo(null);
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
    } catch (err) {
      setError(errorDetail(err, "Couldn't post your comment."));
    }
  }

  async function act(fn: () => Promise<unknown>) {
    await fn().catch((err) => setError(errorDetail(err, "That didn't work.")));
    await queryClient.invalidateQueries({ queryKey: ["feed"] });
  }

  const row = (c: FeedComment, nested = false) => (
    <li key={c.id} className={`flex gap-2.5 ${nested ? "ml-10" : ""}`}>
      <Who person={c.author} size="size-8" />
      <div className="min-w-0 flex-1">
        <div className={`rounded-[16px] px-3 py-2 ${c.visibility === "hidden" ? "bg-warning/12" : "bg-fill"}`}>
          <p className="flex flex-wrap items-center gap-1.5 text-footnote font-semibold">
            {c.author.name} <RoleBadge person={c.author} />
            {c.visibility === "hidden" && <span className="font-normal text-ink-2">· hidden by a moderator</span>}
          </p>
          <p className="whitespace-pre-wrap break-words text-body"><Linkified text={c.body} /></p>
        </div>
        <p className="mt-0.5 flex gap-3 px-2 text-caption font-semibold text-ink-3">
          <span className="font-normal">{relativeTime(c.created_at)}</span>
          {!nested && post.visibility === "visible" && (
            <button onClick={() => setReplyTo(c)}>Reply</button>
          )}
          {!c.mine && <button onClick={() => onReport(c.id)}>Report</button>}
          {c.mine && (
            <button onClick={() => act(() => apiFetch(`/api/feed/comments/${c.id}`, { method: "DELETE" }))}>
              Delete
            </button>
          )}
          {post.can_moderate && !c.mine && (
            <button onClick={() => act(() => moderate("comment", c.id, c.visibility === "hidden" ? "restore" : "hide"))}>
              {c.visibility === "hidden" ? "Restore" : "Hide"}
            </button>
          )}
        </p>
      </div>
    </li>
  );

  return (
    <div className="mt-4 border-t border-divider pt-4">
      {comments.isPending && <p className="text-footnote text-ink-2">Loading comments…</p>}
      <ul className="flex flex-col gap-3">
        {top.map((c) => [row(c), ...replies(c.id).map((r) => row(r, true))])}
      </ul>
      {post.visibility === "visible" && (
        <form onSubmit={send} className="mt-3 flex flex-col gap-1.5">
          {replyTo && (
            <p className="flex items-center gap-2 px-1 text-caption text-ink-2">
              Replying to {replyTo.author.name}
              <button type="button" onClick={() => setReplyTo(null)} className="font-semibold">Cancel</button>
            </p>
          )}
          <div className="flex items-center gap-2 rounded-full bg-fill p-1 pl-4 ring-accent/60 focus-within:ring-2">
            <label htmlFor={`c-${post.id}`} className="sr-only">Write a comment</label>
            <input id={`c-${post.id}`} value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)}
              placeholder={replyTo ? "Write a reply" : "Write a comment"}
              className="h-9 min-w-0 flex-1 bg-transparent text-body outline-none focus-visible:outline-none" />
            <button type="submit" disabled={!draft.trim()}
              className="press h-9 rounded-full bg-accent px-4 text-footnote font-semibold text-on-accent disabled:opacity-40">
              Send
            </button>
          </div>
          {error && <p role="alert" className="px-1 text-footnote text-danger-ink">{error}</p>}
        </form>
      )}
    </div>
  );
}
