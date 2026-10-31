"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type {
  Assignment,
  AssignmentRosterRow,
  Audience,
  Me,
  MyNotice,
  Notice,
  Occurrence,
  Room,
  Roster,
  SectionSummary,
} from "./types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => apiFetch<Me>("/api/me") });
}

export function useTimetable(start: string | null, days: number) {
  const params = new URLSearchParams({ days: String(days) });
  if (start) params.set("start", start);
  return useQuery({
    queryKey: ["timetable", start, days],
    queryFn: () => apiFetch<Occurrence[]>(`/api/timetable?${params}`),
  });
}

export function useNextClass() {
  return useQuery({
    queryKey: ["timetable", "next"],
    queryFn: () => apiFetch<Occurrence | undefined>("/api/timetable/next"),
    refetchInterval: 60_000,
  });
}

export function useAudiences() {
  return useQuery({
    queryKey: ["notices", "audiences"],
    queryFn: () => apiFetch<Audience[]>("/api/notices/audiences"),
    staleTime: 5 * 60_000,
  });
}

export function useReach(targets: string[]) {
  const params = new URLSearchParams();
  targets.forEach((t) => params.append("targets", t));
  return useQuery({
    queryKey: ["notices", "reach", [...targets].sort()],
    queryFn: () => apiFetch<{ people: number }>(`/api/notices/reach?${params}`),
    enabled: targets.length > 0,
  });
}

export function useMyNotices(enabled = true) {
  return useQuery({
    queryKey: ["notices", "mine"],
    queryFn: () => apiFetch<MyNotice[]>("/api/notices/mine"),
    enabled,
  });
}

export function useRooms(enabled = true) {
  return useQuery({
    queryKey: ["rooms"],
    queryFn: () => apiFetch<Room[]>("/api/timetable/rooms"),
    staleTime: 10 * 60_000,
    enabled,
  });
}

export function useTeaching() {
  return useQuery({
    queryKey: ["sections", "teaching"],
    queryFn: () => apiFetch<SectionSummary[]>("/api/sections/teaching"),
  });
}

export function useRoster(sectionId: number) {
  return useQuery({
    queryKey: ["sections", sectionId, "roster"],
    queryFn: () => apiFetch<Roster>(`/api/sections/${sectionId}/roster`),
  });
}

export function useAssignments() {
  return useQuery({
    queryKey: ["assignments"],
    queryFn: () => apiFetch<Assignment[]>("/api/assignments"),
  });
}

export function useAssignment(id: number) {
  return useQuery({
    queryKey: ["assignments", id],
    queryFn: () => apiFetch<Assignment>(`/api/assignments/${id}`),
  });
}

export function useAssignmentRoster(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ["assignments", id, "roster"],
    queryFn: () => apiFetch<AssignmentRosterRow[]>(`/api/assignments/${id}/submissions`),
    enabled,
  });
}

export function useUploadRules() {
  return useQuery({
    queryKey: ["upload-rules"],
    queryFn: () => apiFetch<{ accept: string; max_mb: number }>("/api/assignments/upload-rules"),
    staleTime: Infinity,
  });
}

export function useNotices(limit = 50) {
  return useQuery({
    queryKey: ["notices", limit],
    queryFn: () => apiFetch<Notice[]>(`/api/notices?limit=${limit}`),
  });
}
