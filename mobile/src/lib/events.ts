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

export function useEvent(id: number, enabled = true) {
  return useQuery({
    queryKey: ["events", "one", id],
    queryFn: () => apiFetch<CampusEvent>(`/api/events/${id}`),
    enabled,
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

/* ---------- Organising (teachers, staff) ---------- */

export type EventMode = CampusEvent["mode"];

export const MODE_LABEL: Record<EventMode, string> = {
  in_person: "In person",
  online: "Online",
  hybrid: "Both",
};

/** One of each category, singular, for the form. */
export const CATEGORY_ONE: Record<EventCategory, string> = {
  exam: "Exam",
  holiday: "Holiday",
  seminar: "Seminar",
  workshop: "Workshop",
  event: "Campus event",
  deadline: "Deadline",
};

export interface EventPayload {
  title: string;
  description: string;
  category: EventCategory;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  mode: EventMode;
  location: string;
  online_url: string;
  registration: boolean;
  capacity: number | null;
  registration_closes_at: string | null;
  /** Only when creating: audiences are chosen once. */
  targets?: string[];
}

export interface Attendee {
  id: number;
  name: string;
  email: string;
  initials: string;
  status: "going" | "waitlisted";
  signed_up_at: string;
}

/** Who this person may put events in front of; empty for anyone who can't add events. */
export function useEventAudiences() {
  return useQuery({
    queryKey: ["events", "audiences"],
    queryFn: () => apiFetch<{ key: string; label: string; group: string; detail: string }[]>("/api/events/audiences"),
    staleTime: 5 * 60_000,
  });
}

export function useAttendees(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ["events", "one", id, "attendees"],
    queryFn: () => apiFetch<Attendee[]>(`/api/events/${id}/attendees`),
    enabled,
  });
}

/** Add an event (no id) or change one. */
export function useSaveEvent(id?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EventPayload) =>
      apiFetch<CampusEvent>(id ? `/api/events/${id}` : "/api/events", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (event) => {
      qc.setQueryData(["events", "one", event.id], event);
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

/** Cancel an event (with a reason everyone sees), or move it to another start keeping its length. */
export function useEventAction(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: { kind: "cancel"; reason: string } | { kind: "move"; starts_at: string; reason: string }) =>
      apiFetch<CampusEvent>(`/api/events/${id}/${action.kind}`, {
        method: "POST",
        body: JSON.stringify(action.kind === "cancel" ? { reason: action.reason } : { starts_at: action.starts_at, reason: action.reason }),
      }),
    onSuccess: (event) => {
      qc.setQueryData(["events", "one", id], event);
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
}
