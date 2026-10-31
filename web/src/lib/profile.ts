"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiError, apiFetch, ensureCsrfCookie } from "./api";
import type { ManagedPerson } from "./manage";

export type CorrectionTopic = "name" | "email" | "enrollment" | "other";

export const topicLabels: Record<CorrectionTopic, string> = {
  name: "My name",
  email: "My email",
  enrollment: "My courses or sections",
  other: "Something else",
};

export interface Correction {
  id: number;
  topic: CorrectionTopic;
  topic_label: string;
  details: string;
  status: "open" | "resolved" | "declined";
  response: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ManagedCorrection extends Correction {
  person: ManagedPerson;
}

export function useMyCorrections() {
  return useQuery({
    queryKey: ["corrections", "mine"],
    queryFn: () => apiFetch<Correction[]>("/api/me/corrections"),
  });
}

export function useCorrectionQueue(status: "open" | "all" = "open") {
  return useQuery({
    queryKey: ["corrections", "queue", status],
    queryFn: () => apiFetch<ManagedCorrection[]>(`/api/manage/corrections?status=${status}`),
  });
}

/** Changes the password through allauth. Returns an error message, or null on success. */
export async function changePassword(current: string, next: string): Promise<string | null> {
  await ensureCsrfCookie();
  try {
    await apiFetch("/_allauth/browser/v1/account/password/change", {
      method: "POST",
      body: JSON.stringify({ current_password: current, new_password: next }),
    });
    return null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      const errors = (err.body as { errors?: { message: string }[] } | null)?.errors;
      return errors?.[0]?.message ?? "That didn't work. Check your current password.";
    }
    if (err instanceof ApiError && err.status === 429) {
      return "Too many attempts. Wait a few minutes, then try again.";
    }
    return "Couldn't change your password. Try again.";
  }
}
