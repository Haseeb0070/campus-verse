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
  marks: { student_id: number; name: string; initials: string; status: Mark | null; note: string }[];
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
