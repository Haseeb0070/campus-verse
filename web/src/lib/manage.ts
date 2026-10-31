"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface Overview {
  students: number;
  teachers: number;
  staff: number;
  invited: number;
  signed_in_week: number;
  active_people: number;
  sections: number;
  departments: number;
  pending_imports: number;
  room_clashes: { room: string; date: string; time: string; classes: string[] }[];
}

export interface ManagedPerson {
  id: number;
  email: string;
  name: string;
  initials: string;
  kind: "student" | "teacher" | "staff";
  is_active: boolean;
  invited: boolean;
  last_login: string | null;
  sections: number;
  roles: { id: number; role: string; department: string | null }[];
}

export interface ImportRow {
  line: number;
  status: "new" | "update" | "unchanged" | "error";
  section: string;
  day: string;
  start: string;
  end: string;
  room: string;
  kind: string;
  mode: string;
  changes: Record<string, [string, string]>;
  message: string;
  clash: string;
}

export interface ImportRun {
  id: number;
  kind: string;
  status: "preview" | "applied" | "discarded";
  file_name: string;
  term: string;
  created_at: string;
  created_by: string;
  applied_at: string | null;
  summary: {
    rows?: number;
    new?: number;
    update?: number;
    unchanged?: number;
    error?: number;
    clash?: number;
    not_in_file?: number;
  };
  result: { created?: number; updated?: number; skipped?: number };
  rows: ImportRow[] | null;
  not_in_file: string[] | null;
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

export const roleLabel: Record<string, string> = {
  institution_admin: "Institution admin",
  department_coordinator: "Coordinator",
  moderator: "Moderator",
};

export function useOverview() {
  return useQuery({ queryKey: ["manage", "overview"], queryFn: () => apiFetch<Overview>("/api/manage/overview") });
}

export function usePeople(q: string, kind: string) {
  const params = new URLSearchParams({ q, kind });
  return useQuery({
    queryKey: ["manage", "people", q, kind],
    queryFn: () => apiFetch<ManagedPerson[]>(`/api/manage/people?${params}`),
    placeholderData: (prev) => prev,
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["manage", "departments"],
    queryFn: () => apiFetch<{ id: number; name: string; code: string }[]>("/api/manage/departments"),
    staleTime: 10 * 60_000,
  });
}

export function useImports() {
  return useQuery({ queryKey: ["manage", "imports"], queryFn: () => apiFetch<ImportRun[]>("/api/manage/imports") });
}

export function useImportRun(id: number | null) {
  return useQuery({
    queryKey: ["manage", "imports", id],
    queryFn: () => apiFetch<ImportRun>(`/api/manage/imports/${id}`),
    enabled: id !== null,
  });
}

export function useAudit(action: string) {
  return useQuery({
    queryKey: ["manage", "audit", action],
    queryFn: () => apiFetch<AuditEntry[]>(`/api/manage/audit?action=${encodeURIComponent(action)}`),
  });
}
