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
