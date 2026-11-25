import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, appendFile, type UploadFile } from "./api";
import type { StoredFileInfo } from "./types";

export interface FeedPerson {
  id: number;
  name: string;
  initials: string;
  kind: "student" | "teacher" | "staff";
}

export interface Post {
  id: number;
  author: FeedPerson;
  body: string;
  audiences: string[];
  attachments: StoredFileInfo[];
  created_at: string;
  visibility: "visible" | "hidden" | "removed";
  reaction_count: number;
  reacted: boolean;
  comment_count: number;
  mine: boolean;
  can_moderate: boolean;
}

export interface Comment {
  id: number;
  parent_id: number | null;
  author: FeedPerson;
  body: string;
  created_at: string;
  visibility: "visible" | "hidden" | "removed";
  mine: boolean;
}

export interface Audience {
  key: string;
  label: string;
  group: string;
  detail: string;
}

export type ReportReason = "spam" | "harassment" | "inappropriate" | "off_topic" | "other";

export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: "spam", label: "Spam" },
  { key: "harassment", label: "Harassment or bullying" },
  { key: "inappropriate", label: "Inappropriate" },
  { key: "off_topic", label: "Off topic" },
  { key: "other", label: "Something else" },
];

export const feedKey = ["feed"] as const;
const postKey = (id: number) => ["feed", "post", id] as const;
type Pages = InfiniteData<Post[], number | undefined>;

/** The feed, newest first, 20 at a time: each next page is the posts before the last one. */
export function useFeed() {
  return useInfiniteQuery({
    queryKey: [...feedKey, "list"],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => apiFetch<Post[]>(`/api/feed/posts${pageParam ? `?before=${pageParam}` : ""}`),
    getNextPageParam: (last) => (last.length >= 20 ? last[last.length - 1]?.id : undefined),
  });
}

/** One post, read from the feed already loaded (there's no single-post endpoint). */
export function usePost(id: number) {
  const qc = useQueryClient();
  const feed = qc.getQueryData<Pages>([...feedKey, "list"]);
  const known = feed?.pages.flat().find((p) => p.id === id);
  return useQuery({
    queryKey: postKey(id),
    queryFn: async () => {
      // Opened from a notification, before the feed loaded: look for it in the newest pages.
      let before: number | undefined;
      for (let i = 0; i < 5; i++) {
        const page = await apiFetch<Post[]>(`/api/feed/posts${before ? `?before=${before}` : ""}`);
        const hit = page.find((p) => p.id === id);
        if (hit) return hit;
        if (page.length < 20) break;
        before = page[page.length - 1].id;
      }
      throw new Error("Post not found");
    },
    initialData: known,
  });
}

export function useComments(postId: number) {
  return useQuery({
    queryKey: ["feed", "comments", postId],
    queryFn: () => apiFetch<Comment[]>(`/api/feed/posts/${postId}/comments`),
  });
}

export function useAudiences(enabled = true) {
  return useQuery({
    queryKey: ["feed", "audiences"],
    queryFn: () => apiFetch<Audience[]>("/api/feed/audiences"),
    staleTime: 10 * 60_000,
    enabled,
  });
}

/** Apply a change to a post wherever it's cached: the feed pages and the post itself. */
function patchPost(qc: ReturnType<typeof useQueryClient>, id: number, change: (p: Post) => Post) {
  qc.setQueryData<Pages>([...feedKey, "list"], (data) =>
    data && { ...data, pages: data.pages.map((page) => page.map((p) => (p.id === id ? change(p) : p))) },
  );
  qc.setQueryData<Post>(postKey(id), (p) => (p ? change(p) : p));
}

/** Like or unlike, shown at once; put back if the server says no. */
export function useToggleLike() {
  const qc = useQueryClient();
  return async (post: Post) => {
    const flip = (p: Post): Post => ({ ...p, reacted: !p.reacted, reaction_count: p.reaction_count + (p.reacted ? -1 : 1) });
    patchPost(qc, post.id, flip);
    try {
      const { on } = await apiFetch<{ on: boolean }>(`/api/feed/posts/${post.id}/reactions`, { method: "POST" });
      if (on === post.reacted) patchPost(qc, post.id, flip); // server disagreed with our guess
    } catch {
      patchPost(qc, post.id, flip);
      throw new Error("Couldn't change your like.");
    }
  };
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, targets, files }: { body: string; targets: string[]; files: UploadFile[] }) => {
      const form = new FormData();
      form.append("body", body);
      targets.forEach((t) => form.append("targets", t));
      files.forEach((f) => appendFile(form, "files", f));
      return apiFetch<Post>("/api/feed/posts", { method: "POST", body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: feedKey }),
  });
}

export function useAddComment(postId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, parentId }: { body: string; parentId?: number | null }) =>
      apiFetch<Comment>(`/api/feed/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body, parent_id: parentId ?? null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feed", "comments", postId] });
      patchPost(qc, postId, (p) => ({ ...p, comment_count: p.comment_count + 1 }));
    },
  });
}

export async function deletePost(id: number) {
  await apiFetch(`/api/feed/posts/${id}`, { method: "DELETE" });
}

export async function deleteComment(id: number) {
  await apiFetch(`/api/feed/comments/${id}`, { method: "DELETE" });
}

export async function report(target: "post" | "comment", id: number, reason: ReportReason, details: string) {
  await apiFetch("/api/feed/reports", {
    method: "POST",
    body: JSON.stringify({ target_type: target, target_id: id, reason, details }),
  });
}

export function feedFilePath(fileId: number) {
  return `/api/feed/files/${fileId}`;
}

/* ---------- Moderation (moderators, and teachers of the sections a post went to) ---------- */

/** Hide something from the feed (its author and moderators still see it), or show it again. */
export async function moderate(target: "post" | "comment", id: number, action: "hide" | "restore") {
  await apiFetch("/api/feed/moderation/actions", {
    method: "POST",
    body: JSON.stringify({ target_type: target, target_id: id, action }),
  });
}

export interface QueuedReport {
  id: number;
  reason: string;
  details: string;
  reporter: string;
  created_at: string;
  target_type: "post" | "comment";
  target_id: number;
  post_id: number;
  body: string;
  author: string;
  visibility: string;
  reports_on_target: number;
}

/** Whether this person moderates the institution's feed, and how many reports are open. */
export function useModerationSummary() {
  return useQuery({
    queryKey: ["moderation", "summary"],
    queryFn: () => apiFetch<{ can_moderate: boolean; open: number }>("/api/feed/moderation/summary"),
    staleTime: 60_000,
  });
}

export function useReports(enabled = true) {
  return useQuery({
    queryKey: ["moderation", "reports"],
    queryFn: () => apiFetch<QueuedReport[]>("/api/feed/moderation/reports"),
    enabled,
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, note }: { id: number; action: "dismiss" | "hide" | "remove"; note: string }) =>
      apiFetch(`/api/feed/moderation/reports/${id}/resolve`, { method: "POST", body: JSON.stringify({ action, note }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["moderation"] });
      qc.invalidateQueries({ queryKey: feedKey });
    },
  });
}
