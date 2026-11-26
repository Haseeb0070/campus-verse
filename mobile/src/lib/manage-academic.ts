import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { CourseColor } from "./types";

/*
 * Manage → Sections & subjects: terms, departments and programs, courses, sections (groups of
 * students; the API calls them cohorts) and subjects (a course taught to a section in a term).
 * Ported from web/src/lib/structure.ts, with the same query keys so both stay in step.
 */

export interface Term {
  id: number;
  name: string;
  code: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
}

export interface Department {
  id: number;
  name: string;
  code: string;
  courses: number;
}

export interface Program {
  id: number;
  name: string;
  code: string;
  department_id: number;
}

export interface CourseRow {
  id: number;
  code: string;
  title: string;
  color: CourseColor;
  credit_hours: number;
  is_active: boolean;
  department_id: number;
  department: string;
}

export interface Structure {
  is_admin: boolean;
  terms: Term[];
  departments: Department[];
  programs: Program[];
  courses: CourseRow[];
  colors: CourseColor[];
}

/** A subject: a course taught to one section in one term. */
export interface SectionRow {
  id: number;
  code: string;
  status: "active" | "archived";
  course_id: number;
  course_code: string;
  course_title: string;
  color: CourseColor;
  program: string | null;
  program_id: number | null;
  /** The section (group of students) this subject is taught to. */
  cohort_id: number | null;
  cohort: string | null;
  term: string;
  teachers: string[];
  students: number;
}

export interface StructurePerson {
  id: number;
  name: string;
  email: string;
  initials: string;
}

export interface SectionDetail extends SectionRow {
  teacher_list: (StructurePerson & { role: "lead" | "assistant" })[];
  student_list: (StructurePerson & { status: "active" | "dropped" | "completed" })[];
}

/** A section: a group of students who study together ("BS CS · 2024–2028 · Morning · A"). */
export interface CohortRow {
  id: number;
  code: string;
  label: string;
  name: string;
  shift: "" | "morning" | "evening";
  start_year: number | null;
  end_year: number | null;
  program_id: number | null;
  program: string | null;
  status: "active" | "archived";
  students: number;
  /** This term's. */
  subjects: number;
  cr: string | null;
  gr: string | null;
}

export interface CohortDetail extends CohortRow {
  term_id: number | null;
  term: string | null;
  can_manage: boolean;
  members: (StructurePerson & { status: "active" | "left"; role: "cr" | "gr" | null })[];
  subject_list: {
    id: number;
    course_code: string;
    course_title: string;
    color: CourseColor;
    status: "active" | "archived";
    teachers: string[];
    students: number;
  }[];
  reps: { student_id: number; role: "cr" | "gr"; name: string; chosen_by: string }[];
}

export const structureKey = ["manage", "structure"] as const;
export const cohortsKey = ["manage", "cohorts"] as const;

/** Admins and department coordinators may use these screens; the API limits coordinators. */
export function canManageAcademic(roles: string[] | undefined) {
  return !!roles?.some((r) => r === "institution_admin" || r === "department_coordinator");
}

export function useStructure(enabled = true) {
  return useQuery({ queryKey: structureKey, queryFn: () => apiFetch<Structure>("/api/manage/structure"), enabled });
}

export function useSections(termId: number | null) {
  return useQuery({
    queryKey: [...structureKey, "sections", termId],
    queryFn: () => apiFetch<SectionRow[]>(`/api/manage/structure/sections?term_id=${termId}`),
    enabled: termId !== null,
  });
}

export function useSectionDetail(id: number, enabled = true) {
  return useQuery({
    queryKey: [...structureKey, "section", id],
    queryFn: () => apiFetch<SectionDetail>(`/api/manage/structure/sections/${id}`),
    enabled,
  });
}

export function usePersonSearch(kind: "student" | "teacher", q: string, enabled: boolean) {
  return useQuery({
    queryKey: [...structureKey, "people", kind, q],
    queryFn: () => apiFetch<StructurePerson[]>(`/api/manage/structure/people?kind=${kind}&q=${encodeURIComponent(q)}`),
    enabled,
  });
}

export function useCohorts(termId: number | null, status: "active" | "archived" = "active", enabled = true) {
  return useQuery({
    queryKey: [...cohortsKey, "list", termId, status],
    queryFn: () => apiFetch<CohortRow[]>(`/api/manage/sections?status=${status}${termId ? `&term_id=${termId}` : ""}`),
    enabled,
  });
}

export function useCohort(id: number, termId: number | null, enabled = true) {
  return useQuery({
    queryKey: [...cohortsKey, id, termId],
    queryFn: () => apiFetch<CohortDetail>(`/api/manage/sections/${id}${termId ? `?term_id=${termId}` : ""}`),
    enabled,
  });
}

type Call = { method: string; path: string; body?: unknown };
const send = (url: string, c: Call) =>
  apiFetch<unknown>(url, { method: c.method, body: c.body === undefined ? undefined : JSON.stringify(c.body) });

/** Saves under /api/manage/structure (terms, departments, programs, courses, new subjects). */
export function useStructureSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: Call) => send(`/api/manage/structure${c.path}`, c),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: structureKey });
      await qc.invalidateQueries({ queryKey: cohortsKey });
    },
  });
}

/** Adds a section, or (with `id`) changes one. */
export function useSaveCohort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: unknown }) =>
      apiFetch<unknown>(id ? `/api/manage/sections/${id}` : "/api/manage/sections", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: cohortsKey });
      await qc.invalidateQueries({ queryKey: structureKey });
    },
  });
}

/** Calls one section's API (members, CR/GR, edit) and keeps what came back. */
export function useCohortCall(id: number, termId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: Call) => {
      const term = termId ? `${c.path.includes("?") ? "&" : "?"}term_id=${termId}` : "";
      return send(`/api/manage/sections/${id}${c.path}${term}`, c) as Promise<CohortDetail>;
    },
    onSuccess: (saved) => {
      qc.setQueryData([...cohortsKey, id, termId], saved);
      qc.invalidateQueries({ queryKey: [...cohortsKey, "list"] });
      qc.invalidateQueries({ queryKey: [...structureKey, "sections"] });
    },
  });
}

/** Calls one subject's API (teachers, students, details) and keeps what came back. */
export function useSectionCall(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: Call) => send(`/api/manage/structure/sections/${id}${c.path}`, c) as Promise<SectionDetail>,
    onSuccess: (saved) => {
      qc.setQueryData([...structureKey, "section", id], saved);
      qc.invalidateQueries({ queryKey: [...structureKey, "sections"] });
      qc.invalidateQueries({ queryKey: cohortsKey });
    },
  });
}

export interface NextSemesterResult {
  sections_copied: number;
  teachers_copied: number;
  students_carried: number;
  sections_closed: number;
}

/** Starts the semester after the current one. */
export function useNextSemester(currentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      code: string;
      starts_on: string;
      ends_on: string;
      copy_sections: boolean;
      copy_teachers: boolean;
      carry_students: boolean;
      close_old: boolean;
      make_current: boolean;
    }) =>
      apiFetch<NextSemesterResult>(`/api/manage/structure/terms/${currentId}/next`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** The institution's attendance switches (admins). */
export function useAttendanceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { attendance_enabled: boolean; attendance_visible_to_students: boolean }) =>
      apiFetch<unknown>("/api/attendance/settings", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

/** A Date as YYYY-MM-DD on the phone's clock. */
export function isoDay(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
