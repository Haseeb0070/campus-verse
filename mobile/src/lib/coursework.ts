import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, appendFile, type UploadFile } from "./api";
import type { Assignment, AssignmentRosterRow, Roster, SectionSummary } from "./types";

/*
 * What teachers do with their subjects on the phone: set and change assignments, mark them,
 * release marks, and see who's in each subject. Same endpoints as the website
 * (web/src/components/assignment-form.tsx, web/src/app/(app)/assignments/[id]).
 */

/** The subjects this person teaches. */
export function useTeaching(enabled = true) {
  return useQuery({
    queryKey: ["sections", "teaching"],
    queryFn: () => apiFetch<SectionSummary[]>("/api/sections/teaching"),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useRoster(sectionId: number) {
  return useQuery({
    queryKey: ["sections", sectionId, "roster"],
    queryFn: () => apiFetch<Roster>(`/api/sections/${sectionId}/roster`),
  });
}

export type RepRow = { student_id: number; role: "cr" | "gr"; name: string; chosen_by: string };

/** The subject's CR and GR; 403 for anyone who may not see them, which just hides them. */
export function useSectionReps(sectionId: number) {
  return useQuery({
    queryKey: ["reps", "section", sectionId],
    queryFn: () => apiFetch<RepRow[]>(`/api/reps/sections/${sectionId}`),
    retry: false,
  });
}

export function useAssignmentRoster(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ["assignments", id, "roster"],
    queryFn: () => apiFetch<AssignmentRosterRow[]>(`/api/assignments/${id}/submissions`),
    enabled,
  });
}

export interface AssignmentDetails {
  title: string;
  instructions: string;
  available_from: string;
  due_at: string;
  submission_type: "text" | "file" | "both";
  max_points: number;
  max_attempts: number;
  allow_late: boolean;
  late_until: string | null;
}

/**
 * Creates or changes an assignment, then its files: removes the ones taken off, uploads new
 * ones, and publishes a draft when asked. Returns the assignment's id.
 */
export function useSaveAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      existing,
      sectionId,
      details,
      publish,
      removed,
      files,
    }: {
      existing?: Assignment;
      sectionId: number | null;
      details: AssignmentDetails;
      publish: boolean;
      removed: number[];
      files: UploadFile[];
    }) => {
      let id: number;
      if (existing) {
        await apiFetch(`/api/assignments/${existing.id}`, { method: "PATCH", body: JSON.stringify(details) });
        id = existing.id;
        for (const fileId of removed) {
          await apiFetch(`/api/assignments/${id}/attachments/${fileId}`, { method: "DELETE" });
        }
        if (publish && existing.status === "draft") {
          await apiFetch(`/api/assignments/${id}/publish`, { method: "POST" });
        }
      } else {
        const created = await apiFetch<Assignment>("/api/assignments", {
          method: "POST",
          body: JSON.stringify({ section_id: sectionId, ...details, publish }),
        });
        id = created.id;
      }
      for (const f of files) {
        const form = new FormData();
        appendFile(form, "file", f);
        await apiFetch(`/api/assignments/${id}/attachments`, { method: "POST", body: form });
      }
      return id;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["assignments"] }),
  });
}

/** Publish a draft, or delete an assignment nobody has handed in yet. */
export function useAssignmentAction(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: "publish" | "delete" | "release") =>
      apiFetch(
        action === "delete" ? `/api/assignments/${id}` : `/api/assignments/${id}/${action}`,
        { method: action === "delete" ? "DELETE" : "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignments"] }),
  });
}

export function useGrade(assignmentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, points, feedback }: { studentId: number; points: number; feedback: string }) =>
      apiFetch(`/api/assignments/${assignmentId}/grades/${studentId}`, {
        method: "PUT",
        body: JSON.stringify({ points, feedback }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignments", assignmentId] }),
  });
}
