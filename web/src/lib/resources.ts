"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { CourseColor, StoredFileInfo } from "./types";

export type ResourceKind = "slides" | "notes" | "reading" | "reference" | "other";

export const kindLabels: Record<ResourceKind, string> = {
  slides: "Lecture slides",
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
  color: CourseColor;
  term: string;
  audiences: string[];
  url: string;
  file: StoredFileInfo | null;
  version: number;
  shared_by: string;
  created_at: string;
  updated_at: string;
  can_manage: boolean;
  versions: ResourceVersion[];
}

export interface ShareCourse {
  offering_id: number;
  course_code: string;
  course_title: string;
  color: CourseColor;
  term: string;
  whole_course: boolean;
  sections: { key: string; code: string; reach: number }[];
}

export function fileUrl(fileId: number) {
  return `/api/resources/files/${fileId}`;
}

/** Everything you can see, archived included; the page filters locally so it feels instant. */
export function useResources() {
  return useQuery({
    queryKey: ["resources"],
    queryFn: () => apiFetch<Resource[]>("/api/resources?status=all"),
  });
}

export function useResource(id: number) {
  return useQuery({
    queryKey: ["resources", id],
    queryFn: () => apiFetch<Resource>(`/api/resources/${id}`),
  });
}

export function useShareOptions(enabled = true) {
  return useQuery({
    queryKey: ["resources", "options"],
    queryFn: () =>
      apiFetch<{ courses: ShareCourse[]; accept: string; max_mb: number }>("/api/resources/options"),
    staleTime: 5 * 60_000,
    enabled,
  });
}
