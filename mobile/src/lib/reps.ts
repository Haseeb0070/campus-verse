import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";

/**
 * CR / GR: students an admin names to act for their section (apps.classreps on the API). They
 * can cancel or shift its lectures in every subject; each subject's teacher is told, or approves
 * first. Keep in step with web/src/lib/reps.ts.
 */
export type RepRole = "cr" | "gr";

export interface RepsMine {
  /** Subject id -> role, where this person is CR or GR. */
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

export function useRepRequests(enabled = true) {
  return useQuery({
    queryKey: ["reps", "requests"],
    queryFn: () => apiFetch<RepRequest[]>("/api/reps/requests"),
    refetchInterval: 60_000,
    enabled,
  });
}

/** Requests waiting on this person: approve/decline, or "Did you know?". */
export function waitingOn(list: RepRequest[] | undefined) {
  return (list ?? []).filter((r) => r.can_decide || r.can_reply);
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["reps"] });
    qc.invalidateQueries({ queryKey: ["timetable"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
}

/** Approve / decline (teacher or CR), or answer "Did you know?" (teacher). */
export function useRepAnswer() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, kind, yes }: { id: number; kind: "decide" | "reply"; yes: boolean }) =>
      apiFetch<RepRequest>(`/api/reps/requests/${id}/${kind}`, {
        method: "POST",
        body: JSON.stringify(kind === "decide" ? { approve: yes } : { known: yes }),
      }),
    onSuccess: refresh,
  });
}

export interface RepChangeIn {
  meeting_id: number;
  date: string;
  action: "cancel" | "shift";
  new_date?: string | null;
  new_starts_at?: string | null;
  new_ends_at?: string | null;
  note?: string;
}

/** A CR/GR cancels or shifts one lecture. It may go through at once, or wait for approval. */
export function useRepChange() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (change: RepChangeIn) =>
      apiFetch<RepRequest>("/api/reps/requests", { method: "POST", body: JSON.stringify(change) }),
    onSuccess: refresh,
  });
}

/** Teachers: whether CR/GR changes need their approval, and taking a CR/GR back on. */
export function useRepSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { without_approval: boolean } | { unblock: number }) =>
      "unblock" in body
        ? apiFetch<RepsMine>(`/api/reps/blocks/${body.unblock}`, { method: "DELETE" })
        : apiFetch<RepsMine>("/api/reps/settings", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (data) => qc.setQueryData(["reps", "mine"], data),
  });
}

/** "Ayesha (CR) cancels Data Structures" and the like. */
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
