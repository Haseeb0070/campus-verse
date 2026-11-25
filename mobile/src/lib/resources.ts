import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, appendFile, type UploadFile } from "./api";
import type { StoredFileInfo } from "./types";

export type ResourceKind = "slides" | "notes" | "reading" | "reference" | "other";

export const KIND_LABEL: Record<ResourceKind, string> = {
  slides: "Slides",
  notes: "Notes",
  reading: "Reading",
  reference: "Reference",
  other: "Other",
};

export interface ResourceVersion {
  number: number;
  file: StoredFileInfo;
  note: string;
  uploaded_by: string;
  created_at: string;
}

export interface Resource {
  id: number;
  title: string;
  description: string;
  kind: ResourceKind;
  kind_label: string;
  status: "active" | "archived";
  archived_at: string | null;
  offering_id: number;
  course_code: string;
  course_title: string;
  color: string;
  term: string;
  audiences: string[];
  /** A link resource has a url and no file. */
  url: string;
  file: StoredFileInfo | null;
  version: number;
  shared_by: string;
  created_at: string;
  updated_at: string;
  can_manage: boolean;
  versions: ResourceVersion[];
}

export interface ResourceFilters {
  status?: "active" | "archived";
  offering?: number | null;
  kind?: ResourceKind | "";
  q?: string;
}

export function useResources({ status = "active", offering = null, kind = "", q = "" }: ResourceFilters) {
  const params = [`status=${status}`];
  if (offering) params.push(`offering=${offering}`);
  if (kind) params.push(`kind=${kind}`);
  if (q.trim()) params.push(`q=${encodeURIComponent(q.trim())}`);
  return useQuery({
    queryKey: ["resources", status, offering, kind, q.trim()],
    queryFn: () => apiFetch<Resource[]>(`/api/resources?${params.join("&")}`),
    placeholderData: (previous) => previous,
  });
}

export function useResource(id: number) {
  return useQuery({
    queryKey: ["resources", "one", id],
    queryFn: () => apiFetch<Resource>(`/api/resources/${id}`),
  });
}

export function resourceFilePath(fileId: number) {
  return `/api/resources/files/${fileId}`;
}

/* ---------- Sharing and managing (teachers) ---------- */

export interface ShareCourse {
  offering_id: number;
  course_code: string;
  course_title: string;
  color: string;
  term: string;
  /** May share with every section of the course at once (including ones added later). */
  whole_course: boolean;
  sections: { key: string; code: string; reach: number }[];
}

/** The courses this person may share material with; empty for students. */
export function useShareOptions(enabled = true) {
  return useQuery({
    queryKey: ["resources", "options"],
    queryFn: () => apiFetch<{ courses: ShareCourse[]; accept: string; max_mb: number }>("/api/resources/options"),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useShareResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      offeringId: number;
      title: string;
      kind: ResourceKind;
      description: string;
      targets: string[];
      file: UploadFile | null;
      url: string;
    }) => {
      const form = new FormData();
      form.append("offering_id", String(input.offeringId));
      form.append("title", input.title);
      form.append("kind", input.kind);
      form.append("description", input.description);
      input.targets.forEach((t) => form.append("targets", t));
      if (input.file) appendFile(form, "file", input.file);
      else form.append("url", input.url);
      return apiFetch<Resource>("/api/resources", { method: "POST", body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
}

/** Change details, upload a new version, archive or restore: the resource comes back updated. */
export function useManageResource(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      change:
        | { kind: "details"; title: string; description: string; resourceKind: ResourceKind; url: string | null }
        | { kind: "version"; file: UploadFile; note: string }
        | { kind: "archive" | "restore" },
    ) => {
      if (change.kind === "details") {
        return apiFetch<Resource>(`/api/resources/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ title: change.title, description: change.description, kind: change.resourceKind, url: change.url }),
        });
      }
      if (change.kind === "version") {
        const form = new FormData();
        appendFile(form, "file", change.file);
        form.append("note", change.note);
        return apiFetch<Resource>(`/api/resources/${id}/versions`, { method: "POST", body: form });
      }
      return apiFetch<Resource>(`/api/resources/${id}/${change.kind}`, { method: "POST" });
    },
    onSuccess: (r) => {
      qc.setQueryData(["resources", "one", id], r);
      qc.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}
