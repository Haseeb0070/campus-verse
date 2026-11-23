import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";

export type Mark = "present" | "late" | "absent" | "excused";

export interface SheetRow {
  student_id: number;
  name: string;
  initials: string;
  status: Mark | null;
  note: string;
}

export interface Sheet {
  section_id: number;
  title: string;
  date: string;
  meeting_id: number | null;
  saved: boolean;
  taken_by: string | null;
  saved_at: string | null;
  /** Past the 48-hour window for the teacher; a coordinator can still correct it. */
  locked: boolean;
  can_correct: boolean;
  marks: SheetRow[];
}

export interface Room {
  id: number;
  code: string;
  building: string;
}

export function useSheet(sectionId: number, day: string, meetingId?: number) {
  return useQuery({
    queryKey: ["attendance", sectionId, day, meetingId ?? null],
    queryFn: () =>
      apiFetch<Sheet>(
        `/api/attendance/sections/${sectionId}/sheet?day=${day}${meetingId ? `&meeting_id=${meetingId}` : ""}`,
      ),
  });
}

export function useSaveSheet(sectionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { date: string; meeting_id: number | null; marks: { student_id: number; status: Mark; note: string }[] }) =>
      apiFetch<Sheet>(`/api/attendance/sections/${sectionId}/sheet`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: (sheet) => {
      qc.setQueryData(["attendance", sectionId, sheet.date, sheet.meeting_id], sheet);
      qc.invalidateQueries({ queryKey: ["progress"] });
    },
  });
}

export function useRooms(enabled = true) {
  return useQuery({
    queryKey: ["rooms"],
    queryFn: () => apiFetch<Room[]>("/api/timetable/rooms"),
    staleTime: 10 * 60_000,
    enabled,
  });
}

export interface ChangeIn {
  meeting_id: number;
  date: string;
  status: "cancelled" | "moved" | "room_changed";
  new_date?: string | null;
  new_starts_at?: string | null;
  new_ends_at?: string | null;
  new_room_id?: number | null;
  note?: string;
  /** Tell the section now (a notification and a notice). */
  notify?: boolean;
}

/** Cancel, move or re-room one class, or undo a change; the timetable and notices refresh. */
export function useClassChange() {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ["timetable"] });
    qc.invalidateQueries({ queryKey: ["notices"] });
  };
  const make = useMutation({
    mutationFn: (change: ChangeIn) => apiFetch("/api/timetable/changes", { method: "POST", body: JSON.stringify(change) }),
    onSuccess: done,
  });
  const undo = useMutation({
    mutationFn: (changeId: number) => apiFetch(`/api/timetable/changes/${changeId}`, { method: "DELETE" }),
    onSuccess: done,
  });
  return { make, undo };
}
