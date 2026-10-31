"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { Me, Notice, Occurrence } from "./types";

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

export function useNotices(limit = 50) {
  return useQuery({
    queryKey: ["notices", limit],
    queryFn: () => apiFetch<Notice[]>(`/api/notices?limit=${limit}`),
  });
}
