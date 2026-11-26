import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

/* The term summary for one subject (web/src/lib/attendance.ts). The register itself is in teaching.ts. */

export interface Summary {
  sessions: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number | null;
}

export interface Report {
  students: { student_id: number; name: string; initials: string; summary: Summary }[];
  sessions: { id: number; date: string; meeting_id: number | null; time: string | null; taken_by: string }[];
}

export function useReport(sectionId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["attendance", "report", sectionId],
    queryFn: () => apiFetch<Report>(`/api/attendance/sections/${sectionId}/report`),
    enabled: enabled && sectionId !== null,
  });
}

/** "2026-11-26" for a Date's own calendar day. */
export function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A plain date as a Date at noon, for the date field. */
export function dayToDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
