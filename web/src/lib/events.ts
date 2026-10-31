"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { Audience } from "./types";

export type EventCategory = "exam" | "holiday" | "seminar" | "workshop" | "event" | "deadline";
export type EventMode = "in_person" | "online" | "hybrid";

export const categoryLabels: Record<EventCategory, string> = {
  exam: "Exam",
  holiday: "Holiday",
  seminar: "Seminar",
  workshop: "Workshop",
  event: "Campus event",
  deadline: "Deadline",
};

export const modeLabels: Record<EventMode, string> = {
  in_person: "In person",
  online: "Online",
  hybrid: "Both",
};

/** Tint and text per category; every pair passes 4.5:1 in both themes. */
export const categoryTone: Record<EventCategory, string> = {
  exam: "bg-danger/12 text-danger-ink",
  holiday: "bg-success/12 text-success-ink",
  seminar: "bg-accent/12 text-accent-ink",
  workshop: "bg-accent/12 text-accent-ink",
  event: "bg-accent/12 text-accent-ink",
  deadline: "bg-warning/18 text-ink",
};

export const categoryDot: Record<EventCategory, string> = {
  exam: "bg-danger",
  holiday: "bg-success",
  seminar: "bg-accent",
  workshop: "bg-accent",
  event: "bg-accent",
  deadline: "bg-warning",
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
  mode: EventMode;
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
  my_status: "going" | "waitlisted" | null;
  my_waitlist_position: number | null;
}

export interface Attendee {
  id: number;
  name: string;
  email: string;
  initials: string;
  status: "going" | "waitlisted";
  signed_up_at: string;
}

export function useEvents(start: string, end: string) {
  const params = new URLSearchParams({ start, end });
  return useQuery({
    queryKey: ["events", start, end],
    queryFn: () => apiFetch<CampusEvent[]>(`/api/events?${params}`),
  });
}

export function useEvent(id: number) {
  return useQuery({
    queryKey: ["events", "one", id],
    queryFn: () => apiFetch<CampusEvent>(`/api/events/${id}`),
  });
}

export function useAttendees(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ["events", "one", id, "attendees"],
    queryFn: () => apiFetch<Attendee[]>(`/api/events/${id}/attendees`),
    enabled,
  });
}

export function useEventAudiences() {
  return useQuery({
    queryKey: ["events", "audiences"],
    queryFn: () => apiFetch<Audience[]>("/api/events/audiences"),
    staleTime: 5 * 60_000,
  });
}

/** "YYYY-MM-DD" of an instant in a time zone (the institution's, so everyone agrees on days). */
export function dayKey(iso: string | Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}
