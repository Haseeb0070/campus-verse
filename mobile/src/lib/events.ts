import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";

export type EventCategory = "exam" | "holiday" | "seminar" | "workshop" | "event" | "deadline";

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  exam: "Exams",
  holiday: "Holidays",
  seminar: "Seminars",
  workshop: "Workshops",
  event: "Events",
  deadline: "Deadlines",
};

export interface CampusEvent {
  id: number;
  title: string;
  description: string;
  category: EventCategory;
  category_label: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  mode: "in_person" | "online" | "hybrid";
  location: string;
  online_url: string;
  registration: boolean;
  capacity: number | null;
  registration_closes_at: string | null;
  registration_open: boolean;
  going: number;
  waiting: number;
  status: "scheduled" | "cancelled";
  cancel_reason: string;
  organizer: string;
  audiences: string[];
  can_manage: boolean;
  /** "going", "waitlisted", or null when not signed up. */
  my_status: "going" | "waitlisted" | null;
  my_waitlist_position: number | null;
}

/** Events overlapping [start, end) — instants, ISO strings. */
export function useEvents(start: string, end: string, enabled = true) {
  return useQuery({
    queryKey: ["events", start, end],
    queryFn: () =>
      apiFetch<CampusEvent[]>(`/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
    enabled,
  });
}

export function useEvent(id: number) {
  return useQuery({
    queryKey: ["events", "one", id],
    queryFn: () => apiFetch<CampusEvent>(`/api/events/${id}`),
  });
}

/** Sign up (a place, or a spot on the waitlist when it's full), or give the place back. */
export function useRegistration(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (join: boolean) =>
      apiFetch<CampusEvent>(`/api/events/${id}/registration`, { method: join ? "POST" : "DELETE" }),
    onSuccess: (event) => {
      qc.setQueryData(["events", "one", id], event);
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
}
