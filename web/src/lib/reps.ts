"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";

/** CR / GR: students who act for their class (apps.classreps on the API). */
export type RepRole = "cr" | "gr";

export interface RepsMine {
  /** Section id -> role, where this person is CR or GR. */
  sections: Record<string, RepRole>;
  /** Teachers: CR/GR changes to their lectures go through without asking them first. */
  without_approval: boolean;
  /** Teachers: CR/GRs they took the power back from ("I didn't know"). */
  blocked: { id: number; name: string }[];
}

export type RepStage = "cr_approval" | "teacher_approval" | "applied" | "declined" | "expired" | "undone";

export interface RepRequest {
  id: number;
  action: "cancel" | "shift" | "attendance";
  stage: RepStage;
  role: RepRole;
  requester: string;
  requester_id: number;
  course_code: string;
  course_title: string;
  section_code: string;
  date: string;
  starts_at: string | null;
  new_date: string | null;
  new_starts_at: string | null;
  new_ends_at: string | null;
  note: string;
  created_at: string;
  teacher_reply: "" | "known" | "unknown";
  decided_by: string;
  can_decide: boolean;
  can_reply: boolean;
}

export function useRepsMine(enabled = true) {
  return useQuery({
    queryKey: ["reps", "mine"],
    queryFn: () => apiFetch<RepsMine>("/api/reps/mine"),
    staleTime: 60_000,
    enabled,
  });
}

export function useRepRequests() {
  return useRepRequestsIf(true);
}

export function useRepRequestsIf(enabled: boolean) {
  return useQuery({
    queryKey: ["reps", "requests"],
    queryFn: () => apiFetch<RepRequest[]>("/api/reps/requests"),
    refetchInterval: 60_000,
    enabled,
  });
}

/** Approve / decline (teacher or CR), or answer "Did you know?" (teacher). */
export function useRepAnswer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind, yes }: { id: number; kind: "decide" | "reply"; yes: boolean }) =>
      apiFetch<RepRequest>(`/api/reps/requests/${id}/${kind}`, {
        method: "POST",
        body: JSON.stringify(kind === "decide" ? { approve: yes } : { known: yes }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reps"] });
      qc.invalidateQueries({ queryKey: ["timetable"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** "Cancelled on CR call" and the like, in plain words. */
export function repSummary(r: RepRequest) {
  const role = r.role.toUpperCase();
  if (r.action === "cancel") return `${r.requester} (${role}) cancels ${r.course_title}`;
  if (r.action === "shift") return `${r.requester} (${role}) shifts ${r.course_title}`;
  return `${r.requester} (${role}) took attendance for ${r.course_title}`;
}

export const stageLabel: Record<RepStage, string> = {
  cr_approval: "Waiting for a CR",
  teacher_approval: "Waiting for the teacher",
  applied: "Done",
  declined: "Declined",
  expired: "Lapsed (not approved in time)",
  undone: "Undone by the teacher",
};
