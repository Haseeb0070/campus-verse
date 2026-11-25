import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, appendFile, type UploadFile } from "./api";
import type { Audience, StoredFileInfo } from "./types";

/*
 * Writing notices: who you can post to, how many people that reaches, your own notices and what
 * you can do with them. Same endpoints as web/src/components/notice-form.tsx.
 */

export interface MyNotice {
  id: number;
  title: string;
  body: string;
  priority: "normal" | "important";
  status: "draft" | "scheduled" | "published" | "archived";
  published_at: string | null;
  publish_at: string | null;
  expires_at: string | null;
  expired: boolean;
  updated_at: string;
  targets: { key: string; label: string }[];
  reach: number;
  edited_at: string | null;
  attachments: StoredFileInfo[];
}

export const MAX_NOTICE_FILES = 5;

export function noticeFilePath(fileId: number) {
  return `/api/notices/files/${fileId}`;
}

/** Where this person may post notices; empty for anyone who can't. */
export function useNoticeAudiences() {
  return useQuery({
    queryKey: ["notices", "audiences"],
    queryFn: () => apiFetch<Audience[]>("/api/notices/audiences"),
    staleTime: 5 * 60_000,
  });
}

/** How many people a set of audiences reaches, counting each person once. */
export function useReach(targets: string[]) {
  const params = targets.map((t) => `targets=${encodeURIComponent(t)}`).join("&");
  return useQuery({
    queryKey: ["notices", "reach", [...targets].sort()],
    queryFn: () => apiFetch<{ people: number }>(`/api/notices/reach?${params}`),
    enabled: targets.length > 0,
    placeholderData: (previous) => previous,
  });
}

export function useMyNotices(enabled = true) {
  return useQuery({
    queryKey: ["notices", "mine"],
    queryFn: () => apiFetch<MyNotice[]>("/api/notices/mine"),
    enabled,
  });
}

export interface NoticeDraft {
  title: string;
  body: string;
  important: boolean;
  targets: string[];
  expiresAt: Date | null;
  /** Null: keep it as a draft. A date: send it out then. "now": publish now. */
  sendAt: "now" | Date | null;
  removed: number[];
  files: UploadFile[];
}

/**
 * Saves a notice and its files, then sends it out (now or at a time) when asked. Files go on
 * before it's published, so nobody sees it without them.
 */
export function useSaveNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ existing, draft }: { existing?: MyNotice; draft: NoticeDraft }) => {
      const sent = existing?.status === "published";
      const common = {
        title: draft.title.trim(),
        body: draft.body,
        priority: draft.important ? "important" : "normal",
        expires_at: draft.expiresAt ? draft.expiresAt.toISOString() : null,
      };
      let id: number;
      if (existing) {
        await apiFetch(`/api/notices/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...common, targets: sent ? null : draft.targets }),
        });
        id = existing.id;
      } else {
        const created = await apiFetch<MyNotice>("/api/notices", {
          method: "POST",
          body: JSON.stringify({ ...common, targets: draft.targets, publish: false }),
        });
        id = created.id;
      }
      for (const fileId of draft.removed) {
        await apiFetch(`/api/notices/${id}/attachments/${fileId}`, { method: "DELETE" });
      }
      for (const f of draft.files) {
        const form = new FormData();
        appendFile(form, "file", f);
        await apiFetch(`/api/notices/${id}/attachments`, { method: "POST", body: form });
      }
      if (!sent && draft.sendAt === "now") {
        await apiFetch(`/api/notices/${id}/publish`, { method: "POST" });
      } else if (!sent && draft.sendAt instanceof Date) {
        await apiFetch(`/api/notices/${id}/schedule`, {
          method: "POST",
          body: JSON.stringify({ publish_at: draft.sendAt.toISOString() }),
        });
      }
      return id;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notices"] }),
  });
}

/** Publish a draft or scheduled notice now, take a schedule back, or archive it. */
export function useNoticeAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: "publish" | "unschedule" | "archive" }) =>
      apiFetch(`/api/notices/${id}/${action}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notices"] }),
  });
}
