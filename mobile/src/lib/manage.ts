import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { useMe } from "./queries";

/*
 * Manage (the admin area): people, requests, the audit log and department people. The same API
 * as the website's Manage pages (/api/manage/...).
 */

export type { Overview } from "./queries";
export { useOverview } from "./queries";

export type PersonKind = "student" | "teacher" | "staff";

export interface ManagedPerson {
  id: number;
  email: string;
  name: string;
  first_name: string;
  last_name: string;
  external_id: string;
  two_step: boolean;
  initials: string;
  kind: PersonKind;
  is_active: boolean;
  invited: boolean;
  last_login: string | null;
  sections: number;
  roles: { id: number; role: string; department: string | null }[];
}

export interface AuditEntry {
  id: number;
  created_at: string;
  action: string;
  actor: string | null;
  target_type: string;
  target_id: string;
  changes: Record<string, unknown>;
}

export interface ManagedCorrection {
  id: number;
  topic: "name" | "email" | "enrollment" | "other";
  topic_label: string;
  details: string;
  status: "open" | "resolved" | "declined";
  response: string;
  created_at: string;
  resolved_at: string | null;
  person: ManagedPerson;
}

export interface DeptPerson {
  id: number;
  name: string;
  email: string;
  kind: PersonKind;
  external_id: string;
  sections: number;
  last_login: string | null;
}

export const roleLabel: Record<string, string> = {
  institution_admin: "Institution admin",
  department_coordinator: "Coordinator",
  moderator: "Moderator",
};

/** Who may open what under Manage, the same rule as the website's Manage layout: admins get
 *  everything; department coordinators only Sections & subjects and their department pages. */
export function useManageAccess() {
  const me = useMe().data;
  const admin = !!me?.roles.includes("institution_admin");
  const coordinator = !!me?.roles.includes("department_coordinator");
  return { me, loaded: !!me, admin, coordinator };
}

/** A search box's text, settled for a moment before it's sent. */
export function useDebounced(value: string, ms = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

export function usePeople(q: string, kind: string, enabled = true) {
  const params = `q=${encodeURIComponent(q)}&kind=${encodeURIComponent(kind)}`;
  return useQuery({
    queryKey: ["manage", "people", q, kind],
    queryFn: () => apiFetch<ManagedPerson[]>(`/api/manage/people?${params}`),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useDepartments(enabled = true) {
  return useQuery({
    queryKey: ["manage", "departments"],
    queryFn: () => apiFetch<{ id: number; name: string; code: string }[]>("/api/manage/departments"),
    staleTime: 10 * 60_000,
    enabled,
  });
}

export function useAudit(action: string, enabled = true) {
  return useQuery({
    queryKey: ["manage", "audit", action],
    queryFn: () => apiFetch<AuditEntry[]>(`/api/manage/audit?action=${encodeURIComponent(action)}`),
    enabled,
  });
}

export function useCorrectionQueue(enabled = true) {
  return useQuery({
    queryKey: ["corrections", "queue", "open"],
    queryFn: () => apiFetch<ManagedCorrection[]>("/api/manage/corrections?status=open"),
    enabled,
  });
}

export function useResolveCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, response }: { id: number; status: "resolved" | "declined"; response: string }) =>
      apiFetch(`/api/manage/corrections/${id}/resolve`, { method: "POST", body: JSON.stringify({ status, response }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["corrections", "queue"] }),
  });
}

export function useDepartmentPeople(q: string, kind: string, enabled = true) {
  return useQuery({
    queryKey: ["manage", "department", "people", q, kind],
    queryFn: () =>
      apiFetch<DeptPerson[]>(`/api/manage/structure/department/people?q=${encodeURIComponent(q)}&kind=${kind}`),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Any change to a person or their roles: sends it, then refreshes everything under Manage. */
export function useManageAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, init }: { path: string; init?: RequestInit }) =>
      apiFetch<unknown>(path, init ?? { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["manage"] }),
  });
}
