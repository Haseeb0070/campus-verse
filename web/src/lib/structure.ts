"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { CourseColor } from "./types";

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

export const structureKey = ["manage", "structure"] as const;

export function useStructure() {
  return useQuery({ queryKey: structureKey, queryFn: () => apiFetch<Structure>("/api/manage/structure") });
}

export function useSections(termId: number | null) {
  return useQuery({
    queryKey: [...structureKey, "sections", termId],
    queryFn: () => apiFetch<SectionRow[]>(`/api/manage/structure/sections?term_id=${termId}`),
    enabled: termId !== null,
  });
}

export function useSectionDetail(id: number) {
  return useQuery({
    queryKey: [...structureKey, "section", id],
    queryFn: () => apiFetch<SectionDetail>(`/api/manage/structure/sections/${id}`),
  });
}

export function usePersonSearch(kind: "student" | "teacher", q: string, enabled: boolean) {
  return useQuery({
    queryKey: [...structureKey, "people", kind, q],
    queryFn: () =>
      apiFetch<StructurePerson[]>(`/api/manage/structure/people?kind=${kind}&q=${encodeURIComponent(q)}`),
    enabled,
  });
}

/** A section: a group of students who study together ("BS CS · 2024–2028 · Morning · A"). The
 *  API calls it a cohort; people see "Section". Each term it has subjects (SectionRow). */
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

export const cohortsKey = ["manage", "cohorts"] as const;

export function useCohorts(termId: number | null, status: "active" | "archived" = "active") {
  return useQuery({
    queryKey: [...cohortsKey, "list", termId, status],
    queryFn: () => apiFetch<CohortRow[]>(`/api/manage/sections?status=${status}${termId ? `&term_id=${termId}` : ""}`),
  });
}

export function useCohort(id: number, termId: number | null) {
  return useQuery({
    queryKey: [...cohortsKey, id, termId],
    queryFn: () => apiFetch<CohortDetail>(`/api/manage/sections/${id}${termId ? `?term_id=${termId}` : ""}`),
  });
}
