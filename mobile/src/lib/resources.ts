import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
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
