"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { CourseColor } from "./types";

export type Mark = "present" | "late" | "absent" | "excused";

export const markLabels: Record<Mark, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
};

export interface Summary {
  sessions: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number | null;
}

export interface Sheet {
  section_id: number;
  title: string;
  date: string;
  meeting_id: number | null;
  saved: boolean;
  taken_by: string | null;
  saved_at: string | null;
  locked: boolean;
  can_correct: boolean;
  /** Not taken for this class, but another register for the subject that day blocks a new one. */
  taken_elsewhere: { meeting_id: number | null; time: string | null; taken_by: string } | null;
  marks: SheetMark[];
}

export interface SheetMark {
  student_id: number;
  name: string;
  initials: string;
  status: Mark | null;
  note: string;
  college_roll: string;
  university_roll: string;
}

export interface QuickMatch {
  ids: number[];
  notFound: string[];
  /** A name that fits more than one student: type more of it, or use the roll number. */
  ambiguous: string[];
}

/**
 * Finds students from what someone typed: college roll numbers, university roll numbers or names,
 * separated by commas, spaces or new lines ("3 7 12", "126201, 126215", "Ali Raza, Hamza").
 * A number is tried as a college roll first, then as a university roll; anything with letters is a
 * name (or part of one) and must fit exactly one student.
 */
export function matchStudents(text: string, marks: SheetMark[]): QuickMatch {
  const ids = new Set<number>();
  const notFound: string[] = [];
  const ambiguous: string[] = [];
  const pieces = text.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
  for (const piece of pieces) {
    const tokens = /^[\d\s-]+$/.test(piece) ? piece.split(/\s+/).filter(Boolean) : [piece];
    for (const token of tokens) {
      if (/^\d+$/.test(token)) {
        const n = String(Number(token));
        const hit =
          marks.find((m) => m.college_roll && String(Number(m.college_roll)) === n) ??
          marks.find((m) => m.university_roll === token);
        if (hit) ids.add(hit.student_id);
        else notFound.push(token);
        continue;
      }
      const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
        for (const m of marks) {
          const roll = Number(m.college_roll);
          if (m.college_roll && roll >= a && roll <= b) ids.add(m.student_id);
        }
        continue;
      }
      const want = token.toLowerCase().replace(/\s+/g, " ");
      const exact = marks.filter((m) => m.name.toLowerCase() === want);
      const hits = exact.length ? exact : marks.filter((m) => m.name.toLowerCase().includes(want));
      if (hits.length === 1) ids.add(hits[0].student_id);
      else if (hits.length > 1) ambiguous.push(token);
      else notFound.push(token);
    }
  }
  return { ids: [...ids], notFound, ambiguous };
}

export interface Report {
  students: { student_id: number; name: string; initials: string; summary: Summary }[];
  sessions: { id: number; date: string; meeting_id: number | null; time: string | null; taken_by: string }[];
}

export interface CourseProgress {
  section_id: number;
  section_code: string;
  course_code: string;
  course_title: string;
  color: CourseColor;
  term: string;
  assignments: { id: number; title: string; max_points: number; points: string | null }[];
  points: string | null;
  max_points: number | null;
  grades_source: string;
  attendance: Summary | null;
  attendance_source: string | null;
}

export function useSheet(sectionId: number | null, day: string, meetingId: number | null) {
  const params = new URLSearchParams({ day });
  if (meetingId) params.set("meeting_id", String(meetingId));
  return useQuery({
    queryKey: ["attendance", "sheet", sectionId, day, meetingId],
    queryFn: () => apiFetch<Sheet>(`/api/attendance/sections/${sectionId}/sheet?${params}`),
    enabled: sectionId !== null && Boolean(day),
  });
}

export function useReport(sectionId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["attendance", "report", sectionId],
    queryFn: () => apiFetch<Report>(`/api/attendance/sections/${sectionId}/report`),
    enabled: enabled && sectionId !== null,
  });
}

export function useProgress() {
  return useQuery({ queryKey: ["progress"], queryFn: () => apiFetch<CourseProgress[]>("/api/progress") });
}
