import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, appendFile, type UploadFile } from "./api";
import type { Assignment, Me, Notice, Occurrence, SubmissionInfo } from "./types";

export function useMe(enabled = true) {
  return useQuery({ queryKey: ["me"], queryFn: () => apiFetch<Me>("/api/me"), staleTime: 60_000, enabled });
}

export function useTimetable(start: string | null, days: number) {
  // Built by hand: React Native's URLSearchParams lacks most of its methods.
  const params = `days=${days}${start ? `&start=${start}` : ""}`;
  return useQuery({
    queryKey: ["timetable", start, days],
    queryFn: () => apiFetch<Occurrence[]>(`/api/timetable?${params}`),
    enabled: start !== null,
  });
}

export function useNextClass() {
  return useQuery({
    queryKey: ["timetable", "next"],
    // 204 when nothing is coming up; a query must not resolve to undefined.
    queryFn: async () => (await apiFetch<Occurrence | undefined>("/api/timetable/next")) ?? null,
    refetchInterval: 60_000,
  });
}

export function useNotices(limit = 50) {
  return useQuery({
    queryKey: ["notices", limit],
    queryFn: () => apiFetch<Notice[]>(`/api/notices?limit=${limit}`),
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

export function useUploadRules() {
  return useQuery({
    queryKey: ["upload-rules"],
    queryFn: () => apiFetch<{ accept: string; max_mb: number }>("/api/assignments/upload-rules"),
    staleTime: Infinity,
  });
}

export function useSubmit(assignmentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ text, files }: { text: string; files: UploadFile[] }) => {
      const form = new FormData();
      form.append("text", text);
      files.forEach((f) => appendFile(form, "files", f));
      return apiFetch<SubmissionInfo>(`/api/assignments/${assignmentId}/submissions`, {
        method: "POST",
        body: form,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignments"] }),
  });
}

export interface GradeLine {
  id: number;
  title: string;
  max_points: number;
  points: string | null;
}

export interface CourseProgress {
  section_id: number;
  section_code: string;
  course_code: string;
  course_title: string;
  color: string;
  term: string;
  assignments: GradeLine[];
  points: string | null;
  max_points: number | null;
  grades_source: string;
  attendance: { sessions: number; present: number; late: number; absent: number; excused: number; rate: number | null } | null;
  attendance_source: string | null;
}

export function useProgress() {
  return useQuery({
    queryKey: ["progress"],
    queryFn: () => apiFetch<CourseProgress[]>("/api/progress"),
  });
}

export interface SearchHit {
  id: number;
  title: string;
  snippet: string;
  link: string;
  date: string | null;
  course: string | null;
  color: string | null;
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: ["search", q],
    queryFn: () =>
      apiFetch<{ query: string; total: number; results: Record<string, SearchHit[]> }>(
        `/api/search?q=${encodeURIComponent(q)}`,
      ),
    enabled: q.trim().length >= 2,
    placeholderData: (previous) => previous,
  });
}
